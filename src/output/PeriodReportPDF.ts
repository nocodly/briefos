import { join } from 'node:path'
import { app } from 'electron'
import puppeteer from 'puppeteer'
import { getDatabase } from '@storage/Database'
import { renderDocument, escapeHtml, priorityPill, keywordCloud } from './pdfTemplate'

// =============================================================================
// PeriodReportPDF — exports a saved Period Intelligence Report to a styled A4
// PDF via Puppeteer, reusing the shared pdfTemplate helpers.
// =============================================================================

function buildHtml(r: Record<string, any>): string {
  const decisions: any[] = r.all_decisions ?? []
  const actions: any[] = r.open_actions ?? []
  const questions: any[] = r.recurring_questions ?? []
  const topics: any[] = r.top_topics ?? []
  const speakers: any[] = r.speaker_stats ?? []
  const insights: any[] = r.ai_insights ?? []
  const themes: string[] = r.main_themes ?? []
  const totalMin = speakers.reduce((sum, s) => sum + (s.totalMinutes || 0), 0)

  const section = (title: string, inner: string) =>
    `<div class="card"><h2>${escapeHtml(title)}</h2>${inner}</div>`

  const decisionsHtml = decisions.length
    ? `<ul class="clean">${decisions
        .map(
          (d) =>
            `<li>${escapeHtml(d.decision)} <span class="muted">— ${escapeHtml(d.meeting)} · ${escapeHtml(
              d.date
            )}</span></li>`
        )
        .join('')}</ul>`
    : '<p class="muted">None</p>'

  const actionsHtml = actions.length
    ? actions
        .map(
          (a) => `<div class="action">
            <div><span class="who">${escapeHtml(a.person)}</span> ${priorityPill(a.priority)}</div>
            <div>${escapeHtml(a.task)}</div>
            <div class="when mono">from ${escapeHtml(a.sourceMeeting)}${
              a.deadline ? ` · due ${escapeHtml(a.deadline)}` : ''
            }</div>
          </div>`
        )
        .join('')
    : '<p class="muted">None</p>'

  const questionsHtml = questions.length
    ? `<ul class="clean">${questions
        .map(
          (q) =>
            `<li>${escapeHtml(q.question)} <span class="muted">— appeared in ${
              (q.appearedIn ?? []).length
            } meetings</span></li>`
        )
        .join('')}</ul>`
    : '<p class="muted">None</p>'

  const topicsHtml = topics.length
    ? topics
        .map((t) => `<div class="action"><span class="who">${escapeHtml(t.topic)}</span> <span class="muted">×${t.count}</span></div>`)
        .join('')
    : '<p class="muted">None</p>'

  const speakersHtml = speakers.length
    ? speakers
        .map(
          (s) => `<div class="action"><span class="who">${escapeHtml(s.name)}</span>
            <span class="muted">${s.totalMinutes}m · ${s.percentage}%</span></div>`
        )
        .join('')
    : '<p class="muted">None</p>'

  const insightsHtml = insights.length
    ? insights
        .map(
          (i) =>
            `<div class="action"><span class="pill">${escapeHtml(i.type)}</span> ${escapeHtml(i.text)}</div>`
        )
        .join('')
    : '<p class="muted">None</p>'

  const themesHtml = themes.length
    ? `<ul class="clean">${themes.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>`
    : '<p class="muted">None</p>'

  const body = `
    <div class="hero">
      <h1>${escapeHtml(r.period_label)} — Intelligence Report</h1>
      <div class="meta mono">${escapeHtml(r.period_from)} → ${escapeHtml(r.period_to)}</div>
      <div class="stat-row">
        <div class="stat"><div class="num">${r.meeting_count ?? 0}</div><div class="lbl">Meetings</div></div>
        <div class="stat"><div class="num">${Math.round(totalMin)}</div><div class="lbl">Minutes</div></div>
        <div class="stat"><div class="num">${decisions.length}</div><div class="lbl">Decisions</div></div>
        <div class="stat"><div class="num">${actions.length}</div><div class="lbl">Open actions</div></div>
      </div>
    </div>

    ${section('Executive Summary', `<p>${escapeHtml(r.executive_summary || '—')}</p>`)}
    ${section('Main Themes', themesHtml)}
    ${section('AI Insights', insightsHtml)}
    ${section('All Decisions', decisionsHtml)}
    ${section('Open Actions', actionsHtml)}
    <div class="grid2">
      ${section('Speaker Time', speakersHtml)}
      ${section('Top Topics', topicsHtml)}
    </div>
    ${section('Recurring Questions', questionsHtml)}
    ${section('Keywords', keywordCloud(r.keywords ?? []))}
  `
  return renderDocument(`${r.period_label} — Intelligence Report`, body)
}

export async function exportPeriodReportPdf(
  reportId: string,
  outputPath?: string
): Promise<string> {
  console.log('[period-pdf] exporting report', reportId)
  const report = getDatabase().getPeriodReport(reportId)
  if (!report) throw new Error(`Period report ${reportId} not found`)

  const safe = String(report.period_label || 'period').replace(/[^\w\-]+/g, '_').slice(0, 60)
  const target = outputPath ?? join(app.getPath('downloads'), `BriefOS_${safe}.pdf`)

  let browser
  try {
    browser = await puppeteer.launch({ headless: true })
    const page = await browser.newPage()
    await page.setContent(buildHtml(report), { waitUntil: 'networkidle0' })
    await page.pdf({
      path: target,
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', bottom: '20mm', left: '16mm', right: '16mm' }
    })
    console.log('[period-pdf] wrote', target)
    return target
  } catch (err) {
    console.error('[period-pdf] export failed', err)
    throw new Error(`Period report PDF export failed: ${(err as Error).message}`)
  } finally {
    await browser?.close()
  }
}
