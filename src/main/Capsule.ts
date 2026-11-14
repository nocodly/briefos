import { screen } from 'electron'
import { createOverlayWindow, closeOverlayWindow, getOverlayWindow } from './index'

// =============================================================================
// Capsule — state of the floating Minutama capsule (the always-on-top overlay
// window). One place decides what it shows:
//
//   prompt     a call app took the mic → "Call on Zoom · Start notes?"
//   recording  timer + waves, optional reply hint, optional "call ended?"
//   hidden     window closed
//
// The overlay renderer reads the state via capsule:get and receives updates on
// capsule:state; it sends user choices back with capsule:action.
// =============================================================================

export interface ReplyHint {
  id: string
  question: string
  answer: string
}

export interface CapsuleState {
  mode: 'hidden' | 'prompt' | 'recording'
  /** Call app that holds the mic (prompt) or was detected for this meeting. */
  app: string | null
  /** The call app released the mic while we are still recording. */
  callEnded: boolean
  hint: ReplyHint | null
  /** Recording capsule shows the agent panel (hints + task box). */
  expanded: boolean
}

let state: CapsuleState = { mode: 'hidden', app: null, callEnded: false, hint: null, expanded: true }
let hintTimer: NodeJS.Timeout | null = null

const MARGIN = 16

function sizeFor(s: CapsuleState): { width: number; height: number } {
  if (s.mode === 'prompt') return { width: 352, height: 96 }
  const ended = s.callEnded ? 34 : 0
  if (!s.expanded) return { width: 292, height: 76 + ended }
  return { width: 372, height: (s.hint ? 318 : 214) + ended }
}

function apply(): void {
  if (state.mode === 'hidden') {
    closeOverlayWindow()
    return
  }
  const win = createOverlayWindow()
  const { width, height } = sizeFor(state)
  // Keep the capsule pinned to the right edge where the user left it vertically.
  const { workArea } = screen.getDisplayMatching(win.getBounds())
  const prev = win.getBounds()
  const y = Math.min(Math.max(prev.y, workArea.y + MARGIN), workArea.y + workArea.height - height - MARGIN)
  win.setBounds({ x: workArea.x + workArea.width - width - MARGIN, y, width, height })
  win.webContents.send('capsule:state', state)
}

export function getCapsule(): CapsuleState {
  return state
}

export function setCapsule(patch: Partial<CapsuleState>): void {
  state = { ...state, ...patch }
  if (state.mode !== 'recording') state.hint = null
  apply()
}

/** Show a live reply hint for ~60 s (replaced by newer hints). */
export function showHint(hint: ReplyHint): void {
  if (state.mode !== 'recording') return
  if (hintTimer) clearTimeout(hintTimer)
  hintTimer = setTimeout(() => setCapsule({ hint: null }), 60_000)
  setCapsule({ hint, expanded: true })
}

export function toggleCapsuleExpanded(): void {
  setCapsule({ expanded: !state.expanded })
}

export function clearHint(): void {
  if (hintTimer) clearTimeout(hintTimer)
  hintTimer = null
  setCapsule({ hint: null })
}

/** Called once the overlay window has loaded so it renders the latest state. */
export function pushCapsuleState(): void {
  const win = getOverlayWindow()
  if (win && !win.isDestroyed()) win.webContents.send('capsule:state', state)
}

// -- Lifecycle glue (call detector + recording relay) ------------------------

/** App whose prompt the user dismissed (or whose call they stopped noting). */
let dismissedApp: string | null = null

export function capsuleOnCallStart(app: string): void {
  if (state.mode === 'recording') {
    setCapsule({ app, callEnded: false })
    return
  }
  if (dismissedApp === app) return
  setCapsule({ mode: 'prompt', app })
}

export function capsuleOnCallEnd(): void {
  dismissedApp = null
  if (state.mode === 'prompt') setCapsule({ mode: 'hidden', app: null })
  else if (state.mode === 'recording') setCapsule({ callEnded: true })
}

export function capsuleOnRecordingStart(): void {
  setCapsule({ mode: 'recording', callEnded: false, hint: null, expanded: true })
}

export function capsuleOnRecordingStop(): void {
  // Stopped while the call is still running → don't nag about the same call.
  if (state.app && !state.callEnded) dismissedApp = state.app
  setCapsule({ mode: 'hidden', app: null, callEnded: false })
}

/** User closed the "Start notes?" prompt for this call. */
export function capsuleDismiss(): void {
  if (state.app) dismissedApp = state.app
  setCapsule({ mode: 'hidden' })
}
