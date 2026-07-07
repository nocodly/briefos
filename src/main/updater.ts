import pkg from 'electron-updater'
import { sendToRenderer } from './ipc'

// electron-updater ships as CommonJS; destructure the default export under ESM.
const { autoUpdater } = pkg

// Auto-update from GitHub Releases (configured in electron-builder.yml > publish).
// Only invoked from index.ts when app.isPackaged — no-op in development.
export function initAutoUpdater(): void {
  console.log('[updater] initializing auto-updater')

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    console.log('[updater] checking for update')
  })

  autoUpdater.on('update-available', (info) => {
    console.log('[updater] update available:', info.version)
    sendToRenderer('updater:status', { state: 'available', version: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    console.log('[updater] no update available')
    sendToRenderer('updater:status', { state: 'none' })
  })

  autoUpdater.on('download-progress', (p) => {
    sendToRenderer('updater:status', {
      state: 'downloading',
      percent: Math.round(p.percent)
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[updater] update downloaded:', info.version)
    sendToRenderer('updater:status', { state: 'downloaded', version: info.version })
  })

  autoUpdater.on('error', (err) => {
    console.error('[updater] error', err)
    sendToRenderer('updater:status', { state: 'error', error: String(err) })
  })

  // Check on startup, then every 4 hours.
  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    console.error('[updater] checkForUpdatesAndNotify failed', err)
  })
  setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.error('[updater] periodic check failed', err)
    })
  }, 4 * 60 * 60 * 1000)
}

/** Manually trigger install + restart (e.g. from a renderer "Restart now" button). */
export function quitAndInstall(): void {
  console.log('[updater] quit and install')
  autoUpdater.quitAndInstall()
}
