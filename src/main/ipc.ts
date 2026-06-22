import { ipcMain, clipboard, dialog, BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import pkg from 'electron-updater'
const { autoUpdater } = pkg
import { getMainWindow, getOverlayWindow } from './index'
import { getDatabase } from '@storage/Database'
import { deleteMeetingFiles } from '@storage/FileManager'
import { getSetting, setSetting, getAllSettings, isProOrByok, type AppSettings } from './store'
import { listAudioDevices, testAudioLevels } from '@capture/AudioCapture'
import { getPipeline } from './RecordingPipeline'
import { PeriodReportEngine } from '@ai/PeriodReportEngine'
import { exportMeetingPdf } from '@output/PDFRenderer'
import { exportPeriodReportPdf } from '@output/PeriodReportPDF'
import { exportToNotion } from '@output/NotionExporter'
import { exportToSlack } from '@output/SlackNotifier'
import { exportByEmail } from '@output/EmailSender'
import { buildMeetingMarkdown } from '@output/markdown'
import { transcribeFile, transcribeUrl } from './VideoTranscriber'

// =============================================================================
// BriefOS IPC hub — the ONLY place channels are registered.
// Channel names are frozen (see electron-ipc skill); never invent new ones.
//
// Backend modules (Database, AudioCapture, WhisperClient, SummaryEngine,
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

// Exports (except clipboard) require BYOK or Pro — trial users add their own key first.
function requireProOrByok(): void {
  if (!isProOrByok()) throw new Error('Exports require your own API key. Go to Settings → Plan and switch to Free + Own Keys.')
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

  // --- Recording (RecordingPipeline) ---------------------------------------
  handle('recording:start', async () => getPipeline().start())
  handle('recording:stop', async () => getPipeline().stop())
  handle('recording:pause', async () => {
    getPipeline().pause()
    return { ok: true }
  })
  handle('recording:resume', async () => {
    getPipeline().resume()
    return { ok: true }
  })
  handle('recording:status', async () => getPipeline().status())

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
  handle('ai:generateSummary', async (_e, meetingId: string) =>
    getPipeline().generateSummary(meetingId)
  )
  handle('ai:regenerateSummary', async (_e, payload: { meetingId: string; promptType: string }) =>
    getPipeline().generateSummary(payload.meetingId, undefined, payload.promptType)
  )
  handle('ai:generatePeriodReport', async (_e, payload: { from: string; to: string; label: string }) => {
    // Period Reports require own API key (byok or pro).
    if (!isProOrByok()) throw new Error('Period Reports require your own API key. Go to Settings → Plan → Free + Own Keys.')
    const openaiKey = getSetting('openaiApiKey') || process.env['OPENAI_API_KEY'] || ''
    const anthropicKey = getSetting('anthropicApiKey')
    const useAnthropic = getSetting('aiProvider') === 'anthropic' && !!anthropicKey
    if (!useAnthropic && !openaiKey) throw new Error('No AI key configured. Contact support@nocodly.com')
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
    const target = payload.outputPath ?? (await choosePdfPath('BriefOS_Period_Report.pdf'))
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
  // Opens the OAuth URL in a child window, intercepts the briefos:// redirect,
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
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    })

    win.loadURL(oauthUrl)

    const intercept = (ev: Electron.Event, url: string) => {
      if (url.startsWith('briefos://')) {
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

  // --- Video Transcriber ---------------------------------------------------
  handle('transcribe:file', async (_e, filePath: string) => transcribeFile(filePath))
  handle('transcribe:url', async (_e, url: string) => transcribeUrl(url))

  // --- Audio devices -------------------------------------------------------
  handle('audio:listDevices', async () => listAudioDevices())
  handle('audio:testLevels', async () => {
    const s = getAllSettings()
    return testAudioLevels({
      systemDevice: s.systemAudioDevice,
      micDevice: s.microphoneDevice,
      micOnly: s.micOnly
    })
  })

  console.log('[ipc] handlers registered')
}

export type { Result, Ok, Err }
