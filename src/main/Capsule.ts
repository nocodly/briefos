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
  /** Latest agent task started from the capsule (Claude Code / Codex). */
  agentRun: CapsuleAgentRun | null
}

export interface CapsuleAgentRun {
  runId: string | null
  task: string
  agent: string
  status: 'starting' | 'running' | 'done' | 'failed'
  /** Last line(s) of output, trimmed — enough to see what is happening. */
  tail: string
}

let state: CapsuleState = {
  mode: 'hidden',
  app: null,
  callEnded: false,
  hint: null,
  expanded: true,
  agentRun: null
}
let hintTimer: NodeJS.Timeout | null = null

const MARGIN = 16

/** Width per mode; height comes from the rendered content (capsule:fit). */
function widthFor(s: CapsuleState): number {
  if (s.mode === 'prompt') return 316
  return s.expanded ? 330 : 252
}
const MIN_HEIGHT = 64
let contentHeight = MIN_HEIGHT

function apply(): void {
  if (state.mode === 'hidden') {
    closeOverlayWindow()
    return
  }
  const win = createOverlayWindow()
  const width = widthFor(state)
  const height = Math.max(MIN_HEIGHT, contentHeight)
  // Fixed spot: right edge of the primary display, a fifth of the way down.
  // (Not draggable — dragging a transparent window made it wobble.)
  const { workArea } = screen.getPrimaryDisplay()
  const y = Math.min(workArea.y + Math.round(workArea.height * 0.2), workArea.y + workArea.height - height - MARGIN)
  win.setBounds({ x: workArea.x + workArea.width - width - MARGIN, y, width, height })
  win.webContents.send('capsule:state', state)
}

/** The capsule renderer reports its content height; resize the window to fit. */
export function fitCapsule(height: number): void {
  const h = Math.round(Math.min(Math.max(height, MIN_HEIGHT), 560))
  if (Math.abs(h - contentHeight) < 2) return
  contentHeight = h
  if (state.mode !== 'hidden') apply()
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

/** Track the agent task started from the capsule. */
export function setCapsuleAgentRun(patch: Partial<CapsuleAgentRun> | null): void {
  if (patch === null) {
    setCapsule({ agentRun: null })
    return
  }
  const base: CapsuleAgentRun = state.agentRun ?? { runId: null, task: '', agent: '', status: 'starting', tail: '' }
  setCapsule({ agentRun: { ...base, ...patch }, expanded: true })
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
