import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { installErrorTracking, track } from './lib/track'

installErrorTracking('app')
track('app_open')
// If the window crashed and was reloaded, report why (to find the cause).
import('./lib/ipc')
  .then(({ invoke }) => invoke<{ reason: string; exitCode: number } | null>('app:lastCrash'))
  .then((c) => c && track('error', { where: 'renderer-gone', message: `${c.reason} (${c.exitCode})` }))
  .catch(() => {})

// Entry for the main BriefOS window (index.html → #root).
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
