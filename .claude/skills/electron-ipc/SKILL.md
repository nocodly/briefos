---
name: electron-ipc
description: Use this skill for ANY task involving Electron main process, renderer process, IPC communication, system tray, BrowserWindow, global hotkeys, or app lifecycle in BriefOS. Triggers when: creating or editing src/main/index.js, tray.js, ipc.js, updater.js — or when connecting renderer React components to Node.js backend functionality. Also triggers when the user asks "how do I call this from React", "how do I send data to the renderer", "tray menu not working", "hotkey not registering", "window won't open". Always use this skill before writing any Electron main process code — it contains BriefOS-specific IPC channel names, window configs, and patterns that must stay consistent.
---

# Electron IPC — BriefOS

## Architecture overview

BriefOS has two Electron processes that NEVER share memory directly:

```
Main Process (Node.js)          Renderer Process (React)
src/main/index.js               src/renderer/App.jsx
src/main/tray.js                src/renderer/Dashboard.jsx
src/main/ipc.js           ←→    src/renderer/MeetingView.jsx
src/main/updater.js             src/renderer/Overlay.jsx
                                src/renderer/PeriodReport.jsx
```

Communication happens ONLY via IPC. Never use `remote` module — it's deprecated.

---

## IPC channel registry — use EXACTLY these names

All channels defined in `src/main/ipc.js`. Never invent new channel names without adding them here first.

### Recording channels
```js
// Main listens:
ipcMain.handle('recording:start', async (event, options) => { ... })
ipcMain.handle('recording:stop', async (event) => { ... })
ipcMain.handle('recording:pause', async (event) => { ... })
ipcMain.handle('recording:resume', async (event) => { ... })
ipcMain.handle('recording:status', async (event) => { ... })

// Renderer sends:
const result = await ipcRenderer.invoke('recording:start', { title: 'Meeting' })
const status = await ipcRenderer.invoke('recording:status')
```

### Meeting channels
```js
// Main listens:
ipcMain.handle('meetings:getAll', async (event, filters) => { ... })
ipcMain.handle('meetings:getOne', async (event, id) => { ... })
ipcMain.handle('meetings:delete', async (event, id) => { ... })
ipcMain.handle('meetings:search', async (event, query) => { ... })
ipcMain.handle('meetings:updateTitle', async (event, { id, title }) => { ... })
```

### AI channels
```js
ipcMain.handle('ai:generateSummary', async (event, meetingId) => { ... })
ipcMain.handle('ai:regenerateSummary', async (event, { meetingId, promptType }) => { ... })
ipcMain.handle('ai:generatePeriodReport', async (event, { from, to, label }) => { ... })
```

### Export channels
```js
ipcMain.handle('export:pdf', async (event, { meetingId, outputPath }) => { ... })
ipcMain.handle('export:periodReportPdf', async (event, { reportId, outputPath }) => { ... })
ipcMain.handle('export:notion', async (event, meetingId) => { ... })
ipcMain.handle('export:slack', async (event, { meetingId, webhookUrl }) => { ... })
ipcMain.handle('export:email', async (event, { meetingId, recipients }) => { ... })
ipcMain.handle('export:clipboard', async (event, meetingId) => { ... })
```

### Settings channels
```js
ipcMain.handle('settings:get', async (event, key) => { ... })
ipcMain.handle('settings:set', async (event, { key, value }) => { ... })
ipcMain.handle('settings:getAll', async (event) => { ... })
```

### Progress push events (main → renderer, no invoke)
```js
// Main sends progress updates during long operations:
mainWindow.webContents.send('progress:transcription', { pct: 60, step: 'Transcribing chunk 3/6' })
mainWindow.webContents.send('progress:summary', { pct: 85, step: 'Generating summary' })
mainWindow.webContents.send('progress:done', { meetingId: 'uuid' })
mainWindow.webContents.send('recording:tick', { durationMs: 24000 })

// Renderer listens:
useEffect(() => {
  window.electron.on('progress:transcription', (data) => setProgress(data))
  return () => window.electron.off('progress:transcription')
}, [])
```

---

## BrowserWindow config — use exactly this

```js
// src/main/index.js
const mainWindow = new BrowserWindow({
  width: 1200,
  height: 800,
  minWidth: 900,
  minHeight: 600,
  backgroundColor: '#F7F9FC',
  titleBarStyle: 'hiddenInset',
  show: false, // show after ready-to-show
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,   // MUST be true
    nodeIntegration: false,   // MUST be false
    sandbox: false,
  }
})

mainWindow.once('ready-to-show', () => mainWindow.show())
```

## Overlay window config

```js
const overlayWindow = new BrowserWindow({
  width: 240,
  height: 110,
  frame: false,
  transparent: true,
  alwaysOnTop: true,
  skipTaskbar: true,
  resizable: false,
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false,
  }
})
overlayWindow.setIgnoreMouseEvents(false)
```

---

## Preload script — the ONLY bridge

```js
// src/main/preload.js
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electron', {
  // invoke = two-way, returns promise
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  // on = listen for push events from main
  on: (channel, callback) => {
    const sub = (_, data) => callback(data)
    ipcRenderer.on(channel, sub)
    return sub
  },
  // off = remove listener
  off: (channel, sub) => ipcRenderer.removeListener(channel, sub),
})
```

## React usage pattern

```jsx
// In any React component:
const meetings = await window.electron.invoke('meetings:getAll', { limit: 20 })
await window.electron.invoke('recording:start', {})

// Listen for push:
useEffect(() => {
  const sub = window.electron.on('recording:tick', ({ durationMs }) => {
    setDuration(durationMs)
  })
  return () => window.electron.off('recording:tick', sub)
}, [])
```

---

## Tray setup

```js
// src/main/tray.js
const { Tray, Menu, nativeImage } = require('electron')

function createTray(mainWindow) {
  const icon = nativeImage.createFromPath(
    app.isPackaged
      ? path.join(process.resourcesPath, 'tray-icon.png')
      : path.join(__dirname, '../../assets/tray-icon.png')
  )
  const tray = new Tray(icon.resize({ width: 16, height: 16 }))

  const buildMenu = (isRecording) => Menu.buildFromTemplate([
    { label: 'BriefOS', enabled: false },
    { type: 'separator' },
    isRecording
      ? { label: 'Stop Recording', accelerator: 'CmdOrCtrl+Shift+B', click: () => stopRecording() }
      : { label: 'Start Recording', accelerator: 'CmdOrCtrl+Shift+B', click: () => startRecording() },
    { label: 'Pause', click: () => pauseRecording() },
    { type: 'separator' },
    { label: 'Open Dashboard', click: () => mainWindow.show() },
    { label: 'Settings', click: () => openSettings() },
    { type: 'separator' },
    { label: 'Quit BriefOS', click: () => app.quit() },
  ])

  tray.setContextMenu(buildMenu(false))
  tray.setToolTip('BriefOS — ready')
  tray.on('double-click', () => mainWindow.show())

  return { tray, buildMenu }
}
```

## Global hotkeys

```js
// src/main/index.js
const { globalShortcut } = require('electron')

app.whenReady().then(() => {
  globalShortcut.register('CmdOrCtrl+Shift+B', () => {
    // toggle recording
    mainWindow.webContents.send('hotkey:toggleRecording')
  })
  globalShortcut.register('CmdOrCtrl+Shift+D', () => {
    mainWindow.show()
    mainWindow.focus()
  })
})

app.on('will-quit', () => globalShortcut.unregisterAll())
```

---

## Common mistakes to avoid

- Never call `ipcRenderer` directly in React — always use `window.electron`
- Never use `ipcMain.on` for two-way — use `ipcMain.handle` + `ipcRenderer.invoke`
- Never use `remote` module — removed in Electron 14+
- Always check `contextIsolation: true` — if false, security warning in console
- Always `removeListener` in useEffect cleanup or you'll get memory leaks
- Never open DevTools in production: `if (!app.isPackaged) mainWindow.webContents.openDevTools()`
