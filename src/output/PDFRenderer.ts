import { join } from 'node:path'
import { app } from 'electron'
import puppeteer from 'puppeteer'
import { getDatabase } from '@storage/Database'
import {
  renderDocument,
  escapeHtml,
  bulletList,
  priorityPill,
  keywordCloud
} from './pdfTemplate'
import type { ActionItem } from '@ai/SummaryEngine'

// =============================================================================
// PDFRenderer — exports a single meeting's Brief to a styled A4 PDF via
// Puppeteer. Builds HTML with the shared pdfTemplate helpers (design tokens),
// then setContent → page.pdf. Pro-only gating happens at the IPC layer.
// =============================================================================

function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString()
}

function renderActionItems(items: ActionItem[]): string {
  if (!items || items.length === 0) return '<p class="muted">No action items</p>'
  return items
    .map(
      (a) => `
      <div class="action">
        <div><span class="who">${escapeHtml(a.person)}</span> ${priorityPill(a.priority)}</div>
        <div>${escapeHtml(a.task)}</div>
        ${a.deadline ? `<div class="when mono">Due: ${escapeHtml(a.deadline)}</div>` : ''}
      </div>`
    )
    .join('')
}

function renderSentiment(sentiment: Record<string, number> | undefined): string {
  if (!sentiment) return ''
  const seg = (val: number, color: string) =>
    val > 0
      ? `<span style="display:inline-block;background:${color};height:10px;width:${val}%;"></span>`
      : ''
  return `
    <div style="border-radius:999px;overflow:hidden;border:1px solid var(--border);display:flex;margin:6px 0;">
      ${seg(sentiment.positive ?? 0, 'var(--green)')}
      ${seg(sentiment.neutral ?? 0, 'var(--text3)')}
      ${seg(sentiment.tense ?? 0, 'var(--red)')}
    </div>
    <div class="muted" style="font-size:11px;">
      Positive ${sentiment.positive ?? 0}% · Neutral ${sentiment.neutral ?? 0}% · Tense ${sentiment.tense ?? 0}%
    </div>`
}

/** Build the meeting-brief HTML document from a DB meeting record. */
function buildMeetingHtml(meeting: Record<string, any>): string {
  const summary = (meeting.summary ?? {}) as Record<string, any>
  const title = meeting.title || 'Untitled Meeting'

  const body = `
    <div class="hero">
      <h1>${escapeHtml(title)}</h1>
      <div class="meta mono">${escapeHtml(formatDate(meeting.started_at))} · ${escapeHtml(
        meeting.type || 'other'
      )}</div>
      <div class="stat-row">
        <div class="stat"><div class="num">${formatDuration(meeting.duration_s ?? 0)}</div><div class="lbl">Duration</div></div>
        <div class="stat"><div class="num">${escapeHtml((meeting.language || 'en').toUpperCase())}</div><div class="lbl">Language</div></div>
        <div class="stat"><div class="num">${Math.round((meeting.accuracy ?? 0) * 100)}%</div><div class="lbl">Accuracy</div></div>
      </div>
    </div>

    <div class="card">
      <h2>TL;DR</h2>
      <p>${escapeHtml(summary.tldr || '—')}</p>
    </div>

    <div class="card">
      <h2>Context</h2>
      <p class="secondary">${escapeHtml(summary.context || '—')}</p>
    </div>

    <div class="grid2">
      <div class="card">
        <h2>Decisions</h2>
        ${bulletList(summary.decisions ?? [], 'No decisions recorded')}
      </div>
      <div class="card">
        <h2>Open Questions</h2>
        ${bulletList(summary.openQuestions ?? [], 'No open questions')}
      </div>
    </div>

    <div class="card">
      <h2>Action Items</h2>
      ${renderActionItems((summary.actionItems ?? []) as ActionItem[])}
    </div>

    <div class="grid2">
      <div class="card">
        <h2>Sentiment</h2>
        ${renderSentiment(summary.sentiment)}
      </div>
      <div class="card">
        <h2>Keywords</h2>
        ${keywordCloud(summary.keywords ?? [])}
      </div>
    </div>
  `
  return renderDocument(title, body)
}

/**
 * Export a meeting to PDF. Returns the output path. If outputPath is omitted,
 * writes to the user's Downloads folder.
 */
export async function exportMeetingPdf(meetingId: string, outputPath?: string): Promise<string> {
  console.log('[pdf] exporting meeting', meetingId)
  const db = getDatabase()
  const meeting = db.getMeeting(meetingId)
  if (!meeting) throw new Error(`Meeting ${meetingId} not found`)

  const safeTitle = String(meeting.title || 'meeting').replace(/[^\w\-]+/g, '_').slice(0, 60)
  const target = outputPath ?? join(app.getPath('downloads'), `${safeTitle}.pdf`)

  const html = buildMeetingHtml(meeting)

  let browser
  try {
    browser = await puppeteer.launch({ headless: true })
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })
    await page.pdf({
      path: target,
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', bottom: '20mm', left: '16mm', right: '16mm' }
    })
    console.log('[pdf] wrote', target)
    return target
  } catch (err) {
    console.error('[pdf] export failed', err)
    throw new Error(`PDF export failed: ${(err as Error).message}`)
  } finally {
    await browser?.close()
  }
}
