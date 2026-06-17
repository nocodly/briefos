---
name: period-report
description: Use this skill for ANY task involving the Period Intelligence Report feature in BriefOS — including PeriodReport.jsx, PeriodReportEngine.js, PeriodReportPDF.js, or the period-report.md prompt. Triggers when: building the period report page, generating cross-meeting analysis, exporting period reports, or when the user asks "how to aggregate meetings", "cross-meeting summary", "monthly report not working", "period report PDF", "how to find recurring questions across meetings", "speaker stats for the month". This is BriefOS's unique differentiator — always treat it as high priority.
---

# Period Intelligence Report — BriefOS

## What makes this unique

No competitor does this. Otter.ai, Fireflies, and others summarize individual meetings. BriefOS is the only tool that analyzes **all your meetings over a period** and finds:
- Decisions made across ALL calls that month
- Tasks that were assigned but NEVER completed
- Questions that kept coming up in MULTIPLE meetings
- Strategic themes that dominated the period
- Who talked the most across the whole month

This is the feature that sells the Pro plan to teams.

---

## User flow

```
Dashboard → sidebar "Period Reports"
  ↓
PeriodReport.jsx loads (empty state)
  ↓
User selects period: This week / May 2025 / Q2 / custom range
  ↓
User clicks "Generate Report"
  ↓
IPC: ai:generatePeriodReport → PeriodReportEngine.js
  ↓
Engine pulls all summaries from SQLite for that date range
  ↓
Sends aggregated JSON to Claude with period-report prompt
  ↓
Claude returns structured analysis JSON
  ↓
Saved to period_reports table
  ↓
PeriodReport.jsx renders full Intelligence Report
```

---

## PeriodReport.jsx — page structure

```jsx
// src/renderer/PeriodReport.jsx
import { useState } from 'react'

const PERIODS = [
  { label: 'This week', getRange: () => getWeekRange() },
  { label: 'Last 30 days', getRange: () => getLast30Days() },
  { label: 'This month', getRange: () => getMonthRange() },
  { label: 'Q2 2025', getRange: () => getQuarterRange(2, 2025) },
  { label: 'This year', getRange: () => getYearRange() },
]

export default function PeriodReport({ navigate }) {
  const [selectedPeriod, setSelectedPeriod] = useState('This month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [state, setState] = useState('empty') // empty | processing | report
  const [report, setReport] = useState(null)
  const [processingStep, setProcessingStep] = useState('')

  const generate = async () => {
    const period = PERIODS.find(p => p.label === selectedPeriod)
    const { from, to } = period ? period.getRange() : { from: customFrom, to: customTo }

    setState('processing')

    // Listen for progress
    const sub = window.electron.on('progress:periodReport', ({ step }) => {
      setProcessingStep(step)
    })

    try {
      const result = await window.electron.invoke('ai:generatePeriodReport', {
        from, to, label: selectedPeriod
      })
      setReport(result)
      setState('report')
    } catch (err) {
      console.error(err)
      setState('empty')
      alert('Failed to generate report: ' + err.message)
    } finally {
      window.electron.off('progress:periodReport', sub)
    }
  }

  return (
    <div className="min-h-screen bg-bg">
      {/* Period picker bar */}
      <PeriodPicker
        periods={PERIODS}
        selected={selectedPeriod}
        onSelect={setSelectedPeriod}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFrom={setCustomFrom}
        onCustomTo={setCustomTo}
      />

      <div className="p-8">
        {state === 'empty' && <EmptyState period={selectedPeriod} onGenerate={generate} />}
        {state === 'processing' && <ProcessingState step={processingStep} />}
        {state === 'report' && <ReportView report={report} period={selectedPeriod} />}
      </div>
    </div>
  )
}
```

---

## ReportView — sections to render

```jsx
function ReportView({ report, period }) {
  return (
    <div>
      {/* 1. Hero with stats */}
      <ReportHero report={report} period={period} />

      {/* 2. Export bar */}
      <ExportBar reportId={report.id} />

      {/* 3. Two columns: executive summary + meeting timeline */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <ExecutiveSummary report={report} />
        <MeetingTimeline meetings={report.meetingIds} />
      </div>

      {/* 4. Frequency chart */}
      <FrequencyChart meetings={report.meetings} />

      {/* 5. Decisions + Open actions */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <AllDecisions decisions={report.allDecisions} />
        <OpenActions actions={report.openActions} />
      </div>

      {/* 6. Speaker time + Top topics */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <SpeakerTime stats={report.speakerStats} />
        <TopTopics topics={report.topTopics} />
      </div>

      {/* 7. Recurring questions + Keywords */}
      <div className="grid grid-cols-2 gap-4">
        <RecurringQuestions questions={report.recurringQuestions} />
        <KeywordCloud keywords={report.keywords} />
      </div>
    </div>
  )
}
```

---

## IPC handler in main process

```js
// In src/main/ipc.js
const PeriodReportEngine = require('../ai/PeriodReportEngine')

ipcMain.handle('ai:generatePeriodReport', async (event, { from, to, label }) => {
  const store = require('./store')  // electron-store instance
  const anthropicKey = store.get('anthropicApiKey')

  if (!anthropicKey) throw new Error('Anthropic API key not set. Go to Settings → API Keys.')

  const engine = new PeriodReportEngine(anthropicKey)

  // Send progress updates to renderer
  const send = (step) => event.sender.send('progress:periodReport', { step })

  send('Loading meetings from database...')
  // engine will call send() internally at key steps

  const report = await engine.generate({ from, to, label, onProgress: send })
  return report
})
```

---

## PeriodReportEngine.js — generate method with progress

```js
async generate({ from, to, label, onProgress }) {
  onProgress?.('Loading meetings from database...')
  const meetings = this.db.getMeetingsInRange(from, to)

  if (meetings.length === 0) {
    throw new Error(`No meetings found between ${from} and ${to}`)
  }

  onProgress?.(`Aggregating ${meetings.length} meetings...`)

  const context = meetings.map(m => ({
    title: m.title,
    date: m.started_at,
    durationMinutes: Math.round(m.duration_s / 60),
    tldr: m.tldr,
    decisions: m.decisions,
    actionItems: m.action_items,
    openQuestions: m.open_questions,
    keywords: m.keywords,
  }))

  onProgress?.('Sending to Claude for cross-meeting analysis...')

  const systemPrompt = fs.readFileSync(
    path.join(__dirname, 'prompts/period-report.md'), 'utf8'
  )

  const response = await this.client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: `Period: ${label}\nDate range: ${from} to ${to}\nTotal meetings: ${meetings.length}\n\n${JSON.stringify(context, null, 2)}`
    }]
  })

  onProgress?.('Parsing and saving report...')

  const report = this.parseJSON(response.content[0].text)
  const reportId = this.db.savePeriodReport({
    label, from, to,
    meetingIds: meetings.map(m => m.id),
    totalDurationS: meetings.reduce((sum, m) => sum + m.duration_s, 0),
    ...report
  })

  return { reportId, meetingCount: meetings.length, ...report }
}
```

---

## PDF export for period reports

```js
// src/output/PeriodReportPDF.js
// Uses Puppeteer — renders HTML template to PDF
async function exportPeriodReportPDF(reportId, outputPath) {
  const db = new Database()
  const report = db.getPeriodReport(reportId)

  const html = renderPeriodReportHTML(report)  // build HTML string

  const browser = await puppeteer.launch({ headless: 'new' })
  const page = await browser.newPage()
  await page.setContent(html, { waitUntil: 'networkidle0' })
  await page.pdf({
    path: outputPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '20mm', bottom: '20mm', left: '16mm', right: '16mm' }
  })
  await browser.close()

  return outputPath
}
```

---

## Key rules for this feature

- Period reports are **Pro only** — check plan before generating
- If 0 meetings in range → show friendly "No meetings recorded in this period" empty state
- Always show meeting count before generating so user knows what they're analyzing
- Save reports to SQLite so user can revisit without regenerating
- Each `openActions` item must reference `sourceMeeting` so user knows where it came from
- `recurringQuestions` only includes questions that appeared in 2+ meetings
