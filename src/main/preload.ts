import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

// =============================================================================
// Preload — the ONLY bridge between renderer (React) and main (Node).
// contextIsolation stays TRUE; the renderer never touches ipcRenderer directly.
// Everything the UI can call is funneled through window.electron below.
//
// Channel whitelists restrict what an XSS-compromised renderer could invoke.
// Any channel not listed here is silently blocked at the bridge level.
// =============================================================================

// Two-way channels (ipcMain.handle / ipcRenderer.invoke).
const INVOKE_CHANNELS = new Set([
  'recording:start', 'recording:stop', 'recording:pause', 'recording:resume', 'recording:status',
  'meetings:getAll', 'meetings:getOne', 'meetings:delete', 'meetings:search',
  'meetings:updateTitle', 'meetings:renameSpeakers',
  'ai:generateSummary', 'ai:regenerateSummary', 'ai:generatePeriodReport',
  'export:pdf', 'export:periodReportPdf', 'export:notion', 'export:slack',
  'export:email', 'export:clipboard',
  'settings:get', 'settings:set', 'settings:getAll',
  'auth:openOAuthWindow',
  'audio:listDevices', 'audio:testLevels',
  'updater:check', 'updater:install'
])

// Push channels (main → renderer via webContents.send).
const PUSH_CHANNELS = new Set([
  'recording:tick',
  'progress:transcription', 'progress:summary', 'progress:periodReport',
  'progress:done', 'progress:error',
  'updater:status', 'navigate',
  'hotkey:toggleRecording', 'auth:deeplink'
])

type Listener = (data: any) => void

const api = {
  /** Two-way request → returns the handler's Result envelope as a promise. */
  invoke: (channel: string, ...args: unknown[]): Promise<unknown> => {
    if (!INVOKE_CHANNELS.has(channel)) {
      return Promise.reject(new Error(`IPC channel not allowed: ${channel}`))
    }
    return ipcRenderer.invoke(channel, ...args)
  },

  /**
   * Subscribe to a push event from main (progress:*, recording:tick, etc.).
   * Returns the wrapped subscriber so the caller can pass it back to off().
   */
  on: (channel: string, callback: Listener) => {
    if (!PUSH_CHANNELS.has(channel)) {
      console.error(`[preload] push channel not allowed: ${channel}`)
      return (_event: IpcRendererEvent, _data: any) => {}
    }
    const sub = (_event: IpcRendererEvent, data: any) => callback(data)
    ipcRenderer.on(channel, sub)
    return sub
  },

  /** Remove a previously-registered listener (call in useEffect cleanup). */
  off: (channel: string, sub: (event: IpcRendererEvent, data: any) => void) => {
    ipcRenderer.removeListener(channel, sub)
  }
}

contextBridge.exposeInMainWorld('electron', api)

// Exported so the renderer can `import type { ElectronApi }` for window typing.
export type ElectronApi = typeof api
