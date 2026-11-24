import { app, ipcMain, clipboard, dialog, shell, BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import pkg from 'electron-updater'
const { autoUpdater } = pkg
import { getMainWindow, getOverlayWindow } from './index'
import { getDatabase } from '@storage/Database'
import { deleteMeetingFiles } from '@storage/FileManager'
import { getSetting, setSetting, getAllSettings, isProOrByok, type AppSettings } from './store'
import {
  getRecordingStatus,
  reportRecordingState,
  sendRecordingCommand,
  type RecordingReport
} from './RecordingRelay'
import { PeriodReportEngine } from '@ai/PeriodReportEngine'
import { exportNotesPdf, pdfFileName } from '@output/NotesPDF'
import { exportPeriodReportPdf } from '@output/PeriodReportPDF'
import { exportToNotion } from '@output/NotionExporter'
import { exportToSlack } from '@output/SlackNotifier'
import { exportByEmail } from '@output/EmailSender'
import { buildMeetingMarkdown } from '@output/markdown'
import {
  capsuleDismiss,
  clearHint,
  capsuleNotice,
  fitCapsule,
  getCapsule,
  setCapsuleAgentRun,
  setCapsuleLive,
  setCapsuleAsk,
  showHint,
  toggleCapsuleExpanded,
  toggleCapsuleLarge,
  type ReplyHint
} from './Capsule'
import { agentWorkdir, cancelAgentRun, detectAgents, startAgentRun, type AgentId } from './AgentRunner'

// =============================================================================
// Minutama IPC hub — the ONLY place channels are registered.
// Channel names are frozen (see electron-ipc skill); never invent new ones.
//
// Backend modules (Database, PeriodReportEngine,
// exporters) are built in later steps. Handlers below are wired to real logic
// incrementally; until then they return typed stubs marked with TODO(step:N).
// Every handler is wrapped so a thrown error becomes a structured failure the
// renderer can render instead of an unhandled rejection.
// =============================================================================

/** One-click consent message for the call chat (§201 StGB and similar laws). */
const CONSENT_TEXT =
  'Hi! I use a note-taking tool (Minutama) so I don’t miss any detail of what we discuss. Is that OK with you?'

/** Uniform result envelope for fallible operations. */
type Ok<T> = { ok: true; data: T }
type Err = { ok: false; error: string }
type Result<T> = Ok<T> | Err

function ok<T>(data: T): Ok<T> {
  return { ok: true, data }
}
function fail(error: unknown): Err {
  const message = error instanceof Error ? error.message : String(error)
  return { ok: false, error: message }
}

/**
 * Wraps a handler with logging + try/catch so every channel obeys the
 * "error handling on every call" rule and logs start/end for debugging.
 */
function handle<T>(
  channel: string,
  fn: (event: IpcMainInvokeEvent, arg: any) => Promise<T> | T
): void {
  ipcMain.handle(channel, async (event, arg) => {
    console.log(`[ipc] → ${channel}`, arg ?? '')
    try {
      const data = await fn(event, arg)
      console.log(`[ipc] ✓ ${channel}`)
      return ok(data)
    } catch (error) {
      console.error(`[ipc] ✗ ${channel}`, error)
      return fail(error)
    }
  })
}

// -- Push helpers (main → renderer) -----------------------------------------

/** Send a push event to the main window's renderer. */
export function sendToRenderer(channel: string, payload: unknown): void {
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload)
  }
}

/** Progress events emitted during long operations (transcription/summary). */
export const progress = {
  transcription: (pct: number, step: string) =>
    sendToRenderer('progress:transcription', { pct, step }),
  summary: (pct: number, step: string) => sendToRenderer('progress:summary', { pct, step }),
  periodReport: (pct: number, step: string) =>
    sendToRenderer('progress:periodReport', { pct, step }),
  done: (meetingId: string) => sendToRenderer('progress:done', { meetingId })
}

/** Recording timer tick (main → renderer + overlay). */
export function emitRecordingTick(durationMs: number): void {
  sendToRenderer('recording:tick', { durationMs })
  const overlay = getOverlayWindow()
  if (overlay && !overlay.isDestroyed()) {
    overlay.webContents.send('recording:tick', { durationMs })
  }
}

// Exports (except clipboard) are part of Pro. Legacy BYOK users keep access
// until BYOK is removed from the app.
function requireProOrByok(): void {
  if (!isProOrByok()) {
    throw new Error('PDF, Notion, Slack and email exports are part of Minutama Pro. Copy to clipboard is free.')
  }
}

// Prompt for a PDF save location; returns null if the user cancels.
async function choosePdfPath(defaultName: string): Promise<string | null> {
  const win = getMainWindow()
  const opts = {
    defaultPath: defaultName,
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  }
  const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
  return res.canceled || !res.filePath ? null : res.filePath
}

// -- Registration ------------------------------------------------------------

export function registerIpcHandlers(): void {
  console.log('[ipc] registering handlers')

  // --- Recording (renderer-owned session, mirrored by RecordingRelay) -------
  // Tray / overlay / hotkey call these; they are relayed to the main window.
  handle('recording:start', async () => {
    sendRecordingCommand('start')
    return { ok: true }
  })
  handle('recording:stop', async () => {
    sendRecordingCommand('stop')
    return { ok: true }
  })
  handle('recording:pause', async () => {
    sendRecordingCommand('pause')
    return { ok: true }
  })
  handle('recording:resume', async () => {
    sendRecordingCommand('resume')
    return { ok: true }
  })
  handle('recording:status', async () => getRecordingStatus())
  handle('recording:report', async (_e, report: RecordingReport) => {
    reportRecordingState(report)
    return { ok: true }
  })

  // --- Notepad (Minutama) ----------------------------------------------------
  handle(
    'notes:create',
    async (_e, p: { serverId: string; startedAt: string; templateId: string; language?: string }) =>
      getDatabase().createNote(p)
  )
  handle(
    'notes:appendSegment',
    async (_e, p: { meetingId: string; speaker: string; startMs: number; endMs: number; text: string }) => {
      getDatabase().appendSegment(p.meetingId, {
        speaker: p.speaker,
        startMs: p.startMs,
        endMs: p.endMs,
        text: p.text
      })
      return { ok: true }
    }
  )
  handle(
    'notes:replaceTranscript',
    async (
      _e,
      p: { meetingId: string; segments: { speaker: string; startMs: number; endMs: number; text: string }[] }
    ) => {
      getDatabase().replaceTranscript(p.meetingId, p.segments)
      return { ok: true }
    }
  )
  handle('notes:saveUserNotes', async (_e, p: { meetingId: string; notes: string }) => {
    getDatabase().saveUserNotes(p.meetingId, p.notes)
    return { ok: true }
  })
  handle(
    'notes:setStatus',
    async (_e, p: { meetingId: string; status: 'recording' | 'processing' | 'done'; durationS?: number }) => {
      getDatabase().setNoteStatus(p.meetingId, p.status, p.durationS)
      return { ok: true }
    }
  )
  handle(
    'notes:saveEnhanced',
    async (
      _e,
      p: {
        meetingId: string
        title: string
        notesMarkdown: string
        templateId: string
        actionItems: { text?: string; owner?: string; due?: string; dueDate?: string }[]
        decisions: unknown[]
      }
    ) => {
      getDatabase().saveEnhanced(p.meetingId, p)
      return { ok: true }
    }
  )

  // --- Meetings (Database) -------------------------------------------------
  handle('meetings:getAll', async (_e, filters: { limit?: number; from?: string; to?: string } = {}) =>
    getDatabase().getAllMeetings(filters)
  )
  handle('meetings:getOne', async (_e, id: string) => getDatabase().getMeeting(id))
  handle('meetings:delete', async (_e, id: string) => {
    const db = getDatabase()
    const meeting = db.getMeeting(id)
    deleteMeetingFiles(id, (meeting?.audio_path as string) ?? null)
    db.deleteMeeting(id)
    return { ok: true }
  })
  handle('meetings:search', async (_e, query: string) => getDatabase().searchMeetings(query))
  handle('meetings:updateTitle', async (_e, payload: { id: string; title: string }) => {
    getDatabase().updateTitle(payload.id, payload.title)
    return { ok: true }
  })
  // Wired now (Database exists) — used by SpeakerMapper to assign real names to
  // detected voices (SPEAKER_00 → "Anna", etc.).
  handle(
    'meetings:renameSpeakers',
    async (_e, payload: { meetingId: string; mapping: Record<string, string> }) => {
      const db = getDatabase()
      let renamed = 0
      for (const [from, to] of Object.entries(payload.mapping)) {
        if (to && to.trim() && to !== from) {
          db.renameSpeaker(payload.meetingId, from, to.trim())
          renamed++
        }
      }
      return { renamed }
    }
  )

  // --- AI (SummaryEngine / PeriodReportEngine) -----------------------------
  handle(
    'ai:generatePeriodReport',
    async (
      _e,
      payload: { from: string; to: string; label: string; server: { url: string; anonKey: string; accessToken: string } }
    ) => {
      // The plan check happens on the server (period-report → 402 for Free).
      const engine = new PeriodReportEngine(payload.server)
      return engine.generate({
        from: payload.from,
        to: payload.to,
        label: payload.label,
        onProgress: (step) => progress.periodReport(50, step)
      })
    }
  )

  // --- Export (output/*) ---------------------------------------------------
  handle('export:pdf', async (_e, payload: { meetingId: string; outputPath?: string; transcript?: boolean }) => {
    requireProOrByok()
    const meeting = getDatabase().getMeeting(payload.meetingId)
    const target = payload.outputPath ?? (await choosePdfPath(pdfFileName(String(meeting?.title || 'meeting'))))
    if (!target) return { canceled: true }
    const path = await exportNotesPdf(payload.meetingId, target, { transcript: Boolean(payload.transcript) })
    shell.showItemInFolder(path)
    return { path }
  })
  // "Add to calendar" for a task with a due date: Google Calendar in the
  // browser (prefilled, the user presses Save) or an .ics file opened with the
  // default calendar app (Outlook / Windows Calendar). All-day event.
  handle('calendar:add', async (_e, p: { title?: string; date?: string; details?: string; target?: string }) => {
    const title = String(p?.title ?? '').trim().slice(0, 200)
    const details = String(p?.details ?? '').slice(0, 1000)
    if (!title) throw new Error('Empty task.')
    const given = String(p?.date ?? '')
    const hasDate = /^\d{4}-\d{2}-\d{2}$/.test(given)
    // No date: Google opens the event for today (change it there); .ics uses tomorrow.
    const date = hasDate ? given : new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
    const start = date.replace(/-/g, '')
    const next = new Date(`${date}T12:00:00Z`)
    next.setUTCDate(next.getUTCDate() + 1)
    const end = next.toISOString().slice(0, 10).replace(/-/g, '')
    if (p?.target === 'google') {
      const url =
        'https://calendar.google.com/calendar/render?action=TEMPLATE' +
        `&text=${encodeURIComponent(title)}${hasDate ? `&dates=${start}/${end}` : ''}&details=${encodeURIComponent(details)}`
      await shell.openExternal(url)
      return { ok: true }
    }
    const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Minutama//Tasks//EN',
      'BEGIN:VEVENT',
      `UID:${Date.now()}-${Math.random().toString(36).slice(2)}@minutama.com`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${esc(title)}`,
      `DESCRIPTION:${esc(details)}`,
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n')
    const { writeFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const file = join(app.getPath('temp'), `minutama-task-${start}-${Date.now()}.ics`)
    await writeFile(file, ics, 'utf8')
    const err = await shell.openPath(file)
    if (err) throw new Error('No calendar app found. Try Google Calendar instead.')
    return { ok: true }
  })
  // Calendar (iCal link): the event a call belongs to, and a link check for Settings.
  handle('calendar:current', async () => {
    const { currentEvent } = await import('./CalendarWatcher')
    const ev = currentEvent()
    return ev ? { title: ev.title, start: ev.start, description: ev.description, location: ev.location } : null
  })
  handle('calendar:test', async (_e, url: string) => {
    const link = String(url ?? '').trim()
    if (link && !/^(https|webcal):\/\//i.test(link)) throw new Error('Paste the iCal link (it starts with https://).')
    setSetting('calendarIcsUrl', link)
    if (!link) return { ok: true, count: 0, next: null, error: null }
    const { testCalendar } = await import('./CalendarWatcher')
    return testCalendar(link)
  })
  // Share one task to a messenger or mail: opens the app's own share screen
  // (you pick the chat there). Only these fixed targets — never a URL from the renderer.
  handle('share:task', async (_e, p: { target?: string; text?: string; subject?: string }) => {
    const text = String(p?.text ?? '').trim().slice(0, 1500)
    if (!text) throw new Error('Empty task.')
    const enc = encodeURIComponent
    const target = String(p?.target ?? '')
    const url =
      target === 'telegram'
        ? `https://t.me/share/url?url=${enc(text)}`
        : target === 'whatsapp'
          ? `https://wa.me/?text=${enc(text)}`
          : target === 'email'
            ? `mailto:?subject=${enc(String(p?.subject ?? 'Task').slice(0, 150))}&body=${enc(text)}`
            : null
    if (!url) throw new Error('Unknown share target.')
    await shell.openExternal(url)
    return { ok: true }
  })
  // Open the user's mail app with the notes as the message body.
  handle('export:emailDraft', async (_e, meetingId: string) => {
    const meeting = getDatabase().getMeeting(String(meetingId))
    if (!meeting) throw new Error('Meeting not found')
    const body = buildMeetingMarkdown(meeting).slice(0, 1800)
    const url = `mailto:?subject=${encodeURIComponent(String(meeting.title || 'Meeting notes'))}&body=${encodeURIComponent(body)}`
    await shell.openExternal(url)
    return { ok: true }
  })
  handle('export:periodReportPdf', async (_e, payload: { reportId: string; outputPath?: string }) => {
    requireProOrByok()
    const target = payload.outputPath ?? (await choosePdfPath('Minutama_Period_Report.pdf'))
    if (!target) return { canceled: true }
    const path = await exportPeriodReportPdf(payload.reportId, target)
    return { path }
  })
  handle('export:notion', async (_e, meetingId: string) => {
    requireProOrByok()
    const pageId = await exportToNotion(
      meetingId,
      getSetting('notionToken'),
      getSetting('notionParentPageId')
    )
    return { pageId }
  })
  handle('export:slack', async (_e, payload: { meetingId: string; webhookUrl: string }) => {
    requireProOrByok()
    const webhookUrl = payload.webhookUrl || getSetting('slackWebhookUrl')
    await exportToSlack(payload.meetingId, webhookUrl)
    return { ok: true }
  })
  handle('export:email', async (_e, payload: { meetingId: string; recipients: string[] }) => {
    requireProOrByok()
    await exportByEmail(payload.meetingId, payload.recipients)
    return { ok: true }
  })
  handle('export:clipboard', async (_e, meetingId: string) => {
    // Clipboard export is available on the free tier.
    const meeting = getDatabase().getMeeting(meetingId)
    if (!meeting) throw new Error(`Meeting ${meetingId} not found`)
    clipboard.writeText(buildMeetingMarkdown(meeting))
    return { ok: true }
  })

  // --- Settings (electron-store) -------------------------------------------
  handle('settings:get', async (_e, key: keyof AppSettings) => getSetting(key))
  handle('settings:set', async (_e, payload: { key: keyof AppSettings; value: never }) => {
    setSetting(payload.key, payload.value)
    return { ok: true }
  })
  handle('settings:getAll', async () => getAllSettings())

  // --- Google OAuth ----------------------------------------------------------
  // Installed app: open the sign-in in the user's own browser. Google blocks or
  // stalls sign-in (2-step verification, passkeys) inside embedded windows, and
  // the user is usually already signed in to Google there. Supabase redirects to
  // minutama://auth/callback, Windows hands that URL to this app
  // (second-instance → handleDeepLink → auth:deeplink).
  // Dev (protocol not registered): fall back to an in-app window that
  // intercepts the redirect.
  handle('auth:openOAuthWindow', async (_e, oauthUrl: string) => {
    // Only ever open our Supabase auth endpoint (the renderer passes the URL).
    const target = new URL(String(oauthUrl))
    if (
      target.protocol !== 'https:' ||
      !target.hostname.endsWith('.supabase.co') ||
      !target.pathname.startsWith('/auth/v1/')
    ) {
      throw new Error('Unexpected sign-in URL')
    }
    if (app.isPackaged) {
      await shell.openExternal(target.toString())
      return { external: true }
    }

    const parent = getMainWindow() ?? undefined
    const win = new BrowserWindow({
      width: 520,
      height: 680,
      parent,
      modal: true,
      title: 'Sign in with Google',
      autoHideMenuBar: true,
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    })

    win.loadURL(target.toString())

    const intercept = (ev: Electron.Event, url: string) => {
      if (url.startsWith('minutama://') || url.startsWith('briefos://')) {
        ev.preventDefault()
        sendToRenderer('auth:deeplink', url)
        setImmediate(() => { if (!win.isDestroyed()) win.close() })
      }
    }

    win.webContents.on('will-redirect', intercept)
    win.webContents.on('will-navigate', intercept)

    return { ok: true }
  })

  // --- Tasks (action items across meetings) ---------------------------------
  handle('tasks:getAll', async () => getDatabase().getAllTasks())
  handle('tasks:setDone', async (_e, p: { meetingId: string; task: string; done: boolean }) => {
    getDatabase().setTaskDone(String(p.meetingId), String(p.task), Boolean(p.done))
    return { ok: true }
  })

  // --- Import: open a transcript file (.vtt / .srt / .txt) ------------------
  handle('import:pickTranscript', async () => {
    const win = getMainWindow()
    const opts = {
      properties: ['openFile'] as 'openFile'[],
      filters: [{ name: 'Transcripts', extensions: ['vtt', 'srt', 'txt', 'md'] }]
    }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (res.canceled || !res.filePaths[0]) return null
    const file = res.filePaths[0]
    const { readFile, stat } = await import('node:fs/promises')
    if ((await stat(file)).size > 5 * 1024 * 1024) throw new Error('This file is too large (max 5 MB).')
    const { basename } = await import('node:path')
    return { name: basename(file), text: await readFile(file, 'utf8') }
  })

  // --- Capsule (floating call prompt / recording widget) --------------------
  handle('capsule:get', async () => getCapsule())
  handle('capsule:action', async (_e, action: 'start' | 'dismiss' | 'open' | 'clearHint' | 'toggle' | 'size' | 'clearRun' | 'cancelRun') => {
    if (action === 'toggle') toggleCapsuleExpanded()
    else if (action === 'size') toggleCapsuleLarge()
    else if (action === 'clearRun') setCapsuleAgentRun(null)
    else if (action === 'cancelRun') {
      const run = getCapsule().agentRun
      if (run?.runId) cancelAgentRun(run.runId)
    }
    else if (action === 'start') sendRecordingCommand('start')
    else if (action === 'dismiss') capsuleDismiss()
    else if (action === 'clearHint') clearHint()
    else if (action === 'open') {
      const win = getMainWindow()
      win?.show()
      win?.focus()
    }
    return { ok: true }
  })
  // Task typed into the capsule: save it to the notes, or open the
  // "send to agent" confirmation in the main window.
  handle('capsule:task', async (_e, payload: { text: string; send: boolean }) => {
    const text = String(payload?.text ?? '').trim().slice(0, 2000)
    if (!text) throw new Error('Empty task')
    if (payload.send) {
      // Runs right from the capsule: the main renderer adds the meeting
      // context and calls agent:run (fromCapsule) — progress shows in the capsule.
      const agent = getSetting('agentProvider') === 'codex' ? 'Codex' : 'Claude Code'
      setCapsuleAgentRun({ runId: null, task: text, agent, status: 'starting', tail: '' })
      sendToRenderer('agent:runFromCapsule', { text })
    } else {
      sendToRenderer('agent:saveTask', { text })
    }
    return { ok: true }
  })
  // Quick actions from the capsule that need the meeting (main renderer).
  handle('capsule:quick', async (_e, kind: 'lastQuestion' | 'answered' | 'consent') => {
    if (kind === 'lastQuestion' || kind === 'answered') {
      sendToRenderer('capsule:quick', { kind, id: getCapsule().hint?.id ?? null })
      if (kind === 'answered') clearHint()
    } else if (kind === 'consent') {
      clipboard.writeText(CONSENT_TEXT)
      capsuleNotice('Copied — paste it into the call chat')
    }
    return { ok: true }
  })
  handle('capsule:notice', async (_e, text: string) => {
    capsuleNotice(String(text).slice(0, 120))
    return { ok: true }
  })
  handle('capsule:live', async (_e, payload: { lines?: unknown; status?: string }) => {
    const lines = (Array.isArray(payload?.lines) ? payload.lines : []).slice(-10).map((l, i) => {
      const x = l as { id?: unknown; speaker?: unknown; text?: unknown; translation?: unknown; final?: unknown; parts?: unknown }
      const parts = Array.isArray(x.parts)
        ? x.parts.slice(-12).map((p) => {
            const y = p as { text?: unknown; translation?: unknown; live?: unknown }
            return {
              text: String(y.text ?? '').slice(0, 600),
              translation: typeof y.translation === 'string' ? y.translation.slice(0, 800) : null,
              live: Boolean(y.live)
            }
          })
        : undefined
      return {
        id: String(x.id ?? i).slice(0, 80),
        speaker: x.speaker === 'me' ? ('me' as const) : ('them' as const),
        text: String(x.text ?? '').slice(-400),
        translation: typeof x.translation === 'string' ? x.translation.slice(-500) : null,
        final: Boolean(x.final),
        parts
      }
    })
    const st = ['off', 'connecting', 'live', 'failed'].includes(String(payload?.status)) ? String(payload?.status) : 'off'
    setCapsuleLive({ lines, status: st as 'off' | 'connecting' | 'live' | 'failed' })
    return { ok: true }
  })
  // "Ask AI" about a caption line: the overlay picks the line (or types a
  // follow-up); the main renderer, which holds the session, asks the server
  // and streams the answer back with capsule:askState.
  handle('capsule:ask', async (_e, payload: { line?: string; followUp?: string; close?: boolean }) => {
    if (payload?.close) {
      setCapsuleAsk(null)
      sendToRenderer('capsule:ask', { close: true })
      return { ok: true }
    }
    const line = typeof payload?.line === 'string' ? payload.line.trim().slice(0, 800) : ''
    const followUp = typeof payload?.followUp === 'string' ? payload.followUp.trim().slice(0, 800) : ''
    if (!line && !followUp) throw new Error('Nothing to ask')
    sendToRenderer('capsule:ask', line ? { line } : { followUp })
    return { ok: true }
  })
  handle('capsule:askState', async (_e, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      setCapsuleAsk(null)
      return { ok: true }
    }
    const x = payload as { line?: unknown; messages?: unknown; status?: unknown; error?: unknown }
    const messages = (Array.isArray(x.messages) ? x.messages : []).slice(-12).map((m) => {
      const y = m as { role?: unknown; text?: unknown }
      return { role: y.role === 'user' ? ('user' as const) : ('assistant' as const), text: String(y.text ?? '').slice(0, 3000) }
    })
    const status = ['thinking', 'answering', 'done', 'failed'].includes(String(x.status)) ? String(x.status) : 'done'
    setCapsuleAsk({
      line: String(x.line ?? '').slice(0, 800),
      messages,
      status: status as 'thinking' | 'answering' | 'done' | 'failed',
      error: typeof x.error === 'string' ? x.error.slice(0, 200) : null
    })
    return { ok: true }
  })
  handle('capsule:fit', async (_e, height: number) => {
    if (typeof height === 'number' && Number.isFinite(height)) fitCapsule(height)
    return { ok: true }
  })
  handle('capsule:hint', async (_e, hint: ReplyHint) => {
    if (!hint || typeof hint.question !== 'string') throw new Error('Bad hint')
    const str = (v: unknown, n: number) => (typeof v === 'string' && v ? v.slice(0, n) : null)
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
    showHint({
      id: String(hint.id),
      question: hint.question.slice(0, 300),
      answer: String(hint.answer ?? '').slice(0, 600),
      translation: str(hint.translation, 400),
      term: str(hint.term, 60),
      termExplanation: str(hint.termExplanation, 240),
      latencyMs: num(hint.latencyMs),
      total: num(hint.total) ?? undefined,
      open: num(hint.open) ?? undefined
    })
    return { ok: true }
  })

  // --- Coding agents (Claude Code / Codex on this computer) -----------------
  handle('agent:detect', async () => ({ agents: await detectAgents(), workdir: agentWorkdir() }))
  handle('agent:run', async (_e, payload: { prompt: string; agent?: AgentId; fromCapsule?: boolean }) => {
    const prompt = String(payload?.prompt ?? '').trim()
    if (!prompt) throw new Error('Empty task')
    if (prompt.length > 60_000) throw new Error('Task is too long')
    const agent = payload.agent === 'codex' ? 'codex' : payload.agent === 'claude' ? 'claude' : undefined
    const toCapsule = Boolean(payload.fromCapsule)
    let tail = ''
    let lastPush = 0
    try {
      const runId = await startAgentRun(
        prompt,
        {
          onOutput: (id, chunk) => {
            sendToRenderer('agent:output', { runId: id, chunk })
            if (!toCapsule) return
            tail = (tail + chunk).replace(/\s+/g, ' ').slice(-220)
            if (Date.now() - lastPush > 700) {
              lastPush = Date.now()
              setCapsuleAgentRun({ runId: id, status: 'running', tail: tail.trim() })
            }
          },
          onDone: (id, result) => {
            sendToRenderer('agent:done', { runId: id, ...result })
            if (toCapsule) {
              const out = result.output.replace(/\s+/g, ' ').trim().slice(-220)
              setCapsuleAgentRun({ runId: id, status: result.ok ? 'done' : 'failed', tail: out })
            }
          }
        },
        agent
      )
      if (toCapsule) setCapsuleAgentRun({ runId, status: 'running' })
      return { runId }
    } catch (err) {
      if (toCapsule) setCapsuleAgentRun({ status: 'failed', tail: (err as Error).message })
      throw err
    }
  })
  handle('agent:cancel', async (_e, runId: string) => cancelAgentRun(String(runId)))
  handle('agent:chooseWorkdir', async () => {
    const win = getMainWindow()
    const opts = { properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[] }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (res.canceled || !res.filePaths[0]) return null
    setSetting('agentWorkdir', res.filePaths[0])
    return res.filePaths[0]
  })

  // --- Updater -------------------------------------------------------------
  handle('updater:check', async () => {
    await autoUpdater.checkForUpdates()
    return { ok: true }
  })
  handle('updater:install', async () => {
    // Silent install + relaunch: one click, no installer wizard.
    autoUpdater.quitAndInstall(true, true)
    return { ok: true }
  })



  console.log('[ipc] handlers registered')
}

export type { Result, Ok, Err }
