import { app, Tray, Menu, nativeImage } from 'electron'
import { join } from 'node:path'

// Callbacks wired in index.ts so the tray menu can drive app actions
// without the tray module importing window singletons directly.
export interface TrayCallbacks {
  showDashboard: () => void
  toggleRecording: () => void
  openSettings: () => void
  quit: () => void
}

let tray: Tray | null = null
let callbacks: TrayCallbacks | null = null
let recording = false

// Idle = green dot, Recording = red dot. In dev __dirname is out/main, so
// ../../assets resolves to the project assets folder; packaged builds read
// from resources/assets (shipped via electron-builder extraResources).
function iconPath(name: string): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'assets', name)
    : join(__dirname, '../../assets', name)
}

function trayImage(): Electron.NativeImage {
  const file = recording ? 'tray-icon-recording.png' : 'tray-icon.png'
  return nativeImage.createFromPath(iconPath(file)).resize({ width: 16, height: 16 })
}

function buildMenu(): Electron.Menu {
  return Menu.buildFromTemplate([
    { label: 'BriefOS', enabled: false },
    { type: 'separator' },
    recording
      ? {
          label: 'Stop Recording',
          accelerator: 'CmdOrCtrl+Shift+B',
          click: () => callbacks?.toggleRecording()
        }
      : {
          label: 'Start Recording',
          accelerator: 'CmdOrCtrl+Shift+B',
          click: () => callbacks?.toggleRecording()
        },
    { type: 'separator' },
    { label: 'Open Dashboard', click: () => callbacks?.showDashboard() },
    { label: 'Settings', click: () => callbacks?.openSettings() },
    { type: 'separator' },
    { label: 'Quit BriefOS', click: () => callbacks?.quit() }
  ])
}

export function createTray(cb: TrayCallbacks): Tray {
  console.log('[tray] creating tray')
  callbacks = cb

  tray = new Tray(trayImage())
  tray.setToolTip('BriefOS — ready')
  tray.setContextMenu(buildMenu())

  // Double-click opens the dashboard (Windows convention).
  tray.on('double-click', () => callbacks?.showDashboard())

  return tray
}

// Called by the recording flow to flip the tray icon + menu + tooltip.
export function updateTrayState(isRecording: boolean): void {
  if (!tray) return
  console.log('[tray] updating state — recording:', isRecording)
  recording = isRecording
  tray.setImage(trayImage())
  tray.setToolTip(isRecording ? 'BriefOS — recording…' : 'BriefOS — ready')
  tray.setContextMenu(buildMenu())
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
