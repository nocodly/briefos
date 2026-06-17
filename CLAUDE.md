# BriefOS — Claude Code Project Context

## What we're building
BriefOS is a local-first AI meeting recorder for Windows.
The app lives in the system tray. User joins any meeting (Google Meet, Zoom, Telegram, Slack, Teams),
presses Ctrl+Shift+B, BriefOS records system audio + microphone, transcribes via Whisper API,
generates a structured summary via Claude API, saves everything locally in SQLite.
Key differentiator: Period Intelligence Reports — cross-meeting analysis over week/month/quarter.

## Tech stack
- Electron 28 + electron-vite (build) + electron-builder (Windows .exe)
- React 18 + Tailwind CSS (renderer UI)
- FFmpeg + node-record-lpcm16 (audio capture)
- OpenAI Whisper API whisper-1 (transcription)
- Anthropic Claude claude-sonnet-4-5 (summaries + period reports)
- pyannote.audio Python subprocess (speaker diarization)
- better-sqlite3 (local database)
- electron-store (encrypted settings)
- Puppeteer (PDF export)

## Project structure
```
src/main/          ← Electron main process (Node.js)
src/capture/       ← Audio recording pipeline
src/transcription/ ← Whisper + transcript merge
src/ai/            ← Claude summary + period report engine
src/ai/prompts/    ← Prompt .md files
src/storage/       ← SQLite database + file manager
src/output/        ← PDF, Notion, Slack, Email exporters
src/renderer/      ← React UI components
python/            ← diarizer.py (pyannote)
assets/            ← icons
.github/workflows/ ← GitHub Actions CI/CD
```

## Design system — ALWAYS use these tokens, never hardcode colors
```
Background:    #F7F9FC    (--bg)
Surface:       #FFFFFF    (--surface)
Accent blue:   #1A56DB    (--accent)
Deep navy:     #0A2540    (--blue-deep)   ← sidebar background
Blue tint:     #EBF3FF    (--blue-tint)   ← hover states
Border:        #D8E5F5    (--border)      ← always 1px
Text primary:  #0A2540    (--text)
Text secondary:#3D5A80    (--text2)
Text muted:    #7A95B8    (--text3)
Green:         #0EA874    (--green)
Amber:         #D97706    (--amber)
Red:           #E53E3E    (--red)         ← recording state

Fonts:
  Headings:  Outfit 700-800   (font-display)
  Body:      DM Sans 400-500  (font-body)
  Code/time: DM Mono 400      (font-mono)

Border radius:  10px cards, 16px panels, 22px modals
Transitions:    cubic-bezier(0.4, 0, 0.2, 1) — always smooth
```

## IPC channels — use EXACTLY these names, never invent new ones
```
recording:start          recording:stop
recording:pause          recording:resume
recording:status         recording:tick (push → renderer)
meetings:getAll          meetings:getOne
meetings:delete          meetings:search
meetings:updateTitle     meetings:renameSpeakers
ai:generateSummary       ai:regenerateSummary
ai:generatePeriodReport
export:pdf               export:notion
export:slack             export:email
export:clipboard         export:periodReportPdf
settings:get             settings:set
settings:getAll
audio:listDevices        audio:testLevels
progress:transcription   progress:summary
progress:periodReport    progress:done
progress:error (push → renderer)
updater:status (push → renderer)
```

## Database tables
```
meetings         — id, title, type, started_at, duration_s, audio_path, language, accuracy
summaries        — id, meeting_id, tldr, context, decisions, action_items, open_questions, sentiment, keywords
transcripts      — id, meeting_id, speaker, start_ms, end_ms, text
period_reports   — id, period_label, period_from, period_to, meeting_ids, executive_summary,
                   all_decisions, open_actions, recurring_questions, top_topics, speaker_stats, ai_insights
transcript_fts   — FTS5 virtual table for full-text search
```

## Monetization tiers
```
free:       5 meetings/month, text only, EN only, clipboard export
pro:        unlimited, PDF/Notion/Slack/Email, all languages, diarization, Period Reports ($12/mo)
enterprise: on-premise, SSO, Jira, custom prompts (custom price)
```

## Critical rules — never break these
1. NEVER hardcode colors — always use CSS variables or Tailwind tokens above
2. NEVER invent new IPC channel names — use the list above
3. ALWAYS add try/catch on every API call (Whisper, Claude, Notion, Slack)
4. ALWAYS console.log at start and end of every major operation for debugging
5. NEVER use `remote` module in Electron — it's deprecated, use IPC + preload
6. NEVER set contextIsolation: false — security requirement
7. ALWAYS store audio files locally — never upload to any server
8. ALWAYS use `ipcMain.handle` + `ipcRenderer.invoke` for two-way communication
9. JSON fields in SQLite — always JSON.stringify() on save, JSON.parse() on read
10. Python diarizer — always child_process.spawn, never inline Node.js

## Skills — read before writing code in these areas
- `electron-ipc` skill    → before ANY main process or IPC code
- `audio-capture` skill   → before ANY audio recording code
- `ai-pipeline` skill     → before ANY Whisper/Claude/diarizer code
- `sqlite-storage` skill  → before ANY database code
- `react-ui` skill        → before ANY React component code
- `period-report` skill   → before ANY period report feature code

## Build order (if starting from scratch)
1. package.json → electron-builder.yml → vite.config.js → tailwind.config.js
2. src/main/index.js → tray.js → ipc.js → preload.js
3. src/capture/AudioCapture.js → ChunkManager.js
4. src/transcription/WhisperClient.js → TranscriptMerger.js
5. python/diarizer.py → requirements.txt
6. src/storage/schema.sql → Database.js
7. src/ai/SummaryEngine.js → PeriodReportEngine.js → prompts/*.md
8. src/output/PDFRenderer.js → exporters
9. src/renderer/ — App.jsx → Onboarding → Overlay → Processing → SpeakerMapper → MeetingView → Dashboard → PeriodReport → Settings
10. .github/workflows/build.yml

## Environment variables (from .env)
OPENAI_API_KEY        — Whisper transcription
ANTHROPIC_API_KEY     — Claude summaries
HUGGING_FACE_TOKEN    — pyannote model download
APP_ENV               — development | production
