import { app, BrowserWindow, globalShortcut, shell, screen } from 'electron'
import { join } from 'node:path'
import { config as loadEnv } from 'dotenv'
import { createTray, updateTrayState } from './tray'
import { registerIpcHandlers } from './ipc'
import { initAutoUpdater } from './updater'
import { enforceRetention } from '@storage/FileManager'
import { getSetting, setSetting } from './store'
import { listAudioDevices } from '@capture/AudioCapture'

// Load .env in development (production reads keys from electron-store).
if (!app.isPackaged) {
  loadEnv()
}

// electron-vite runtime paths:
//   main     → out/main/index.js   (__dirname = out/main)
//   preload  → out/preload/preload.js
//   renderer → out/renderer/index.html  (+ overlay.html)
const PRELOAD = join(__dirname, '../preload/preload.cjs')
const RENDERER_DEV_URL = process.env['ELECTRON_RENDERER_URL']

// Window singletons — siblings (tray, ipc) reach these via the getters below.
let mainWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function getOverlayWindow(): BrowserWindow | null {
  return overlayWindow
}

function createMainWindow(): BrowserWindow {
  console.log('[main] creating main window')

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#F7F9FC',
    titleBarStyle: 'hiddenInset',
    show: false, // shown on ready-to-show to avoid white flash
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true, // MUST be true (security requirement)
      nodeIntegration: false, // MUST be false
      sandbox: false
    }
  })

  win.once('ready-to-show', () => {
    console.log('[main] main window ready-to-show')
    win.show()
  })

  // Allow the renderer to connect to external APIs (Supabase, OpenAI, Anthropic).
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.openai.com https://api.anthropic.com https://api.stripe.com; img-src 'self' data: https:"
        ]
      }
    })
  })

  // Open external links in the OS browser, never in-app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Tray app: closing the window hides it instead of quitting.
  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      win.hide()
    }
  })

  if (RENDERER_DEV_URL) {
    win.loadURL(RENDERER_DEV_URL)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

// Reveal helper: showInactive (don't steal focus from the meeting) + pin above
// fullscreen apps via the 'screen-saver' always-on-top level.
function revealOverlay(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  win.showInactive()
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
}

export function createOverlayWindow(): BrowserWindow {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    revealOverlay(overlayWindow)
    return overlayWindow
  }

  console.log('[main] creating overlay window')

  // Anchor to the top-right corner of the primary display's work area.
  const { workArea } = screen.getPrimaryDisplay()
  const width = 240
  const height = 110
  const margin = 20

  const win = new BrowserWindow({
    width,
    height,
    x: workArea.x + workArea.width - width - margin,
    y: workArea.y + margin,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.setIgnoreMouseEvents(false)

  // Reveal on ready-to-show, with did-finish-load as a fallback because
  // transparent frameless windows don't always emit ready-to-show on Windows.
  win.once('ready-to-show', () => revealOverlay(win))
  win.webContents.once('did-finish-load', () => revealOverlay(win))

  if (RENDERER_DEV_URL) {
    win.loadURL(`${RENDERER_DEV_URL}/overlay.html`)
  } else {
    win.loadFile(join(__dirname, '../renderer/overlay.html'))
  }

  win.on('closed', () => {
    overlayWindow = null
  })

  overlayWindow = win
  return win
}

export function closeOverlayWindow(): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    console.log('[main] closing overlay window')
    overlayWindow.close()
    overlayWindow = null
  }
}

// Toggle is owned by the renderer (it knows current recording UI state);
// main just forwards the hotkey + reflects state in the tray.
function registerGlobalShortcuts(): void {
  const toggle = globalShortcut.register('CommandOrControl+Shift+B', () => {
    console.log('[main] hotkey: toggle recording')
    mainWindow?.webContents.send('hotkey:toggleRecording')
  })
  const showDash = globalShortcut.register('CommandOrControl+Shift+D', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })

  if (!toggle || !showDash) {
    console.warn('[main] one or more global shortcuts failed to register')
  }
}

// Detect a VB-Cable / loopback device and auto-select it for system audio.
async function autoConfigureAudio(): Promise<void> {
  try {
    const devices = await listAudioDevices()
    const cable = devices.find((d) => /cable/i.test(d))
    if (!cable) {
      console.log('[main] no VB-Cable device detected')
      return
    }
    const current = getSetting('systemAudioDevice')
    // Switch only if the current choice isn't already a detected cable device.
    if (!devices.includes(current) || !/cable/i.test(current)) {
      setSetting('systemAudioDevice', cable)
      console.log('[main] auto-selected VB-Cable device:', cable)
    }
  } catch (err) {
    console.error('[main] audio auto-config failed', err)
  }
}

// Handle OAuth deep links: briefos://auth/callback?code=...
// Windows sends the URL as a second-instance argument.
function handleDeepLink(url: string): void {
  console.log('[main] deep link:', url)
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send('auth:deeplink', url)
  }
}

// Single-instance lock — second launch focuses the existing window.
let isQuitting = false
const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  app.quit()
} else {
  // On Windows the deep-link URL arrives as a command-line argument of the
  // second instance (the first instance receives it via second-instance event).
  app.on('second-instance', (_event, argv) => {
    const url = argv.find((arg) => arg.startsWith('briefos://'))
    if (url) {
      handleDeepLink(url)
    } else if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })

  // Register briefos:// as a custom protocol so the OS routes OAuth callbacks here.
  app.setAsDefaultProtocolClient('briefos')

  // On macOS the deep link arrives via open-url (not second-instance).
  app.on('open-url', (_event, url) => handleDeepLink(url))

  app.whenReady().then(() => {
    console.log('[main] app ready — APP_ENV:', process.env.APP_ENV ?? 'production')

    // Dev-mode: if launched with a briefos:// URL directly (e.g. from a test),
    // handle it after the window is ready.
    const devDeepLink = process.argv.find((arg) => arg.startsWith('briefos://'))
    if (devDeepLink) setTimeout(() => handleDeepLink(devDeepLink), 1500)

    mainWindow = createMainWindow()

    // Tray owns the Start/Stop menu; pass a callback so it can reflect state.
    createTray({
      showDashboard: () => {
        mainWindow?.show()
        mainWindow?.focus()
      },
      toggleRecording: () => mainWindow?.webContents.send('hotkey:toggleRecording'),
      openSettings: () => {
        mainWindow?.show()
        mainWindow?.webContents.send('navigate', '/settings')
      },
      quit: () => {
        isQuitting = true
        app.quit()
      }
    })

    // All IPC channels live in ipc.ts; it pulls windows via the getters above.
    registerIpcHandlers()

    // Enforce the audio retention window (deletes old meetings + their files).
    try {
      enforceRetention(getSetting('retentionDays'))
    } catch (err) {
      console.error('[main] retention sweep failed', err)
    }

    // Auto-detect VB-Cable (or any loopback "CABLE" device) and select it for
    // system audio so the user doesn't have to configure it manually.
    void autoConfigureAudio()

    registerGlobalShortcuts()

    // Auto-update from GitHub Releases (no-op in dev).
    if (app.isPackaged) {
      initAutoUpdater()
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow()
      } else {
        mainWindow?.show()
      }
    })
  })

  // Tray app: keep running in the background when all windows are closed.
  app.on('window-all-closed', () => {
    // Intentionally do NOT quit on Windows — BriefOS lives in the tray.
  })

  app.on('before-quit', () => {
    isQuitting = true
  })

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
  })
}

// Re-export so recording flow can flip the tray icon idle/recording.
export { updateTrayState }
