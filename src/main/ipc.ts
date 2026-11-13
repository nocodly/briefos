import { ipcMain, clipboard, dialog, BrowserWindow, type IpcMainInvokeEvent } from 'electron'
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
import { exportMeetingPdf } from '@output/PDFRenderer'
import { exportPeriodReportPdf } from '@output/PeriodReportPDF'
import { exportToNotion } from '@output/NotionExporter'
import { exportToSlack } from '@output/SlackNotifier'
import { exportByEmail } from '@output/EmailSender'
import { buildMeetingMarkdown } from '@output/markdown'

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
        actionItems: { text?: string; owner?: string; due?: string }[]
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
  handle('ai:generatePeriodReport', async (_e, payload: { from: string; to: string; label: string }) => {
    // Period Reports require own API key (byok or pro).
    if (!isProOrByok()) throw new Error('Period Reports require your own API key. Go to Settings → Plan → Free + Own Keys.')
    const openaiKey = getSetting('openaiApiKey') || process.env['OPENAI_API_KEY'] || ''
    const anthropicKey = getSetting('anthropicApiKey')
    const useAnthropic = getSetting('aiProvider') === 'anthropic' && !!anthropicKey
    if (!useAnthropic && !openaiKey) throw new Error('No AI key configured. Contact hello@minutama.com')
    const planModel = 'gpt-4o'
    const engine = new PeriodReportEngine({
      anthropicApiKey: useAnthropic ? anthropicKey : undefined,
      openaiApiKey: openaiKey,
      model: getSetting('aiModel') || (useAnthropic ? undefined : planModel),
    })
    return engine.generate({
      from: payload.from,
      to: payload.to,
      label: payload.label,
      onProgress: (step) => progress.periodReport(50, step)
    })
  })

  // --- Export (output/*) ---------------------------------------------------
  handle('export:pdf', async (_e, payload: { meetingId: string; outputPath?: string }) => {
    requireProOrByok()
    const meeting = getDatabase().getMeeting(payload.meetingId)
    const safe = String(meeting?.title || 'meeting').replace(/[^\w\-]+/g, '_').slice(0, 60)
    const target = payload.outputPath ?? (await choosePdfPath(`${safe}.pdf`))
    if (!target) return { canceled: true }
    const path = await exportMeetingPdf(payload.meetingId, target)
    return { path }
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

  // --- Google OAuth (in-app BrowserWindow) ---------------------------------
  // Opens the OAuth URL in a child window, intercepts the minutama:// redirect,
  // and forwards the callback URL to the renderer via auth:deeplink — no custom
  // OS protocol registration needed (works in both dev and packaged builds).
  handle('auth:openOAuthWindow', async (_e, oauthUrl: string) => {
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

    win.loadURL(oauthUrl)

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

  // --- Updater -------------------------------------------------------------
  handle('updater:check', async () => {
    await autoUpdater.checkForUpdates()
    return { ok: true }
  })
  handle('updater:install', async () => {
    autoUpdater.quitAndInstall()
    return { ok: true }
  })



  console.log('[ipc] handlers registered')
}

export type { Result, Ok, Err }
