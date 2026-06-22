import { spawn } from 'node:child_process'
import { mkdirSync, unlinkSync, existsSync } from 'node:fs'
import { join, extname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { app } from 'electron'
import ffmpegStatic from 'ffmpeg-static'
import { WhisperClient } from '../transcription/WhisperClient'
import { ChunkManager } from '../capture/ChunkManager'
import { TranscriptMerger } from '../transcription/TranscriptMerger'
import { getSetting } from './store'
import { sendToRenderer } from './ipc'

const ffmpegPath: string = app.isPackaged
  ? join(process.resourcesPath, 'ffmpeg.exe')
  : (ffmpegStatic as unknown as string)

export type TranscribeProgressStep =
  | 'downloading'
  | 'extracting'
  | 'splitting'
  | 'transcribing'
  | 'done'

export interface TranscribeResult {
  text: string
  language?: string
  durationMs: number
}

function tempDir(): string {
  const dir = join(app.getPath('userData'), 'transcribe_tmp')
  mkdirSync(dir, { recursive: true })
  return dir
}

function emitProgress(step: TranscribeProgressStep, pct: number): void {
  sendToRenderer('transcribe:progress', { step, pct })
}

/** Convert any video/audio file to 16kHz mono WAV using FFmpeg. */
function extractAudio(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, [
      '-y', '-i', inputPath,
      '-vn', '-ar', '16000', '-ac', '1', '-acodec', 'pcm_s16le',
      '-f', 'wav', outputPath
    ])
    let stderr = ''
    proc.stderr?.on('data', (d: Buffer) => (stderr += d.toString()))
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`FFmpeg exited ${code}: ${stderr.slice(-300)}`))
    })
    proc.on('error', reject)
  })
}

interface YtDlpWrapCtor {
  new (binaryPath: string): YtDlpWrapInstance
  downloadFromGithub(binaryPath: string): Promise<void>
}
interface YtDlpWrapInstance {
  exec(args: string[]): NodeJS.EventEmitter
}

/** Resolve the YTDlpWrap constructor from CJS module (handles default-export quirk). */
function requireYtDlpWrap(): YtDlpWrapCtor {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('yt-dlp-wrap') as YtDlpWrapCtor | { default: YtDlpWrapCtor }
  return typeof mod === 'function' ? mod : (mod as { default: YtDlpWrapCtor }).default
}

/** Ensure yt-dlp binary is available, downloading it once to userData if needed. */
async function getYtDlp(): Promise<YtDlpWrapInstance> {
  const YTDlpWrap = requireYtDlpWrap()
  const binaryPath = join(app.getPath('userData'), process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp')
  if (!existsSync(binaryPath)) {
    console.log('[transcribe] downloading yt-dlp binary…')
    await YTDlpWrap.downloadFromGithub(binaryPath)
    console.log('[transcribe] yt-dlp ready at', binaryPath)
  }
  return new YTDlpWrap(binaryPath)
}

/** Download best audio stream from a YouTube/social media URL via yt-dlp. */
async function downloadUrl(url: string, outputPath: string): Promise<void> {
  const ytDlp = await getYtDlp()
  emitProgress('downloading', 10)

  await new Promise<void>((resolve, reject) => {
    const em = ytDlp.exec([
      url,
      '-x',                    // extract audio only
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '-o', outputPath,
      '--no-playlist',
      '--quiet',
      '--no-warnings'
    ])

    em.on('progress', (p: { percent?: number }) => {
      if (p.percent != null) {
        emitProgress('downloading', Math.min(40, Math.round(p.percent * 0.4)))
      }
    })
    em.on('close', () => resolve())
    em.on('error', (err: Error) => reject(err))
    em.on('ytDlpEvent', (event: string, data: string) => {
      if (event === 'error') reject(new Error(data))
    })
  })
}

async function transcribeWav(wavPath: string, id: string): Promise<TranscribeResult> {
  const startMs = Date.now()
  const apiKey = getSetting('openaiApiKey') || process.env['OPENAI_API_KEY'] || ''
  if (!apiKey) throw new Error('No OpenAI API key. Go to Settings → API Keys.')

  emitProgress('splitting', 50)
  const chunks = await new ChunkManager().splitIntoChunks(wavPath, id)

  emitProgress('transcribing', 60)
  const whisper = new WhisperClient(apiKey)
  const transcribed = await whisper.transcribeChunks(chunks, (done, total) => {
    const pct = 60 + Math.round((done / total) * 35)
    emitProgress('transcribing', pct)
  })

  const merged = new TranscriptMerger().merge(transcribed)
  const text = merged.text.trim()
  const language = transcribed.find((c) => c.language)?.language

  emitProgress('done', 100)
  return { text, language, durationMs: Date.now() - startMs }
}

/** Transcribe a local video or audio file. */
export async function transcribeFile(filePath: string): Promise<TranscribeResult> {
  const id = randomUUID()
  const dir = tempDir()
  const audioPath = join(dir, `${id}.wav`)

  try {
    const ext = extname(filePath).toLowerCase()
    const isAlreadyWav = ext === '.wav'

    if (isAlreadyWav) {
      return await transcribeWav(filePath, id)
    }

    emitProgress('extracting', 10)
    await extractAudio(filePath, audioPath)
    emitProgress('extracting', 45)

    return await transcribeWav(audioPath, id)
  } finally {
    if (existsSync(audioPath)) unlinkSync(audioPath)
  }
}

/** Download from URL and transcribe. */
export async function transcribeUrl(url: string): Promise<TranscribeResult> {
  const id = randomUUID()
  const dir = tempDir()
  const rawPath = join(dir, `${id}_raw`)
  const audioPath = join(dir, `${id}.wav`)

  try {
    emitProgress('downloading', 5)
    await downloadUrl(url, rawPath)

    emitProgress('extracting', 45)
    await extractAudio(rawPath, audioPath)

    return await transcribeWav(audioPath, id)
  } finally {
    if (existsSync(rawPath)) unlinkSync(rawPath)
    if (existsSync(audioPath)) unlinkSync(audioPath)
  }
}
