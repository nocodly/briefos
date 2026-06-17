---
name: ai-pipeline
description: Use this skill for ANY task involving Whisper transcription, Claude summary generation, pyannote speaker diarization, prompt templates, or the Period Report AI engine in BriefOS. Triggers when: creating or editing WhisperClient.js, TranscriptMerger.js, SummaryEngine.js, PeriodReportEngine.js, TemplateSelector.js, diarizer.py, or any file in src/ai/prompts/ — or when the user asks "transcription not working", "Claude returning wrong JSON", "speakers not detected", "prompt not triggering", "period report failing", "how to add a new meeting template". Always use this skill before touching any AI code — it contains the exact JSON schemas, prompt templates, and API call patterns that must stay consistent.
---

# AI Pipeline — BriefOS

## Pipeline order

```
WAV file
  ↓
ChunkManager — split into 30s chunks
  ↓
WhisperClient — parallel transcription (OpenAI API)
  ↓
TranscriptMerger — merge chunks, fix overlaps
  ↓
diarizer.py (Python subprocess) — who said what
  ↓
SummaryEngine — Claude API → structured JSON
  ↓
SQLite storage
```

---

## WhisperClient.js — parallel chunk transcription

```js
// src/transcription/WhisperClient.js
const OpenAI = require('openai')
const fs = require('fs')

class WhisperClient {
  constructor(apiKey) {
    this.client = new OpenAI({ apiKey })
  }

  // Transcribe all chunks in parallel (max 5 concurrent)
  async transcribeChunks(chunks) {
    const CONCURRENCY = 5
    const results = new Array(chunks.length)

    for (let i = 0; i < chunks.length; i += CONCURRENCY) {
      const batch = chunks.slice(i, i + CONCURRENCY)
      const batchResults = await Promise.all(
        batch.map(chunk => this.transcribeChunk(chunk))
      )
      batchResults.forEach((r, j) => results[i + j] = r)
    }

    return results
  }

  async transcribeChunk(chunk) {
    try {
      const response = await this.client.audio.transcriptions.create({
        file: fs.createReadStream(chunk.path),
        model: 'whisper-1',
        response_format: 'verbose_json',  // includes timestamps
        timestamp_granularities: ['word'],
      })

      return {
        chunkIndex: chunk.index,
        startMs: chunk.startMs,
        endMs: chunk.endMs,
        text: response.text,
        words: response.words || [],
        language: response.language,
      }
    } catch (err) {
      // Graceful fallback — don't crash entire pipeline
      console.error(`Chunk ${chunk.index} failed:`, err.message)
      return { chunkIndex: chunk.index, startMs: chunk.startMs, endMs: chunk.endMs, text: '', words: [] }
    }
  }
}

module.exports = WhisperClient
```

---

## diarizer.py — speaker detection

```python
# python/diarizer.py
import sys
import json
import torch
from pyannote.audio import Pipeline

def diarize(audio_path, hf_token, num_speakers=None):
    pipeline = Pipeline.from_pretrained(
        "pyannote/speaker-diarization-3.1",
        use_auth_token=hf_token
    )

    # Use GPU if available
    if torch.cuda.is_available():
        pipeline = pipeline.to(torch.device("cuda"))

    params = {}
    if num_speakers:
        params['num_speakers'] = num_speakers

    diarization = pipeline(audio_path, **params)

    segments = []
    for turn, _, speaker in diarization.itertracks(yield_label=True):
        segments.append({
            "speaker": speaker,        # "SPEAKER_00", "SPEAKER_01" etc
            "start_ms": int(turn.start * 1000),
            "end_ms": int(turn.end * 1000),
        })

    print(json.dumps(segments))  # stdout → Node.js reads this

if __name__ == "__main__":
    audio_path = sys.argv[1]
    hf_token = sys.argv[2]
    num_speakers = int(sys.argv[3]) if len(sys.argv) > 3 else None
    diarize(audio_path, hf_token, num_speakers)
```

## Calling diarizer from Node.js

```js
// src/transcription/WhisperClient.js or SummaryEngine.js
const { spawn } = require('child_process')

function runDiarizer(audioPath, hfToken, numSpeakers) {
  return new Promise((resolve, reject) => {
    const args = [
      path.join(__dirname, '../../python/diarizer.py'),
      audioPath,
      hfToken,
    ]
    if (numSpeakers) args.push(numSpeakers.toString())

    const proc = spawn('python', args)
    let output = ''
    let errors = ''

    proc.stdout.on('data', (d) => output += d.toString())
    proc.stderr.on('data', (d) => errors += d.toString())

    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`Diarizer failed: ${errors}`))
      try {
        resolve(JSON.parse(output))
      } catch {
        reject(new Error('Diarizer output not valid JSON'))
      }
    })
  })
}
```

---

## Claude summary prompt — EXACT schema

File: `src/ai/prompts/default.md`

```
You are a meeting intelligence assistant. Analyze this transcript and return ONLY valid JSON.
No markdown, no preamble, no code fences — just the raw JSON object.

Return EXACTLY this schema:
{
  "title": "Short meeting title, max 8 words",
  "type": "strategy|standup|sales|onboarding|review|other",
  "language": "en|uk|ru|de|fr|...",
  "tldr": "2-3 sentences: what this call was about and what was decided",
  "context": "Who ran the meeting, what was the purpose, what stage of project",
  "decisions": ["Concrete decision made — specific, not vague"],
  "actionItems": [
    {
      "person": "Full name or 'Team' if no specific person",
      "task": "Specific actionable task description",
      "deadline": "Date string or timeframe mentioned, null if none stated",
      "priority": "high|medium|low"
    }
  ],
  "openQuestions": ["Question that was raised but NOT resolved on this call"],
  "sentiment": { "positive": 72, "neutral": 22, "tense": 6 },
  "keywords": ["top", "10", "key", "terms", "from", "discussion"]
}

Rules:
- Respond in the SAME language as the majority of the transcript
- Extract only decisions that were explicitly confirmed, not just discussed
- For actionItems: only tasks where someone accepted responsibility
- sentiment numbers must sum to 100
- If a field has no data, use empty array [] not null
```

## SummaryEngine.js

```js
// src/ai/SummaryEngine.js
const Anthropic = require('@anthropic-ai/sdk')
const fs = require('fs')
const path = require('path')

class SummaryEngine {
  constructor(apiKey) {
    this.client = new Anthropic({ apiKey })
  }

  async generateSummary(transcript, meetingType = 'auto') {
    const promptPath = this.selectPrompt(meetingType)
    const systemPrompt = fs.readFileSync(promptPath, 'utf8')

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Here is the meeting transcript:\n\n${transcript}`
        }
      ]
    })

    const rawText = response.content[0].text
    return this.parseJSON(rawText)
  }

  parseJSON(raw) {
    // Strip any accidental markdown fences
    const clean = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim()

    try {
      return JSON.parse(clean)
    } catch (err) {
      throw new Error(`Claude returned invalid JSON: ${err.message}\nRaw: ${raw.slice(0, 200)}`)
    }
  }

  selectPrompt(type) {
    const map = {
      'standup': 'standup.md',
      'sales': 'sales-call.md',
      'onboarding': 'client-onboarding.md',
      'auto': 'default.md',
      'default': 'default.md',
    }
    const file = map[type] || 'default.md'
    return path.join(__dirname, 'prompts', file)
  }
}

module.exports = SummaryEngine
```

---

## Period Report prompt — `src/ai/prompts/period-report.md`

```
You are analyzing multiple meeting summaries from a specific time period.
Return ONLY valid JSON — no markdown, no preamble.

You will receive an array of meeting summaries. Cross-reference them to find:
- Strategic themes that appeared in multiple meetings
- All decisions made across the entire period
- Action items that are still open (not marked complete)
- Questions that appeared in multiple meetings but were never resolved
- Patterns in how the team communicates and decides

Return EXACTLY this schema:
{
  "executiveSummary": "3-5 sentences summarizing what this entire period was about",
  "mainThemes": ["Strategic theme that ran through multiple meetings"],
  "allDecisions": [
    { "decision": "text", "meeting": "meeting title", "date": "YYYY-MM-DD" }
  ],
  "openActions": [
    {
      "person": "name",
      "task": "text",
      "deadline": "date or null",
      "priority": "high|medium|low",
      "sourceMeeting": "meeting title",
      "sourceDate": "YYYY-MM-DD"
    }
  ],
  "recurringQuestions": [
    { "question": "text", "appearedIn": ["meeting title 1", "meeting title 2"] }
  ],
  "topTopics": [{ "topic": "name", "count": 8 }],
  "speakerStats": [{ "name": "name", "totalMinutes": 45, "percentage": 52 }],
  "aiInsights": [
    { "type": "pattern|warning|opportunity", "text": "Specific insight with evidence" }
  ],
  "keywords": ["top 15 recurring terms across all meetings"]
}
```

## PeriodReportEngine.js

```js
// src/ai/PeriodReportEngine.js
const Anthropic = require('@anthropic-ai/sdk')
const fs = require('fs')
const path = require('path')
const Database = require('../storage/Database')

class PeriodReportEngine {
  constructor(apiKey) {
    this.client = new Anthropic({ apiKey })
    this.db = new Database()
  }

  async generate({ from, to, label }) {
    // 1. Load all summaries in date range
    const meetings = this.db.getMeetingsInRange(from, to)
    if (meetings.length === 0) throw new Error('No meetings found in this period')

    // 2. Build context for Claude — all summaries as JSON array
    const summariesContext = meetings.map(m => ({
      title: m.title,
      date: m.started_at,
      duration: m.duration_s,
      tldr: m.summary?.tldr,
      decisions: m.summary?.decisions || [],
      actionItems: m.summary?.actionItems || [],
      openQuestions: m.summary?.openQuestions || [],
      keywords: m.summary?.keywords || [],
      participants: m.speakers || [],
    }))

    const systemPrompt = fs.readFileSync(
      path.join(__dirname, 'prompts/period-report.md'), 'utf8'
    )

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Period: ${label} (${from} to ${to})\nMeetings: ${meetings.length}\n\nHere are all meeting summaries:\n\n${JSON.stringify(summariesContext, null, 2)}`
      }]
    })

    const report = this.parseJSON(response.content[0].text)

    // 3. Save to SQLite
    const reportId = this.db.savePeriodReport({
      label, from, to,
      meetingIds: meetings.map(m => m.id),
      ...report
    })

    return { reportId, ...report }
  }

  parseJSON(raw) {
    const clean = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
    return JSON.parse(clean)
  }
}

module.exports = PeriodReportEngine
```

---

## TemplateSelector.js — auto-detect meeting type

```js
// src/ai/TemplateSelector.js
function detectMeetingType(transcript) {
  const text = transcript.toLowerCase()
  const scores = {
    standup: ['yesterday', 'today', 'blocker', 'blocked', 'standup', 'daily', 'progress'],
    sales: ['pricing', 'budget', 'proposal', 'contract', 'demo', 'trial', 'discount', 'close'],
    onboarding: ['welcome', 'onboard', 'getting started', 'setup', 'introduce', 'first time'],
    review: ['review', 'retrospective', 'retro', 'sprint', 'what went well', 'improve'],
  }

  const counts = {}
  for (const [type, keywords] of Object.entries(scores)) {
    counts[type] = keywords.filter(kw => text.includes(kw)).length
  }

  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  return best[1] >= 2 ? best[0] : 'default'
}

module.exports = { detectMeetingType }
```

---

## API cost reference

| Operation | Model | Tokens | Cost |
|-----------|-------|--------|------|
| 30-min transcription | whisper-1 | — | ~$0.18 |
| Meeting summary | claude-sonnet-4 | ~3k in + 500 out | ~$0.02 |
| Period report (10 meetings) | claude-sonnet-4 | ~15k in + 2k out | ~$0.08 |
| **Total per meeting** | | | **~$0.21** |

## Error handling rules

- Whisper chunk fails → log error, continue with empty text for that chunk (don't fail whole meeting)
- Claude returns invalid JSON → retry once with "return ONLY JSON, no other text"
- Diarizer Python crashes → skip diarization, label all speakers as "Speaker" (don't block summary)
- Period report fails → show error with "retry" button, don't lose meeting data
