---
name: sqlite-storage
description: Use this skill for ANY task involving SQLite database, better-sqlite3, schema migrations, queries, electron-store settings, or file management in BriefOS. Triggers when: creating or editing Database.js, schema.sql, FileManager.js — or when the user asks "how to save a meeting", "query all meetings", "how to store period report", "settings not persisting", "database migration", "how to search transcripts", "delete meeting and its files". Always use before writing any database code — the schema has specific column names and JSON storage patterns that must stay consistent.
---

# SQLite Storage — BriefOS

## Database location

```
%APPDATA%/BriefOS/data.db        ← SQLite file
%APPDATA%/BriefOS/recordings/    ← WAV audio files
%APPDATA%/BriefOS/logs/          ← App logs
```

---

## Complete schema — schema.sql

```sql
-- Meetings table
CREATE TABLE IF NOT EXISTS meetings (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL DEFAULT 'Untitled Meeting',
  type          TEXT DEFAULT 'other',
  started_at    DATETIME NOT NULL,
  duration_s    INTEGER DEFAULT 0,
  audio_path    TEXT,
  language      TEXT DEFAULT 'en',
  accuracy      REAL DEFAULT 0,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Summaries table (one per meeting)
CREATE TABLE IF NOT EXISTS summaries (
  id              TEXT PRIMARY KEY,
  meeting_id      TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  tldr            TEXT,
  context         TEXT,
  decisions       TEXT DEFAULT '[]',   -- JSON array
  action_items    TEXT DEFAULT '[]',   -- JSON array
  open_questions  TEXT DEFAULT '[]',   -- JSON array
  sentiment       TEXT DEFAULT '{}',   -- JSON object
  keywords        TEXT DEFAULT '[]',   -- JSON array
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Transcripts table (many rows per meeting)
CREATE TABLE IF NOT EXISTS transcripts (
  id          TEXT PRIMARY KEY,
  meeting_id  TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  speaker     TEXT DEFAULT 'Unknown',
  start_ms    INTEGER NOT NULL,
  end_ms      INTEGER NOT NULL,
  text        TEXT NOT NULL
);

-- Period reports table
CREATE TABLE IF NOT EXISTS period_reports (
  id                  TEXT PRIMARY KEY,
  period_label        TEXT NOT NULL,
  period_from         DATE NOT NULL,
  period_to           DATE NOT NULL,
  meeting_ids         TEXT DEFAULT '[]',   -- JSON array of meeting UUIDs
  meeting_count       INTEGER DEFAULT 0,
  total_duration_s    INTEGER DEFAULT 0,
  executive_summary   TEXT,
  all_decisions       TEXT DEFAULT '[]',   -- JSON array
  open_actions        TEXT DEFAULT '[]',   -- JSON array
  recurring_questions TEXT DEFAULT '[]',   -- JSON array
  top_topics          TEXT DEFAULT '[]',   -- JSON array
  speaker_stats       TEXT DEFAULT '[]',   -- JSON array
  ai_insights         TEXT DEFAULT '[]',   -- JSON array
  keywords            TEXT DEFAULT '[]',   -- JSON array
  created_at          DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Full-text search on transcripts
CREATE VIRTUAL TABLE IF NOT EXISTS transcript_fts USING fts5(
  text,
  meeting_id UNINDEXED,
  speaker UNINDEXED
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_meetings_started_at ON meetings(started_at);
CREATE INDEX IF NOT EXISTS idx_transcripts_meeting ON transcripts(meeting_id, start_ms);
CREATE INDEX IF NOT EXISTS idx_summaries_meeting ON summaries(meeting_id);
CREATE INDEX IF NOT EXISTS idx_period_reports_dates ON period_reports(period_from, period_to);
```

---

## Database.js — complete wrapper

```js
// src/storage/Database.js
const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')
const { app } = require('electron')
const { v4: uuidv4 } = require('uuid')

class BriefOSDatabase {
  constructor() {
    const dbDir = app.getPath('userData')
    fs.mkdirSync(dbDir, { recursive: true })
    fs.mkdirSync(path.join(dbDir, 'recordings'), { recursive: true })

    this.db = new Database(path.join(dbDir, 'data.db'))
    this.db.pragma('journal_mode = WAL')   // better concurrent performance
    this.db.pragma('foreign_keys = ON')    // enforce CASCADE deletes
    this.init()
  }

  init() {
    const schema = fs.readFileSync(
      path.join(__dirname, 'schema.sql'), 'utf8'
    )
    this.db.exec(schema)
  }

  // ─── MEETINGS ───────────────────────────────────────────

  createMeeting({ title, type, startedAt, audioPath, language }) {
    const id = uuidv4()
    this.db.prepare(`
      INSERT INTO meetings (id, title, type, started_at, audio_path, language)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, title || 'Untitled Meeting', type || 'other', startedAt, audioPath, language || 'en')
    return id
  }

  updateMeeting(id, updates) {
    const allowed = ['title', 'type', 'duration_s', 'audio_path', 'language', 'accuracy']
    const fields = Object.keys(updates).filter(k => allowed.includes(k))
    if (!fields.length) return
    const sql = `UPDATE meetings SET ${fields.map(f => `${f} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    this.db.prepare(sql).run(...fields.map(f => updates[f]), id)
  }

  getMeeting(id) {
    const meeting = this.db.prepare('SELECT * FROM meetings WHERE id = ?').get(id)
    if (!meeting) return null
    meeting.summary = this.getSummary(id)
    meeting.transcript = this.getTranscript(id)
    return meeting
  }

  getAllMeetings({ limit = 50, offset = 0, from, to } = {}) {
    let sql = 'SELECT m.*, s.tldr FROM meetings m LEFT JOIN summaries s ON s.meeting_id = m.id'
    const params = []
    if (from && to) {
      sql += ' WHERE m.started_at BETWEEN ? AND ?'
      params.push(from, to)
    }
    sql += ' ORDER BY m.started_at DESC LIMIT ? OFFSET ?'
    params.push(limit, offset)
    return this.db.prepare(sql).all(...params)
  }

  deleteMeeting(id) {
    // CASCADE will delete summaries + transcripts
    this.db.prepare('DELETE FROM meetings WHERE id = ?').run(id)
  }

  getMeetingsInRange(from, to) {
    return this.db.prepare(`
      SELECT m.*, s.tldr, s.decisions, s.action_items, s.open_questions, s.keywords
      FROM meetings m
      LEFT JOIN summaries s ON s.meeting_id = m.id
      WHERE m.started_at BETWEEN ? AND ?
      ORDER BY m.started_at ASC
    `).all(from, to).map(row => ({
      ...row,
      decisions: JSON.parse(row.decisions || '[]'),
      action_items: JSON.parse(row.action_items || '[]'),
      open_questions: JSON.parse(row.open_questions || '[]'),
      keywords: JSON.parse(row.keywords || '[]'),
    }))
  }

  searchMeetings(query) {
    // Full-text search via FTS5
    return this.db.prepare(`
      SELECT DISTINCT m.id, m.title, m.started_at, m.duration_s,
        snippet(transcript_fts, 0, '<mark>', '</mark>', '...', 20) as excerpt
      FROM transcript_fts
      JOIN meetings m ON m.id = transcript_fts.meeting_id
      WHERE transcript_fts MATCH ?
      ORDER BY rank
      LIMIT 20
    `).all(query)
  }

  // ─── SUMMARIES ──────────────────────────────────────────

  saveSummary(meetingId, summary) {
    const id = uuidv4()
    this.db.prepare(`
      INSERT OR REPLACE INTO summaries
      (id, meeting_id, tldr, context, decisions, action_items, open_questions, sentiment, keywords)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, meetingId,
      summary.tldr,
      summary.context,
      JSON.stringify(summary.decisions || []),
      JSON.stringify(summary.actionItems || []),
      JSON.stringify(summary.openQuestions || []),
      JSON.stringify(summary.sentiment || {}),
      JSON.stringify(summary.keywords || []),
    )
    return id
  }

  getSummary(meetingId) {
    const row = this.db.prepare('SELECT * FROM summaries WHERE meeting_id = ?').get(meetingId)
    if (!row) return null
    return {
      ...row,
      decisions: JSON.parse(row.decisions || '[]'),
      actionItems: JSON.parse(row.action_items || '[]'),
      openQuestions: JSON.parse(row.open_questions || '[]'),
      sentiment: JSON.parse(row.sentiment || '{}'),
      keywords: JSON.parse(row.keywords || '[]'),
    }
  }

  // ─── TRANSCRIPTS ────────────────────────────────────────

  saveTranscriptSegments(meetingId, segments) {
    const insert = this.db.prepare(`
      INSERT INTO transcripts (id, meeting_id, speaker, start_ms, end_ms, text)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    const insertFTS = this.db.prepare(`
      INSERT INTO transcript_fts (text, meeting_id, speaker) VALUES (?, ?, ?)
    `)

    const tx = this.db.transaction((segs) => {
      for (const seg of segs) {
        const id = uuidv4()
        insert.run(id, meetingId, seg.speaker, seg.startMs, seg.endMs, seg.text)
        insertFTS.run(seg.text, meetingId, seg.speaker)
      }
    })

    tx(segments)
  }

  getTranscript(meetingId) {
    return this.db.prepare(`
      SELECT * FROM transcripts WHERE meeting_id = ? ORDER BY start_ms ASC
    `).all(meetingId)
  }

  // ─── PERIOD REPORTS ─────────────────────────────────────

  savePeriodReport({ label, from, to, meetingIds, ...report }) {
    const id = uuidv4()
    this.db.prepare(`
      INSERT INTO period_reports
      (id, period_label, period_from, period_to, meeting_ids, meeting_count,
       total_duration_s, executive_summary, all_decisions, open_actions,
       recurring_questions, top_topics, speaker_stats, ai_insights, keywords)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, label, from, to,
      JSON.stringify(meetingIds),
      meetingIds.length,
      report.totalDurationS || 0,
      report.executiveSummary,
      JSON.stringify(report.allDecisions || []),
      JSON.stringify(report.openActions || []),
      JSON.stringify(report.recurringQuestions || []),
      JSON.stringify(report.topTopics || []),
      JSON.stringify(report.speakerStats || []),
      JSON.stringify(report.aiInsights || []),
      JSON.stringify(report.keywords || []),
    )
    return id
  }

  getPeriodReport(id) {
    const row = this.db.prepare('SELECT * FROM period_reports WHERE id = ?').get(id)
    if (!row) return null
    const jsonFields = ['meeting_ids', 'all_decisions', 'open_actions',
      'recurring_questions', 'top_topics', 'speaker_stats', 'ai_insights', 'keywords']
    jsonFields.forEach(f => { if (row[f]) row[f] = JSON.parse(row[f]) })
    return row
  }

  getAllPeriodReports() {
    return this.db.prepare(
      'SELECT id, period_label, period_from, period_to, meeting_count, created_at FROM period_reports ORDER BY created_at DESC'
    ).all()
  }

  close() { this.db.close() }
}

module.exports = BriefOSDatabase
```

---

## electron-store — settings

```js
// Usage anywhere in main process:
const Store = require('electron-store')

const store = new Store({
  encryptionKey: 'briefos-aes-key-2025',  // encrypts the file
  defaults: {
    openaiApiKey: '',
    anthropicApiKey: '',
    huggingfaceToken: '',
    microphoneDevice: 'default',
    systemAudioDevice: 'virtual-audio-capturer',
    launchAtStartup: false,
    hotkeyRecord: 'CmdOrCtrl+Shift+B',
    retentionDays: 90,
    plan: 'free',        // 'free' | 'pro' | 'enterprise'
    licenseKey: '',
    notionToken: '',
    slackWebhookUrl: '',
    smtpHost: '',
    smtpUser: '',
    smtpPass: '',
    onboardingComplete: false,
  }
})

// Get / set
const key = store.get('openaiApiKey')
store.set('openaiApiKey', 'sk-...')
store.delete('licenseKey')
```

---

## Common patterns

```js
// Always parse JSON fields when reading from DB
const meetings = db.getAllMeetings()
// action_items is a string in DB — parse before use:
meetings.forEach(m => {
  if (m.action_items) m.action_items = JSON.parse(m.action_items)
})

// Always use transactions for bulk inserts
const tx = db.db.transaction((items) => {
  for (const item of items) stmt.run(item)
})
tx(myArray)

// Always check if meeting exists before updating
const meeting = db.getMeeting(id)
if (!meeting) throw new Error(`Meeting ${id} not found`)
```
