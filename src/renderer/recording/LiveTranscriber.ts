// =============================================================================
// LiveTranscriber — streams ONE audio channel (the client, system audio) to
// OpenAI live transcription (gpt-live-transcribe) over a WebSocket. Words come
// back ~0.3 s after they are spoken.
//
//   audio:  MediaStream → AudioContext @24 kHz → PCM16 → base64 every ~100 ms
//   turns:  a simple level-based VAD commits the buffer after a pause, which
//           finalises that item ("completed"); deltas stream before that
//   auth:   short-lived client secret from our server (functions/live-session);
//           the real API key never reaches the app
//   errors: reconnects with a fresh secret; after repeated failures it gives
//           up and the caller falls back to chunk transcription
// =============================================================================

export interface LiveEvents {
  /** Text of an item so far (grows with every delta). */
  onPartial: (itemId: string, text: string) => void
  /** Item finished (after a pause). */
  onFinal: (itemId: string, text: string) => void
  /** Connection state, for fallbacks and the UI. */
  onStatus: (status: 'connecting' | 'live' | 'failed' | 'stopped') => void
}

/**
 * Echo gate for the mic channel. With speakers (no headphones) the client's
 * voice plays out loud and the mic hears it again; without a gate it shows up
 * as "You" lines and is transcribed twice. The loopback channel is the exact
 * reference of what plays: while it is active, mic audio only counts as the
 * user speaking when it is clearly louder than the echo we expect. The echo
 * level (speaker → mic coupling) is learned during the call.
 */
export class EchoGate {
  private far: { at: number; rms: number }[] = []
  private lastFarVoice = -1e9
  /** Mic level / loopback level while only the client speaks (learned). */
  private coupling = 1.2

  /** Loopback (client) level, called for every frame of the 'them' channel. */
  far_(rms: number): void {
    const now = performance.now()
    this.far.push({ at: now, rms })
    while (this.far.length && now - this.far[0].at > 250) this.far.shift()
    if (rms >= VOICE_RMS) this.lastFarVoice = now
  }

  /** True when this mic frame is only the client's voice coming back. */
  isEcho(micRms: number): boolean {
    const now = performance.now()
    // Client silent for a while (plus room reverb tail): the mic is the user.
    if (now - this.lastFarVoice > 200) return false
    let farMax = 0
    for (const f of this.far) if (f.rms > farMax) farMax = f.rms
    if (farMax < VOICE_RMS * 0.5) return false
    const expected = this.coupling * farMax
    const ratio = micRms / farMax
    // Learn the coupling: drop fast, rise slowly and only towards echo-like
    // levels — the user talking over the client (much louder) teaches nothing.
    if (micRms >= 0.001) {
      if (ratio < this.coupling) this.coupling = this.coupling * 0.8 + ratio * 0.2
      else if (ratio < this.coupling * 2.2) this.coupling = this.coupling * 0.99 + ratio * 0.01
      this.coupling = Math.min(3, Math.max(0.02, this.coupling))
    }
    // The user talking over the client is much louder than the echo.
    return micRms < Math.max(VOICE_RMS, expected * 2.5)
  }
}

const RATE = 24_000
const SEND_EVERY_SAMPLES = 2_400 // 100 ms
const VOICE_RMS = 0.012
const PAUSE_MS = 650
const MAX_TURN_MS = 20_000
const MAX_FAILURES = 4
/** Audio held while (re)connecting, sent as soon as the socket opens. */
const MAX_BACKLOG_SAMPLES = RATE * 8
/** Audio kept before speech starts so the first word isn't cut. */
const PREROLL_SAMPLES = 10_800 // 450 ms — the first syllable isn't cut off

export class LiveTranscriber {
  private track: MediaStreamTrack | null = null
  private reader: ReadableStreamDefaultReader<AudioDataLike> | null = null
  private ws: WebSocket | null = null
  private pending: Int16Array[] = []
  private backlog: Int16Array[] = []
  private backlogSamples = 0
  private commitWhenOpen = false
  private pendingSamples = 0
  private paused = false
  private stopped = false
  private failures = 0
  // VAD
  private voicedSinceCommit = false
  private lastVoiceAt = 0
  private turnStartedAt = 0
  // Items
  private texts = new Map<string, string>()
  /** Software gain for the mic channel (see onAudio). */
  private gain = 1
  // Resampler state (device rate → 24 kHz)
  private ratio = 2
  private srcPos = 0
  private carry: Float32Array = new Float32Array(0)
  public status: 'connecting' | 'live' | 'failed' | 'stopped' = 'connecting'

  constructor(
    private stream: MediaStream,
    private getSecret: () => Promise<string>,
    private events: LiveEvents,
    /** 'far': this is the loopback channel, feed the gate. 'near': the mic, gated by it. */
    private echo?: { gate: EchoGate; role: 'far' | 'near' },
    /** Silence that ends a turn (shorter = the final text arrives sooner). */
    private pauseMs = PAUSE_MS
  ) {}

  async start(): Promise<void> {
    // Read raw audio frames straight from the track (MediaStreamTrackProcessor).
    // An AudioContext + ScriptProcessor on the Windows loopback stream crashed
    // the renderer in Electron 28 / Chromium 120 (access violation), so no Web
    // Audio graph here. Frames come at the device rate; we resample to 24 kHz.
    const Processor = (window as unknown as { MediaStreamTrackProcessor?: TrackProcessorCtor }).MediaStreamTrackProcessor
    const source = this.stream.getAudioTracks()[0]
    if (!Processor || !source) {
      this.setStatus('failed')
      return
    }
    this.track = source.clone()
    this.reader = new Processor({ track: this.track }).readable.getReader()
    void this.readLoop()
    await this.connect()
  }

  private async readLoop(): Promise<void> {
    const reader = this.reader
    if (!reader) return
    let buf = new Float32Array(0)
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done || !value) break
        try {
          const n = value.numberOfFrames
          if (buf.length !== n) buf = new Float32Array(n)
          try {
            value.copyTo(buf, { planeIndex: 0, format: 'f32-planar' })
          } catch {
            value.copyTo(buf, { planeIndex: 0 })
          }
          this.ratio = value.sampleRate / RATE
        } finally {
          value.close()
        }
        if (!this.stopped) this.onAudio(this.resample(buf))
      }
    } catch (err) {
      if (!this.stopped) console.warn('[live] audio reader stopped', (err as Error).message)
    }
  }

  pause(): void {
    this.paused = true
    this.commit()
  }

  resume(): void {
    this.paused = false
  }

  async stop(): Promise<void> {
    this.stopped = true
    this.commit()
    // Give the last completion a moment to arrive.
    await new Promise((r) => setTimeout(r, 1200))
    this.ws?.close()
    this.ws = null
    await this.reader?.cancel().catch(() => {})
    this.reader = null
    this.track?.stop()
    this.track = null
    this.setStatus('stopped')
  }

  private setStatus(s: LiveTranscriber['status']): void {
    this.status = s
    this.events.onStatus(s)
  }

  private async connect(): Promise<void> {
    if (this.stopped) return
    this.setStatus('connecting')
    let secret: string
    try {
      secret = await this.getSecret()
    } catch (err) {
      console.warn('[live] no secret', (err as Error).message)
      return this.retry()
    }
    const ws = new WebSocket('wss://api.openai.com/v1/realtime?intent=transcription', [
      'realtime',
      'openai-insecure-api-key.' + secret
    ])
    this.ws = ws
    ws.onopen = () => {
      this.failures = 0
      this.setStatus('live')
      console.log('[live] connected')
      // Words spoken while connecting are not lost.
      for (const chunk of this.backlog) this.sendPcm(chunk)
      this.backlog = []
      this.backlogSamples = 0
      if (this.commitWhenOpen) ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }))
      this.commitWhenOpen = false
    }
    ws.onmessage = (e) => this.onMessage(String(e.data))
    ws.onerror = () => console.warn('[live] socket error')
    ws.onclose = (e) => {
      if (this.ws !== ws) return
      this.ws = null
      if (this.stopped) return
      console.warn('[live] closed', e.code, e.reason)
      void this.retry()
    }
  }

  private async retry(): Promise<void> {
    if (this.stopped) return
    this.failures++
    if (this.failures > MAX_FAILURES) {
      this.setStatus('failed')
      return
    }
    await new Promise((r) => setTimeout(r, 800 * this.failures))
    await this.connect()
  }

  private onMessage(raw: string): void {
    let m: { type?: string; item_id?: string; delta?: string; transcript?: string; error?: { message?: string } }
    try {
      m = JSON.parse(raw)
    } catch {
      return
    }
    if (m.type === 'conversation.item.input_audio_transcription.delta' && m.item_id) {
      const text = (this.texts.get(m.item_id) ?? '') + (m.delta ?? '')
      this.texts.set(m.item_id, text)
      this.events.onPartial(m.item_id, text.trim())
    } else if (m.type === 'conversation.item.input_audio_transcription.completed' && m.item_id) {
      const text = (m.transcript ?? this.texts.get(m.item_id) ?? '').trim()
      this.texts.delete(m.item_id)
      if (text) this.events.onFinal(m.item_id, text)
    } else if (m.type === 'error') {
      console.warn('[live] server error', m.error?.message)
    }
  }

  private onAudio(input: Float32Array): void {
    if (this.paused || this.stopped) return
    // Level-based VAD.
    let sum = 0
    for (let i = 0; i < input.length; i++) sum += input[i] * input[i]
    let rms = Math.sqrt(sum / input.length)
    const now = performance.now()
    if (this.echo?.role === 'far') this.echo.gate.far_(rms)
    else if (this.echo?.role === 'near' && this.echo.gate.isEcho(rms)) {
      // Only the client's voice from the speakers: send silence instead, so it
      // is neither transcribed as "You" nor counted as the user speaking.
      input = new Float32Array(input.length)
      sum = 0
    } else if (this.echo?.role === 'near' && rms > 0.005) {
      // Your mic (no automatic gain): lift quiet speech to a steady level so a
      // short "Fixed" isn't heard as "Uh". Slow to rise, fast to fall, max 4x.
      const want = Math.min(4, Math.max(1, 0.06 / rms))
      this.gain = want < this.gain ? want : this.gain + (want - this.gain) * 0.05
      if (this.gain > 1.01) {
        const g = this.gain
        const out = new Float32Array(input.length)
        for (let i = 0; i < input.length; i++) out[i] = Math.max(-1, Math.min(1, input[i] * g))
        input = out
        rms *= g
        sum = rms * rms * input.length
      }
    }
    const level = sum ? rms : 0
    if (level >= VOICE_RMS) {
      if (!this.voicedSinceCommit) this.turnStartedAt = now
      this.voicedSinceCommit = true
      this.lastVoiceAt = now
    }
    // PCM16
    const pcm = new Int16Array(input.length)
    for (let i = 0; i < input.length; i++) {
      const v = Math.max(-1, Math.min(1, input[i]))
      pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff
    }
    this.pending.push(pcm)
    this.pendingSamples += pcm.length
    if (!this.voicedSinceCommit) {
      // Silence between turns isn't sent (cheaper, and no empty items):
      // keep only a short pre-roll.
      while (this.pending.length > 1 && this.pendingSamples - this.pending[0].length >= PREROLL_SAMPLES) {
        this.pendingSamples -= this.pending.shift()!.length
      }
      return
    }
    if (this.pendingSamples >= SEND_EVERY_SAMPLES) this.flush()

    if (
      this.voicedSinceCommit &&
      (now - this.lastVoiceAt >= this.pauseMs || now - this.turnStartedAt >= MAX_TURN_MS)
    ) {
      this.commit()
    }
  }

  /**
   * Device-rate mono → 24 kHz. Box-average over each output step (a cheap
   * low-pass that avoids aliasing for 48 → 24 kHz), carrying the fractional
   * position across buffers.
   */
  private resample(input: Float32Array): Float32Array {
    if (Math.abs(this.ratio - 1) < 1e-6) return input
    const data = new Float32Array(this.carry.length + input.length)
    data.set(this.carry, 0)
    data.set(input, this.carry.length)
    const r = this.ratio
    const out: number[] = []
    let pos = this.srcPos
    while (pos + r <= data.length) {
      const start = Math.floor(pos)
      const end = Math.min(data.length, Math.floor(pos + r))
      let sum = 0
      for (let i = start; i < end; i++) sum += data[i]
      out.push(end > start ? sum / (end - start) : data[start])
      pos += r
    }
    const keepFrom = Math.floor(pos)
    this.carry = data.slice(keepFrom)
    this.srcPos = pos - keepFrom
    return Float32Array.from(out)
  }

  private flush(): void {
    if (!this.pendingSamples) return
    const all = new Int16Array(this.pendingSamples)
    let o = 0
    for (const p of this.pending) {
      all.set(p, o)
      o += p.length
    }
    this.pending = []
    this.pendingSamples = 0
    const ws = this.ws
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      this.backlog.push(all)
      this.backlogSamples += all.length
      while (this.backlogSamples > MAX_BACKLOG_SAMPLES && this.backlog.length > 1) {
        this.backlogSamples -= this.backlog.shift()!.length
      }
      return
    }
    this.sendPcm(all)
  }

  private sendPcm(pcm: Int16Array): void {
    this.ws?.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: toBase64(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)) }))
  }

  private commit(): void {
    if (!this.voicedSinceCommit) return
    this.flush()
    this.voicedSinceCommit = false
    const ws = this.ws
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }))
    else this.commitWhenOpen = true
  }
}

// WebCodecs / insertable-streams types (not in this TS lib version).
interface AudioDataLike {
  numberOfFrames: number
  sampleRate: number
  copyTo(dest: Float32Array, opts: { planeIndex: number; format?: string }): void
  close(): void
}
type TrackProcessorCtor = new (init: { track: MediaStreamTrack }) => { readable: ReadableStream<AudioDataLike> }

function toBase64(bytes: Uint8Array): string {
  let bin = ''
  const CH = 0x8000
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode(...bytes.subarray(i, i + CH))
  return btoa(bin)
}
