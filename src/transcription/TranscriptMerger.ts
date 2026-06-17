import type { TranscribedChunk } from './WhisperClient'

// =============================================================================
// TranscriptMerger — stitches ordered Whisper chunks into one transcript.
//
// Chunks overlap by 2s (see ChunkManager), so words near a boundary appear in
// both the tail of chunk N and the head of chunk N+1. We convert every word to
// an ABSOLUTE timeline (chunk.startMs + word.start*1000) and drop any word that
// starts before the last accepted word ended — that removes the duplicated
// overlap region without needing fuzzy text matching.
//
// Also provides attributeSpeakers(): aligns merged words to diarizer segments
// and groups consecutive same-speaker words into transcript rows for SQLite.
// =============================================================================

const OVERLAP_TOLERANCE_MS = 150 // small slack so near-boundary words aren't lost

export interface MergedWord {
  text: string
  startMs: number
  endMs: number
}

export interface MergedTranscript {
  text: string
  words: MergedWord[]
  language?: string
}

/** Diarizer output: one entry per speaker turn (matches diarizer.py JSON). */
export interface DiarSegment {
  speaker: string // "SPEAKER_00", "SPEAKER_01", ...
  start_ms: number
  end_ms: number
}

/** A speaker-attributed line, ready to insert into the transcripts table. */
export interface TranscriptSegment {
  speaker: string
  startMs: number
  endMs: number
  text: string
}

export class TranscriptMerger {
  /** Merge ordered chunks into one deduplicated, absolute-timed transcript. */
  merge(chunks: TranscribedChunk[]): MergedTranscript {
    console.log('[merge] merging', chunks.length, 'chunks')
    const ordered = [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex)

    const words: MergedWord[] = []
    let lastEndMs = -Infinity

    for (const chunk of ordered) {
      if (chunk.words.length > 0) {
        for (const w of chunk.words) {
          const startMs = chunk.startMs + Math.round(w.start * 1000)
          const endMs = chunk.startMs + Math.round(w.end * 1000)
          // Skip words already covered by the previous (overlapping) chunk.
          if (startMs < lastEndMs - OVERLAP_TOLERANCE_MS) continue
          const text = w.word.trim()
          if (!text) continue
          words.push({ text, startMs, endMs })
          lastEndMs = Math.max(lastEndMs, endMs)
        }
      } else if (chunk.text.trim()) {
        // No word timestamps (rare) — can't time-dedupe; append as one span.
        words.push({
          text: chunk.text.trim(),
          startMs: chunk.startMs,
          endMs: chunk.endMs
        })
        lastEndMs = Math.max(lastEndMs, chunk.endMs)
      }
      // Failed/empty chunks (text === '') contribute nothing.
    }

    const text = this.joinWords(words)
    const language = this.dominantLanguage(ordered)
    console.log(`[merge] merged into ${words.length} words, language=${language ?? 'unknown'}`)
    return { text, words, language }
  }

  /**
   * Attribute speakers to merged words using diarizer segments, then group
   * consecutive same-speaker words into transcript rows. When no diarization is
   * available (Pro-only / diarizer failed), everything is one "Speaker".
   */
  attributeSpeakers(merged: MergedTranscript, diar?: DiarSegment[]): TranscriptSegment[] {
    const { words } = merged
    if (words.length === 0) return []

    const speakerOf = (w: MergedWord): string => {
      if (!diar || diar.length === 0) return 'Speaker'
      const mid = (w.startMs + w.endMs) / 2
      // Pick the diar segment whose range contains the word midpoint…
      const hit = diar.find((s) => mid >= s.start_ms && mid <= s.end_ms)
      if (hit) return hit.speaker
      // …otherwise snap to the nearest segment by distance.
      let best = diar[0]
      let bestDist = Infinity
      for (const s of diar) {
        const dist = mid < s.start_ms ? s.start_ms - mid : mid - s.end_ms
        if (dist < bestDist) {
          bestDist = dist
          best = s
        }
      }
      return best.speaker
    }

    const segments: TranscriptSegment[] = []
    let current: TranscriptSegment | null = null

    for (const w of words) {
      const speaker = speakerOf(w)
      if (current && current.speaker === speaker) {
        current.text += ' ' + w.text
        current.endMs = w.endMs
      } else {
        if (current) segments.push(this.tidy(current))
        current = { speaker, startMs: w.startMs, endMs: w.endMs, text: w.text }
      }
    }
    if (current) segments.push(this.tidy(current))

    console.log(`[merge] attributed ${segments.length} speaker segments`)
    return segments
  }

  /** Join words into readable text, fixing spacing around punctuation. */
  private joinWords(words: MergedWord[]): string {
    return words
      .map((w) => w.text)
      .join(' ')
      .replace(/\s+([,.!?;:])/g, '$1') // no space before punctuation
      .replace(/\s+/g, ' ')
      .trim()
  }

  private tidy(seg: TranscriptSegment): TranscriptSegment {
    return {
      ...seg,
      text: seg.text.replace(/\s+([,.!?;:])/g, '$1').replace(/\s+/g, ' ').trim()
    }
  }

  /** Most frequent non-empty language across chunks. */
  private dominantLanguage(chunks: TranscribedChunk[]): string | undefined {
    const counts = new Map<string, number>()
    for (const c of chunks) {
      if (c.language) counts.set(c.language, (counts.get(c.language) ?? 0) + 1)
    }
    let best: string | undefined
    let bestCount = 0
    for (const [lang, count] of counts) {
      if (count > bestCount) {
        bestCount = count
        best = lang
      }
    }
    return best
  }
}
