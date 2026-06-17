import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import ffmpegStatic from 'ffmpeg-static'

const ffmpegPath: string = app.isPackaged
  ? join(process.resourcesPath, 'ffmpeg.exe')
  : (ffmpegStatic as unknown as string)

// =============================================================================
// ChunkManager — splits a full WAV recording into 30s chunks with 2s overlap.
// Overlap prevents word cut-off at boundaries (TranscriptMerger dedupes the
// overlap later). Each chunk is re-encoded to 16kHz mono PCM16 for Whisper.
// =============================================================================

const CHUNK_DURATION = 30 // seconds per chunk
const OVERLAP = 2 // seconds of overlap carried into the next chunk

export interface AudioChunk {
  index: number
  path: string
  startMs: number
  endMs: number
}

export class ChunkManager {
  /** Where chunks for a given recording live: recordings/chunks/<id>/. */
  private chunkDir(recordingId: string): string {
    const dir = join(app.getPath('userData'), 'recordings', 'chunks', recordingId)
    mkdirSync(dir, { recursive: true })
    return dir
  }

  /**
   * Split inputPath into overlapping 30s chunks. Advances by CHUNK_DURATION
   * (not chunk+overlap) so consecutive chunks share OVERLAP seconds.
   */
  async splitIntoChunks(inputPath: string, recordingId: string): Promise<AudioChunk[]> {
    console.log('[chunk] splitting', inputPath)
    const outputDir = this.chunkDir(recordingId)
    const duration = await this.getAudioDuration(inputPath)
    console.log(`[chunk] total duration ${duration.toFixed(1)}s`)

    const chunks: AudioChunk[] = []
    let startTime = 0
    let index = 0

    while (startTime < duration) {
      const chunkPath = join(outputDir, `chunk_${String(index).padStart(3, '0')}.wav`)
      const endTime = Math.min(startTime + CHUNK_DURATION + OVERLAP, duration)

      await this.extractChunk(inputPath, chunkPath, startTime, endTime - startTime)

      chunks.push({
        index,
        path: chunkPath,
        startMs: Math.round(startTime * 1000),
        endMs: Math.round(endTime * 1000)
      })

      startTime += CHUNK_DURATION
      index++
    }

    console.log(`[chunk] produced ${chunks.length} chunks`)
    return chunks
  }

  /** Extract a single [start, start+duration] slice, re-encoded for Whisper. */
  private extractChunk(
    input: string,
    output: string,
    start: number,
    duration: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // -ss before -i = fast input seek; re-encode to guarantee clean chunk.
      const proc = spawn(ffmpegPath, [
        '-y',
        '-ss',
        start.toString(),
        '-t',
        duration.toString(),
        '-i',
        input,
        '-ar',
        '16000',
        '-ac',
        '1',
        '-acodec',
        'pcm_s16le',
        output
      ])
      let stderr = ''
      proc.stderr?.on('data', (d: Buffer) => (stderr += d.toString()))
      proc.on('error', (err) => reject(err))
      proc.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`FFmpeg chunk extract exited ${code}: ${stderr.slice(-300)}`))
      })
    })
  }

  /** Parse total duration (seconds) from FFmpeg's stderr banner. */
  getAudioDuration(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const proc = spawn(ffmpegPath, ['-hide_banner', '-i', filePath])
      let output = ''
      proc.stderr?.on('data', (d: Buffer) => (output += d.toString()))
      proc.on('error', (err) => reject(err))
      proc.on('close', () => {
        const match = output.match(/Duration: (\d+):(\d+):(\d+\.?\d*)/)
        if (!match) {
          reject(new Error('Cannot parse audio duration from FFmpeg output'))
          return
        }
        const [, h, m, s] = match
        resolve(parseInt(h, 10) * 3600 + parseInt(m, 10) * 60 + parseFloat(s))
      })
    })
  }
}
