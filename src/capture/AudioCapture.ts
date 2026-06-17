import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import ffmpegStatic from 'ffmpeg-static'

// In packaged app ffmpeg is copied to resources/ffmpeg.exe via extraResources.
// In dev, use ffmpeg-static directly.
const ffmpegPath: string = app.isPackaged
  ? join(process.resourcesPath, 'ffmpeg.exe')
  : (ffmpegStatic as unknown as string)

// =============================================================================
// AudioCapture — captures system audio (WASAPI loopback via dshow) + microphone
// simultaneously and merges them into a single 16kHz mono PCM16 WAV, the format
// Whisper expects. One FFmpeg child process per recording (spawn, never inline).
//
// Device names are machine-specific — pass them from settings; fall back to the
// common defaults. Use listAudioDevices() to enumerate what's available.
// =============================================================================

export interface StartOptions {
  /** dshow device for system audio (loopback). e.g. 'virtual-audio-capturer'. */
  systemDevice?: string
  /** dshow device for the microphone. e.g. 'Microphone Array (Realtek)'. */
  micDevice?: string
  /** Record the microphone ONLY (skip system-audio loopback entirely). */
  micOnly?: boolean
}

export interface RecordingHandle {
  recordingId: string
  outputPath: string
}

export interface StopResult {
  recordingId: string
  outputPath: string
  durationMs: number
}

export interface CaptureStatus {
  recording: boolean
  paused: boolean
  durationMs: number
}

// Heuristics for recognizing loopback / virtual "system audio" capture devices.
const LOOPBACK_RE = /cable|loopback|stereo mix|what u hear|virtual/i

/**
 * Resolve the system-audio (loopback) device to a real dshow name. Honors the
 * user's choice if it's present; otherwise auto-picks a loopback device.
 * Returns undefined if none can be found (caller falls back to mic-only).
 */
function pickSystemDevice(pref: string | undefined, available: string[]): string | undefined {
  if (pref && pref !== 'default' && (available.length === 0 || available.includes(pref))) {
    return pref
  }
  const cable = available.find((d) => LOOPBACK_RE.test(d))
  if (cable) return cable
  // Best effort: honor a non-"default" preference even if not enumerated.
  return pref && pref !== 'default' ? pref : undefined
}

/**
 * Resolve the microphone to a real dshow name. dshow has no "default" device,
 * so map 'default'/empty to a real input — preferring an actual microphone and
 * excluding the loopback/system device.
 */
function pickMicDevice(
  pref: string | undefined,
  systemDevice: string | undefined,
  available: string[]
): string | undefined {
  if (pref && pref !== 'default' && (available.length === 0 || available.includes(pref))) {
    return pref
  }
  const candidates = available.filter((d) => d !== systemDevice && !LOOPBACK_RE.test(d))
  return candidates.find((d) => /microphone|mikrofon|\bmic\b/i.test(d)) ?? candidates[0]
}

export class AudioCapture {
  private process: ChildProcess | null = null
  private recordingId: string | null = null
  private outputPath: string | null = null
  private startTime = 0
  private pausedMs = 0
  private pausedAt = 0
  private paused = false
  private stopping = false
  private stderrTail = ''
  /** Surfaced to the recording controller so device errors reach the UI. */
  public onError: ((message: string) => void) | null = null
  /** Fired when FFmpeg exits WITHOUT a stop() call (bad device, crash, etc.). */
  public onUnexpectedExit: ((code: number, detail: string) => void) | null = null

  private getOutputDir(): string {
    const dir = join(app.getPath('userData'), 'recordings')
    mkdirSync(dir, { recursive: true })
    return dir
  }

  /**
   * Build the FFmpeg arg list from ALREADY-RESOLVED dshow device names.
   * dshow device names with spaces/parentheses are passed as a single argv
   * element (spawn handles them — no shell quoting needed), e.g.:
   *   -f dshow -i audio=CABLE Output (VB-Audio Virtual Cable)
   */
  private buildArgs(
    outputPath: string,
    systemDevice: string | undefined,
    micDevice: string | undefined
  ): string[] {
    const args = ['-y']
    let inputCount = 0
    if (systemDevice) {
      args.push('-f', 'dshow', '-i', `audio=${systemDevice}`)
      inputCount++
    }
    if (micDevice) {
      args.push('-f', 'dshow', '-i', `audio=${micDevice}`)
      inputCount++
    }
    // Mix only when we actually have two inputs (system + mic).
    if (inputCount === 2) {
      args.push(
        '-filter_complex',
        '[0:a][1:a]amix=inputs=2:duration=longest:dropout_transition=0'
      )
    }
    // Whisper-optimal output: 16kHz, mono, PCM16 WAV.
    args.push('-ar', '16000', '-ac', '1', '-acodec', 'pcm_s16le', '-f', 'wav', outputPath)
    return args
  }

  async start(opts: StartOptions = {}): Promise<RecordingHandle> {
    if (this.process) {
      throw new Error('Recording already in progress')
    }

    const micOnly = opts.micOnly === true

    // dshow has NO generic "default" device — resolve to real device names by
    // enumerating what's actually present. This is the fix for FFmpeg exiting
    // immediately when it was told to open `audio=default`.
    const available = await listAudioDevices().catch(() => [] as string[])
    const systemDevice = micOnly ? undefined : pickSystemDevice(opts.systemDevice, available)
    const micDevice = pickMicDevice(opts.micDevice, systemDevice, available)

    if (micOnly && !micDevice) {
      throw new Error('No microphone found. Open Settings → Audio and select a microphone.')
    }
    if (!systemDevice && !micDevice) {
      throw new Error('No audio input devices found. Open Settings → Audio.')
    }

    console.log('[capture] starting recording')
    console.log(`[capture] mode: ${micOnly ? 'microphone only' : 'system + microphone'}`)
    console.log(`[capture] resolved system device: ${systemDevice ?? '(none)'}`)
    console.log(`[capture] resolved mic device:    ${micDevice ?? '(none)'}`)

    this.recordingId = randomUUID()
    this.outputPath = join(this.getOutputDir(), `recording_${this.recordingId}.wav`)
    this.startTime = Date.now()
    this.pausedMs = 0
    this.paused = false
    this.stopping = false
    this.stderrTail = ''

    const args = this.buildArgs(this.outputPath, systemDevice, micDevice)
    // Log the EXACT command. Quote args with spaces so it's copy-pasteable.
    const printable = args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ')
    console.log(`[capture] FFmpeg command:\n  "${ffmpegPath}" ${printable}`)

    try {
      this.process = spawn(ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (err) {
      this.process = null
      throw new Error(`Failed to launch FFmpeg: ${(err as Error).message}`)
    }

    this.process.stderr?.on('data', (data: Buffer) => {
      const text = data.toString()
      // Keep a rolling tail for diagnosing device-not-found / 0-byte errors.
      this.stderrTail = (this.stderrTail + text).slice(-4000)
      // FFmpeg logs everything to stderr; only treat real failures as errors.
      if (/could not|not found|no such|Error opening/i.test(text)) {
        console.error('[capture] ffmpeg:', text.trim())
        this.onError?.(text.trim())
      }
    })

    this.process.on('error', (err) => {
      console.error('[capture] ffmpeg process error', err)
      const wasStopping = this.stopping
      this.process = null
      this.stopping = false
      this.onError?.(err.message)
      if (!wasStopping) this.onUnexpectedExit?.(-1, err.message)
    })

    this.process.on('close', (code) => {
      console.log(`[capture] ffmpeg closed with code ${code}`)
      const wasStopping = this.stopping
      // Always reset state so a dead process never leaves us "recording".
      this.process = null
      this.stopping = false
      // Closed without a stop() call = startup/runtime failure (bad device, etc.).
      if (!wasStopping) {
        this.onUnexpectedExit?.(code ?? -1, this.stderrTail.slice(-500))
      }
    })

    return { recordingId: this.recordingId, outputPath: this.outputPath }
  }

  stop(): StopResult | null {
    if (!this.process || !this.recordingId || !this.outputPath) {
      console.warn('[capture] stop called with no active recording')
      return null
    }

    console.log('[capture] stopping recording')
    this.stopping = true // mark so the close handler treats this as a clean stop
    // Graceful stop: send 'q' to FFmpeg stdin (never kill — that truncates WAV).
    try {
      this.process.stdin?.write('q')
      this.process.stdin?.end()
    } catch (err) {
      console.error('[capture] error sending q to ffmpeg, killing', err)
      this.process.kill()
    }

    const durationMs = this.elapsedMs()
    const result: StopResult = {
      recordingId: this.recordingId,
      outputPath: this.outputPath,
      durationMs
    }

    this.process = null
    this.recordingId = null
    this.outputPath = null
    this.paused = false
    return result
  }

  // NOTE: FFmpeg has no native pause. SIGSTOP/SIGCONT are Unix-only and do not
  // work on Windows, so pause is tracked as elapsed-time bookkeeping only — the
  // underlying stream keeps recording. True segment-based pause is a later
  // enhancement; for the MVP we simply stop counting paused time.
  pause(): void {
    if (!this.process || this.paused) return
    console.log('[capture] pause (best-effort — stream continues on Windows)')
    this.paused = true
    this.pausedAt = Date.now()
    if (process.platform !== 'win32') {
      try {
        this.process.kill('SIGSTOP')
      } catch {
        /* unsupported on this platform */
      }
    }
  }

  resume(): void {
    if (!this.process || !this.paused) return
    console.log('[capture] resume')
    this.pausedMs += Date.now() - this.pausedAt
    this.paused = false
    if (process.platform !== 'win32') {
      try {
        this.process.kill('SIGCONT')
      } catch {
        /* unsupported on this platform */
      }
    }
  }

  private elapsedMs(): number {
    if (!this.startTime) return 0
    const now = this.paused ? this.pausedAt : Date.now()
    return now - this.startTime - this.pausedMs
  }

  status(): CaptureStatus {
    return {
      recording: this.process !== null,
      paused: this.paused,
      durationMs: this.elapsedMs()
    }
  }
}

/**
 * Parse FFmpeg's `-list_devices` stderr into audio input device names.
 *
 * FFmpeg prints two formats depending on build:
 *  (A) sectioned —    "DirectShow audio devices" header, then quoted names
 *  (B) suffixed  —    each quoted name followed by "(audio)" or "(video)"
 * We handle both: a name counts as audio if the line is tagged "(audio)" OR we
 * are inside the audio section. "Alternative name" lines are skipped (those are
 * the @device_… monikers, not the friendly names we pass to `audio=`).
 */
export function parseDshowAudioDevices(output: string): string[] {
  const devices: string[] = []
  let section: 'audio' | 'video' | null = null

  for (const raw of output.split('\n')) {
    const line = raw.trim()
    if (/DirectShow audio devices/i.test(line)) {
      section = 'audio'
      continue
    }
    if (/DirectShow video devices/i.test(line)) {
      section = 'video'
      continue
    }
    if (/Alternative name/i.test(line)) continue

    const match = line.match(/"([^"]+)"/)
    if (!match) continue
    const name = match[1]

    const taggedAudio = /\(audio\)/i.test(line)
    const taggedVideo = /\(video\)/i.test(line)
    const isAudio = taggedAudio || (section === 'audio' && !taggedVideo)
    if (isAudio) devices.push(name)
  }
  return [...new Set(devices)]
}

// --- Audio level test --------------------------------------------------------

export interface AudioLevelResult {
  device: string
  maxDb: number
  meanDb: number
  silent: boolean
}

export interface AudioTestReport {
  system: AudioLevelResult | null
  mic: AudioLevelResult | null
}

// max_volume above this counts as "has signal". Empty loopback / muted mic
// report around -91 dB (or -inf); a live source is typically > -45 dB.
const SILENCE_DB = -60

/** Capture a few seconds from one device and parse volumedetect stats. */
function measureDevice(name: string, seconds = 2): Promise<{ maxDb: number; meanDb: number }> {
  return new Promise((resolve) => {
    let stderr = ''
    const proc = spawn(ffmpegPath, [
      '-hide_banner',
      '-f',
      'dshow',
      '-i',
      `audio=${name}`,
      '-t',
      String(seconds),
      '-af',
      'volumedetect',
      '-f',
      'null',
      '-'
    ])
    proc.stderr?.on('data', (d: Buffer) => (stderr += d.toString()))
    proc.on('error', () => resolve({ maxDb: -Infinity, meanDb: -Infinity }))
    proc.on('close', () => {
      const max = stderr.match(/max_volume:\s*(-?\d+(?:\.\d+)?) dB/)
      const mean = stderr.match(/mean_volume:\s*(-?\d+(?:\.\d+)?) dB/)
      resolve({
        maxDb: max ? parseFloat(max[1]) : -Infinity,
        meanDb: mean ? parseFloat(mean[1]) : -Infinity
      })
    })
  })
}

/**
 * Briefly sample the configured system + mic devices and report whether each
 * carries a signal. Backs the audio:testLevels IPC channel — used to catch the
 * common "CABLE Output is silent because nothing feeds CABLE Input" mistake.
 */
export async function testAudioLevels(opts: StartOptions = {}): Promise<AudioTestReport> {
  const micOnly = opts.micOnly === true
  const available = await listAudioDevices().catch(() => [] as string[])
  const systemDevice = micOnly ? undefined : pickSystemDevice(opts.systemDevice, available)
  const micDevice = pickMicDevice(opts.micDevice, systemDevice, available)

  const measure = async (name?: string): Promise<AudioLevelResult | null> => {
    if (!name) return null
    console.log('[capture] testing levels for', name)
    const { maxDb, meanDb } = await measureDevice(name)
    return { device: name, maxDb, meanDb, silent: !(maxDb > SILENCE_DB) }
  }

  const [system, mic] = await Promise.all([measure(systemDevice), measure(micDevice)])
  console.log('[capture] level test:', JSON.stringify({ system, mic }))
  return { system, mic }
}

/**
 * Enumerate dshow audio input devices by parsing FFmpeg's device list (which it
 * prints to stderr). Backs the audio:listDevices IPC channel.
 */
export function listAudioDevices(): Promise<string[]> {
  return new Promise((resolve) => {
    console.log('[capture] listing audio devices')
    let output = ''
    const proc = spawn(ffmpegPath, [
      '-hide_banner',
      '-list_devices',
      'true',
      '-f',
      'dshow',
      '-i',
      'dummy'
    ])
    proc.stderr?.on('data', (d: Buffer) => (output += d.toString()))
    proc.on('close', () => {
      const devices = parseDshowAudioDevices(output)
      console.log('[capture] found audio devices:', devices)
      resolve(devices)
    })
    proc.on('error', (err) => {
      console.error('[capture] device enumeration failed', err)
      resolve([])
    })
  })
}
