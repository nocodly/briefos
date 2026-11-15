import { BrowserWindow } from 'electron'
import { writeFile } from 'node:fs/promises'
import { getDatabase } from '@storage/Database'

// =============================================================================
// NotesPDF — a clean, branded A4 PDF of a meeting's AI notes, rendered with
// Electron's own Chromium (webContents.printToPDF; no extra browser download).
// Light "paper" design for printing and sharing, tangerine accents.
// =============================================================================

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Tiny markdown → HTML for our notes: headings, bullets, numbered, bold/italic. */
export function notesMarkdownToHtml(md: string): string {
  const inline = (t: string) =>
    esc(t)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
  const out: string[] = []
  let list: 'ul' | 'ol' | null = null
  const close = () => {
    if (list) out.push(`</${list}>`)
    list = null
  }
  for (const raw of md.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd()
    const h = /^(#{1,4})\s+(.*)$/.exec(line)
    const ul = /^\s*[-*•]\s+(?:\[[ xX]\]\s*)?(.*)$/.exec(line)
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    if (h) {
      close()
      const level = Math.min(h[1].length + 1, 4)
      out.push(`<h${level}>${inline(h[2])}</h${level}>`)
    } else if (ul) {
      if (list !== 'ul') {
        close()
        out.push('<ul>')
        list = 'ul'
      }
      out.push(`<li>${inline(ul[1])}</li>`)
    } else if (ol) {
      if (list !== 'ol') {
        close()
        out.push('<ol>')
        list = 'ol'
      }
      out.push(`<li>${inline(ol[1])}</li>`)
    } else if (!line.trim()) {
      close()
    } else {
      close()
      out.push(`<p>${inline(line)}</p>`)
    }
  }
  close()
  return out.join('\n')
}

function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h} h ${m} min` : `${Math.max(1, m)} min`
}

const LOGO = `<svg width="22" height="22" viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="#FF6A3D"/><rect x="7" y="9" width="3.4" height="14" rx="1.7" fill="#fff"/><rect x="12.2" y="13" width="3.4" height="8" rx="1.7" fill="#fff"/><rect x="16.4" y="13" width="3.4" height="8" rx="1.7" fill="#fff"/><rect x="21.6" y="9" width="3.4" height="14" rx="1.7" fill="#fff"/></svg>`

export function buildNotesHtml(meetingId: string, opts: { transcript?: boolean } = {}): { html: string; title: string } {
  const db = getDatabase()
  const m = db.getMeeting(meetingId) as
    | {
        title: string
        started_at: string
        duration_s: number
        enhanced_notes?: string | null
        user_notes?: string | null
        summary?: { tldr?: string; actionItems?: { person: string; task: string; deadline: string | null }[] } | null
        transcript?: { speaker: string; text: string; start_ms: number }[]
      }
    | null
  if (!m) throw new Error('Meeting not found')

  let body = ''
  if (m.enhanced_notes?.trim()) body = notesMarkdownToHtml(m.enhanced_notes)
  else if (m.summary?.tldr) {
    body = `<h2>Summary</h2><p>${esc(m.summary.tldr)}</p>`
    const items = m.summary.actionItems ?? []
    if (items.length) body += `<h2>Action items</h2><ul>${items.map((a) => `<li>${esc(a.task)}${a.person ? ` <span class="who">— ${esc(a.person)}</span>` : ''}</li>`).join('')}</ul>`
  } else if (m.user_notes?.trim()) body = notesMarkdownToHtml(m.user_notes)
  else body = '<p class="muted">No notes yet.</p>'

  const transcript =
    opts.transcript && m.transcript?.length
      ? `<section class="transcript"><h2>Transcript</h2>${m.transcript
          .map((r) => `<p><span class="who">${esc(r.speaker)}</span> ${esc(r.text)}</p>`)
          .join('')}</section>`
      : ''

  const date = new Date(m.started_at)
  const when = Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString(undefined, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(m.title)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm 18mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Segoe UI", Inter, system-ui, sans-serif; color: #15171C; font-size: 11pt; line-height: 1.55; }
  header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 14px; border-bottom: 2px solid #FF6A3D; }
  .brand { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 11pt; letter-spacing: -0.01em; }
  .brand small { color: #C9441B; font-size: 7pt; letter-spacing: .12em; text-transform: uppercase; background: #FFEDE5; padding: 2px 6px; border-radius: 99px; }
  .meta { color: #6B6F7A; font-size: 9pt; text-align: right; }
  h1 { font-size: 22pt; line-height: 1.15; margin: 22px 0 4px; letter-spacing: -0.02em; }
  .sub { color: #6B6F7A; font-size: 9.5pt; margin-bottom: 18px; }
  h2 { font-size: 12.5pt; margin: 20px 0 6px; padding-left: 10px; border-left: 3px solid #FF6A3D; letter-spacing: -0.01em; }
  h3, h4 { font-size: 11pt; margin: 14px 0 4px; }
  p { margin: 4px 0 8px; }
  ul, ol { margin: 4px 0 10px; padding-left: 18px; }
  li { margin: 3px 0; }
  li::marker { color: #FF6A3D; }
  code { background: #F3F0E9; padding: 0 4px; border-radius: 4px; font-size: 9.5pt; }
  .who { color: #C9441B; font-weight: 600; }
  .muted { color: #6B6F7A; }
  .transcript { margin-top: 26px; page-break-before: always; }
  .transcript p { font-size: 9.5pt; margin: 3px 0; }
  footer { margin-top: 28px; padding-top: 10px; border-top: 1px solid #E6E1D6; color: #9A9EA8; font-size: 8pt; }
</style></head><body>
<header><div class="brand">${LOGO} Minutama <small>Agent</small></div><div class="meta">${esc(when)}</div></header>
<h1>${esc(m.title || 'Meeting notes')}</h1>
<div class="sub">${esc(when)}${m.duration_s ? ` · ${fmtDuration(m.duration_s)}` : ''}</div>
<main>${body}</main>
${transcript}
<footer>Notes by Minutama — AI meeting agent · minutama.com</footer>
</body></html>`
  return { html, title: m.title || 'Meeting notes' }
}

/** Render the meeting notes to a PDF file at `target`. */
export async function exportNotesPdf(meetingId: string, target: string, opts: { transcript?: boolean } = {}): Promise<string> {
  const { html } = buildNotesHtml(meetingId, opts)
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } })
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    const pdf = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4', preferCSSPageSize: true })
    await writeFile(target, pdf)
    console.log('[pdf] notes exported', target)
    return target
  } finally {
    win.destroy()
  }
}

/** Safe file name that keeps Cyrillic and other letters. */
export function pdfFileName(title: string): string {
  const base = title.replace(/[^\p{L}\p{N}\- ]+/gu, ' ').trim().replace(/\s+/g, '-').slice(0, 60) || 'meeting'
  return `${base}.pdf`
}
