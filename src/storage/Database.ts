import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import Database from 'better-sqlite3'
import schemaSql from './schema.sql?raw'
import type { TranscriptSegment } from '@transcription/TranscriptMerger'

// =============================================================================
// BriefOSDatabase — all better-sqlite3 access. JSON columns are stringified on
// write and parsed on read (critical rule #9). Column names match schema.sql
// exactly; never rename without updating the schema + skill.
// =============================================================================

// --- Shapes exchanged with the rest of the app ------------------------------

export interface CreateMeetingInput {
  title?: string
  type?: string
  startedAt: string // ISO datetime
  audioPath?: string
  language?: string
}

export interface SummaryInput {
  tldr?: string
  context?: string
  decisions?: unknown[]
  actionItems?: unknown[]
  openQuestions?: unknown[]
  sentiment?: Record<string, unknown>
  keywords?: unknown[]
}

export interface SavePeriodReportInput {
  label: string
  from: string
  to: string
  meetingIds: string[]
  totalDurationS?: number
  executiveSummary?: string
  mainThemes?: unknown[]
  allDecisions?: unknown[]
  openActions?: unknown[]
  recurringQuestions?: unknown[]
  topTopics?: unknown[]
  speakerStats?: unknown[]
  aiInsights?: unknown[]
  keywords?: unknown[]
}

export interface MeetingFilters {
  limit?: number
  offset?: number
  from?: string
  to?: string
}

const parse = <T>(raw: unknown, fallback: T): T => {
  if (typeof raw !== 'string' || raw === '') return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export class BriefOSDatabase {
  private db: Database.Database

  constructor() {
    const dbDir = app.getPath('userData')
    mkdirSync(dbDir, { recursive: true })
    mkdirSync(join(dbDir, 'recordings'), { recursive: true })
    mkdirSync(join(dbDir, 'logs'), { recursive: true })

    const dbPath = join(dbDir, 'data.db')
    console.log('[db] opening', dbPath)
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL') // concurrent read/write performance
    this.db.pragma('foreign_keys = ON') // enforce CASCADE deletes
    this.init()
  }

  private init(): void {
    // schema.sql is bundled as a string (?raw) so it survives Rollup bundling.
    this.db.exec(schemaSql)
    console.log('[db] schema initialized')
  }

  // ─── MEETINGS ──────────────────────────────────────────────────────────

  createMeeting(input: CreateMeetingInput): string {
    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO meetings (id, title, type, started_at, audio_path, language)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.title || 'Untitled Meeting',
        input.type || 'other',
        input.startedAt,
        input.audioPath ?? null,
        input.language || 'en'
      )
    console.log('[db] created meeting', id)
    return id
  }

  updateMeeting(id: string, updates: Record<string, unknown>): void {
    const allowed = ['title', 'type', 'duration_s', 'audio_path', 'language', 'accuracy']
    const fields = Object.keys(updates).filter((k) => allowed.includes(k))
    if (!fields.length) return
    const sql = `UPDATE meetings SET ${fields
      .map((f) => `${f} = ?`)
      .join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    this.db.prepare(sql).run(...fields.map((f) => updates[f]), id)
  }

  updateTitle(id: string, title: string): void {
    this.db
      .prepare('UPDATE meetings SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(title, id)
  }

  getMeeting(id: string): Record<string, unknown> | null {
    const meeting = this.db.prepare('SELECT * FROM meetings WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined
    if (!meeting) return null
    meeting.summary = this.getSummary(id)
    meeting.transcript = this.getTranscript(id)
    return meeting
  }

  getAllMeetings(filters: MeetingFilters = {}): Record<string, unknown>[] {
    const { limit = 50, offset = 0, from, to } = filters
    let sql =
      'SELECT m.*, s.tldr FROM meetings m LEFT JOIN summaries s ON s.meeting_id = m.id'
    const params: unknown[] = []
    if (from && to) {
      sql += ' WHERE m.started_at BETWEEN ? AND ?'
      params.push(from, to)
    }
    sql += ' ORDER BY m.started_at DESC LIMIT ? OFFSET ?'
    params.push(limit, offset)
    return this.db.prepare(sql).all(...params) as Record<string, unknown>[]
  }

  deleteMeeting(id: string): void {
    // CASCADE removes summaries + transcripts; FTS isn't a real table so clean
    // it explicitly to avoid orphaned search rows.
    const tx = this.db.transaction((mid: string) => {
      this.db.prepare('DELETE FROM transcript_fts WHERE meeting_id = ?').run(mid)
      this.db.prepare('DELETE FROM meetings WHERE id = ?').run(mid)
    })
    tx(id)
    console.log('[db] deleted meeting', id)
  }

  getMeetingsInRange(from: string, to: string): Record<string, unknown>[] {
    const rows = this.db
      .prepare(
        `SELECT m.*, s.tldr, s.decisions, s.action_items, s.open_questions, s.keywords
         FROM meetings m
         LEFT JOIN summaries s ON s.meeting_id = m.id
         WHERE m.started_at BETWEEN ? AND ?
         ORDER BY m.started_at ASC`
      )
      .all(from, to) as Record<string, unknown>[]
    return rows.map((row) => ({
      ...row,
      decisions: parse(row.decisions, []),
      action_items: parse(row.action_items, []),
      open_questions: parse(row.open_questions, []),
      keywords: parse(row.keywords, [])
    }))
  }

  searchMeetings(query: string): Record<string, unknown>[] {
    return this.db
      .prepare(
        `SELECT DISTINCT m.id, m.title, m.started_at, m.duration_s,
           snippet(transcript_fts, 0, '<mark>', '</mark>', '...', 20) as excerpt
         FROM transcript_fts
         JOIN meetings m ON m.id = transcript_fts.meeting_id
         WHERE transcript_fts MATCH ?
         ORDER BY rank
         LIMIT 20`
      )
      .all(query) as Record<string, unknown>[]
  }

  // ─── SUMMARIES ─────────────────────────────────────────────────────────

  saveSummary(meetingId: string, summary: SummaryInput): string {
    // Replace any existing summary for this meeting.
    this.db.prepare('DELETE FROM summaries WHERE meeting_id = ?').run(meetingId)
    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO summaries
         (id, meeting_id, tldr, context, decisions, action_items, open_questions, sentiment, keywords)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        meetingId,
        summary.tldr ?? null,
        summary.context ?? null,
        JSON.stringify(summary.decisions ?? []),
        JSON.stringify(summary.actionItems ?? []),
        JSON.stringify(summary.openQuestions ?? []),
        JSON.stringify(summary.sentiment ?? {}),
        JSON.stringify(summary.keywords ?? [])
      )
    console.log('[db] saved summary for meeting', meetingId)
    return id
  }

  getSummary(meetingId: string): Record<string, unknown> | null {
    const row = this.db.prepare('SELECT * FROM summaries WHERE meeting_id = ?').get(meetingId) as
      | Record<string, unknown>
      | undefined
    if (!row) return null
    return {
      ...row,
      decisions: parse(row.decisions, []),
      actionItems: parse(row.action_items, []),
      openQuestions: parse(row.open_questions, []),
      sentiment: parse(row.sentiment, {}),
      keywords: parse(row.keywords, [])
    }
  }

  // ─── TRANSCRIPTS ───────────────────────────────────────────────────────

  saveTranscriptSegments(meetingId: string, segments: TranscriptSegment[]): void {
    const insert = this.db.prepare(
      `INSERT INTO transcripts (id, meeting_id, speaker, start_ms, end_ms, text)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    const insertFts = this.db.prepare(
      `INSERT INTO transcript_fts (text, meeting_id, speaker) VALUES (?, ?, ?)`
    )
    const tx = this.db.transaction((segs: TranscriptSegment[]) => {
      for (const seg of segs) {
        insert.run(randomUUID(), meetingId, seg.speaker, seg.startMs, seg.endMs, seg.text)
        insertFts.run(seg.text, meetingId, seg.speaker)
      }
    })
    tx(segments)
    console.log(`[db] saved ${segments.length} transcript segments for`, meetingId)
  }

  getTranscript(meetingId: string): Record<string, unknown>[] {
    return this.db
      .prepare('SELECT * FROM transcripts WHERE meeting_id = ? ORDER BY start_ms ASC')
      .all(meetingId) as Record<string, unknown>[]
  }

  /** Rename a speaker label across a meeting's transcript (SpeakerMapper). */
  renameSpeaker(meetingId: string, from: string, to: string): void {
    const tx = this.db.transaction(() => {
      this.db
        .prepare('UPDATE transcripts SET speaker = ? WHERE meeting_id = ? AND speaker = ?')
        .run(to, meetingId, from)
      this.db
        .prepare('UPDATE transcript_fts SET speaker = ? WHERE meeting_id = ? AND speaker = ?')
        .run(to, meetingId, from)
    })
    tx()
  }

  // ─── PERIOD REPORTS ────────────────────────────────────────────────────

  savePeriodReport(input: SavePeriodReportInput): string {
    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO period_reports
         (id, period_label, period_from, period_to, meeting_ids, meeting_count,
          total_duration_s, executive_summary, main_themes, all_decisions, open_actions,
          recurring_questions, top_topics, speaker_stats, ai_insights, keywords)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.label,
        input.from,
        input.to,
        JSON.stringify(input.meetingIds),
        input.meetingIds.length,
        input.totalDurationS ?? 0,
        input.executiveSummary ?? null,
        JSON.stringify(input.mainThemes ?? []),
        JSON.stringify(input.allDecisions ?? []),
        JSON.stringify(input.openActions ?? []),
        JSON.stringify(input.recurringQuestions ?? []),
        JSON.stringify(input.topTopics ?? []),
        JSON.stringify(input.speakerStats ?? []),
        JSON.stringify(input.aiInsights ?? []),
        JSON.stringify(input.keywords ?? [])
      )
    console.log('[db] saved period report', id)
    return id
  }

  getPeriodReport(id: string): Record<string, unknown> | null {
    const row = this.db.prepare('SELECT * FROM period_reports WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined
    if (!row) return null
    const jsonFields = [
      'meeting_ids',
      'main_themes',
      'all_decisions',
      'open_actions',
      'recurring_questions',
      'top_topics',
      'speaker_stats',
      'ai_insights',
      'keywords'
    ]
    for (const f of jsonFields) row[f] = parse(row[f], [])
    return row
  }

  getAllPeriodReports(): Record<string, unknown>[] {
    return this.db
      .prepare(
        `SELECT id, period_label, period_from, period_to, meeting_count, created_at
         FROM period_reports ORDER BY created_at DESC`
      )
      .all() as Record<string, unknown>[]
  }

  close(): void {
    this.db.close()
  }
}

// Single shared connection for the whole main process.
let instance: BriefOSDatabase | null = null
export function getDatabase(): BriefOSDatabase {
  if (!instance) instance = new BriefOSDatabase()
  return instance
}
