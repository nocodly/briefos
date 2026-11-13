import { getMainWindow } from './index'
import { capsuleOnRecordingStart, capsuleOnRecordingStop } from './Capsule'
import { updateTrayState } from './tray'
import { emitRecordingTick } from './ipc'

// =============================================================================
// RecordingRelay — recording now runs in the main window's renderer (Web Audio
// + MediaRecorder: microphone + system loopback, streamed to the server).
// The main process only MIRRORS the state so the tray, the floating overlay and
// the global hotkey keep working, and RELAYS commands from them to the renderer.
//
//   renderer ──recording:report──► relay  (state changes)
//   tray/overlay/hotkey ──command──► relay ──recording:command──► renderer
// =============================================================================

export type RecordingCommand = 'start' | 'stop' | 'pause' | 'resume' | 'toggle'

export interface RecordingReport {
  recording: boolean
  paused: boolean
  /** Active (non-paused) recorded time in ms at the moment of the report. */
  durationMs: number
  meetingId?: string | null
}

let state: RecordingReport = { recording: false, paused: false, durationMs: 0, meetingId: null }
let reportedAt = Date.now()
let tickTimer: NodeJS.Timeout | null = null

function currentDuration(): number {
  if (!state.recording || state.paused) return state.durationMs
  return state.durationMs + (Date.now() - reportedAt)
}

export function getRecordingStatus(): RecordingReport {
  return { ...state, durationMs: currentDuration() }
}

/** Called by the renderer whenever its recording session changes state. */
export function reportRecordingState(next: RecordingReport): void {
  const wasRecording = state.recording
  state = { ...next }
  reportedAt = Date.now()

  if (state.recording && !wasRecording) {
    console.log('[relay] recording started', state.meetingId)
    updateTrayState(true)
    capsuleOnRecordingStart()
    if (!tickTimer) tickTimer = setInterval(() => emitRecordingTick(currentDuration()), 1000)
  } else if (!state.recording && wasRecording) {
    console.log('[relay] recording stopped', state.meetingId)
    updateTrayState(false)
    capsuleOnRecordingStop()
    if (tickTimer) {
      clearInterval(tickTimer)
      tickTimer = null
    }
  }
  emitRecordingTick(currentDuration())
}

/** Forward a command from tray / overlay / hotkey to the recording renderer. */
export function sendRecordingCommand(command: RecordingCommand): void {
  const win = getMainWindow()
  if (!win || win.isDestroyed()) {
    console.warn('[relay] no main window for command', command)
    return
  }
  // Starting a meeting opens the notes screen, so bring the window forward.
  if (command === 'start' || (command === 'toggle' && !state.recording)) {
    win.show()
    win.focus()
  }
  win.webContents.send('recording:command', command)
}
