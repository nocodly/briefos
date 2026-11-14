// Parse transcripts exported from Zoom / Teams / Meet (.vtt, .srt) or plain text
// ("Name: words" per line) into speaker segments.

export interface ImportedSegment {
  /** Speaker name as written in the file ('' if unknown). */
  name: string
  startMs: number
  endMs: number
  text: string
}

const TS = /(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?/

function toMs(m: RegExpExecArray): number {
  const h = Number(m[1] ?? 0)
  const min = Number(m[2])
  const s = Number(m[3])
  const ms = Number((m[4] ?? '0').padEnd(3, '0'))
  return ((h * 60 + min) * 60 + s) * 1000 + ms
}

function splitSpeaker(line: string): { name: string; text: string } {
  // WebVTT voice tag: <v Anna Smith>Hello</v>
  const v = /^<v(?:\.[^ >]*)?\s+([^>]+)>(.*?)(?:<\/v>)?$/i.exec(line)
  if (v) return { name: v[1].trim(), text: v[2].trim() }
  // "Anna Smith: Hello" (name up to 40 chars, no sentence punctuation)
  const c = /^([^:.!?\n]{1,40}):\s+(.+)$/.exec(line)
  if (c && !/^\d+$/.test(c[1])) return { name: c[1].trim(), text: c[2].trim() }
  return { name: '', text: line.trim() }
}

const stripTags = (s: string) => s.replace(/<\/?[^>]+>/g, '').trim()

export function parseTranscript(raw: string): ImportedSegment[] {
  const text = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim()
  if (!text) return []
  const segs: ImportedSegment[] = []

  if (/-->/.test(text)) {
    // VTT / SRT: blocks separated by blank lines.
    for (const block of text.split(/\n\s*\n/)) {
      const lines = block.split('\n').map((l) => l.trim()).filter(Boolean)
      const tsIdx = lines.findIndex((l) => l.includes('-->'))
      if (tsIdx < 0) continue
      const [from, to] = lines[tsIdx].split('-->')
      const a = TS.exec(from)
      const b = TS.exec(to ?? '')
      const body = lines.slice(tsIdx + 1).join(' ')
      if (!body) continue
      const { name, text: t } = splitSpeaker(body)
      const clean = stripTags(t)
      if (!clean) continue
      const startMs = a ? toMs(a) : segs.length * 5000
      segs.push({ name, startMs, endMs: b ? toMs(b) : startMs + 5000, text: clean })
    }
  } else {
    // Plain text: one utterance per line, optional "[00:12]" or "00:12" prefix.
    let clock = 0
    for (const rawLine of text.split('\n')) {
      let line = rawLine.trim()
      if (!line) continue
      const lead = /^\[?((?:\d{1,2}:)?\d{1,2}:\d{2})\]?\s*[-–]?\s*/.exec(line)
      if (lead) {
        const m = TS.exec(lead[1])
        if (m) clock = toMs(m)
        line = line.slice(lead[0].length)
      }
      const { name, text: t } = splitSpeaker(line)
      if (!t) continue
      segs.push({ name, startMs: clock, endMs: clock + 5000, text: t })
      clock += 5000
    }
  }

  // Merge consecutive lines from the same speaker.
  const merged: ImportedSegment[] = []
  for (const s of segs) {
    const last = merged[merged.length - 1]
    if (last && last.name === s.name && s.startMs - last.endMs < 15_000 && last.text.length < 1200) {
      last.text = `${last.text} ${s.text}`
      last.endMs = Math.max(last.endMs, s.endMs)
    } else merged.push({ ...s })
  }
  return merged
}

/** Distinct speaker names, most active first. */
export function speakersOf(segs: ImportedSegment[]): string[] {
  const count = new Map<string, number>()
  for (const s of segs) if (s.name) count.set(s.name, (count.get(s.name) ?? 0) + s.text.length)
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n)
}
