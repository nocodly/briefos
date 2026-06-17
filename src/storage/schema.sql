-- BriefOS SQLite schema. Loaded + exec'd on Database init (idempotent).

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
  main_themes         TEXT DEFAULT '[]',   -- JSON array
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
