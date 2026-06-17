import { createReadStream } from 'node:fs'
import OpenAI from 'openai'
import type { AudioChunk } from '@capture/ChunkManager'

// =============================================================================
// WhisperClient — transcribes 30s chunks in parallel via OpenAI whisper-1.
// verbose_json + word timestamps so TranscriptMerger can dedupe overlaps and
// the diarizer can align speakers. A failed chunk degrades to empty text rather
// than failing the whole meeting (per ai-pipeline error rules).
// =============================================================================

const CONCURRENCY = 5 // OpenAI rate-friendly parallelism

export interface WhisperWord {
  word: string
  start: number // seconds
  end: number // seconds
}

export interface TranscribedChunk {
  chunkIndex: number
  startMs: number
  endMs: number
  text: string
  words: WhisperWord[]
  language?: string
  failed?: boolean
}

export class WhisperClient {
  private client: OpenAI

  constructor(apiKey: string) {
    if (!apiKey) throw new Error('OPENAI_API_KEY is required for transcription')
    this.client = new OpenAI({ apiKey })
  }

  /** Transcribe all chunks, CONCURRENCY at a time, preserving order. */
  async transcribeChunks(
    chunks: AudioChunk[],
    onProgress?: (done: number, total: number) => void
  ): Promise<TranscribedChunk[]> {
    console.log(`[whisper] transcribing ${chunks.length} chunks (concurrency ${CONCURRENCY})`)
    const results = new Array<TranscribedChunk>(chunks.length)
    let completed = 0

    for (let i = 0; i < chunks.length; i += CONCURRENCY) {
      const batch = chunks.slice(i, i + CONCURRENCY)
      const batchResults = await Promise.all(batch.map((chunk) => this.transcribeChunk(chunk)))
      batchResults.forEach((r, j) => {
        results[i + j] = r
        completed++
        onProgress?.(completed, chunks.length)
      })
    }

    console.log('[whisper] transcription complete')
    return results
  }

  /** Transcribe one chunk. On failure returns empty text (never throws). */
  async transcribeChunk(chunk: AudioChunk): Promise<TranscribedChunk> {
    try {
      console.log(`[whisper] chunk ${chunk.index} →`)
      const response = await this.client.audio.transcriptions.create({
        file: createReadStream(chunk.path),
        model: 'whisper-1',
        response_format: 'verbose_json',
        timestamp_granularities: ['word']
      })

      // verbose_json response shape (typed loosely — SDK types vary by version).
      const r = response as unknown as {
        text: string
        language?: string
        words?: WhisperWord[]
      }

      return {
        chunkIndex: chunk.index,
        startMs: chunk.startMs,
        endMs: chunk.endMs,
        text: r.text ?? '',
        words: r.words ?? [],
        language: r.language
      }
    } catch (err) {
      // Graceful fallback — keep the pipeline alive, mark the chunk failed.
      console.error(`[whisper] chunk ${chunk.index} failed:`, (err as Error).message)
      return {
        chunkIndex: chunk.index,
        startMs: chunk.startMs,
        endMs: chunk.endMs,
        text: '',
        words: [],
        failed: true
      }
    }
  }
}
