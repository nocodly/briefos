import { screen, type BrowserWindow } from 'electron'
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

/** Live question card: the client's question, translation, term, optional hint. */
export interface ReplyHint {
  id: string
  question: string
  /** Points to mention ('' when "Suggest what to answer" is off). */
  answer: string
  translation?: string | null
  term?: string | null
  termExplanation?: string | null
  latencyMs?: number | null
  /** Cards in this call / still unanswered. */
  total?: number
  open?: number
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
  /** Short status line shown for a few seconds (e.g. "No question yet"). */
  notice: string | null
  /** Live captions of the client: last lines with translations. */
  live: { lines: CapsuleLiveLine[]; status: 'off' | 'connecting' | 'live' | 'failed' }
}

export interface CapsuleLiveLine {
  text: string
  translation: string | null
  final: boolean
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
  agentRun: null,
  notice: null,
  live: { lines: [], status: 'off' }
}
let hintTimer: NodeJS.Timeout | null = null

const MARGIN = 16

/** Width per mode; height comes from the rendered content (capsule:fit). */
function widthFor(s: CapsuleState): number {
  if (s.mode === 'prompt') return 316
  return s.expanded ? 372 : 252
}
const MIN_HEIGHT = 64
let contentHeight = MIN_HEIGHT

/** Where the user dragged the capsule: its right edge + top (null = default). */
let userSpot: { right: number; y: number } | null = null
const tracked = new WeakSet<BrowserWindow>()

function apply(): void {
  if (state.mode === 'hidden') {
    closeOverlayWindow()
    return
  }
  const win = createOverlayWindow()
  if (!tracked.has(win)) {
    tracked.add(win)
    // Remember the spot after a drag; keep the right edge as the anchor so the
    // capsule grows to the left when it widens.
    win.on('moved', () => {
      const b = win.getBounds()
      userSpot = { right: b.x + b.width, y: b.y }
    })
  }
  const width = widthFor(state)
  const height = Math.max(MIN_HEIGHT, contentHeight)
  const display = userSpot
    ? screen.getDisplayNearestPoint({ x: userSpot.right - 10, y: userSpot.y + 10 })
    : screen.getPrimaryDisplay()
  const wa = display.workArea
  const right = userSpot ? userSpot.right : wa.x + wa.width - MARGIN
  const top = userSpot ? userSpot.y : wa.y + Math.round(wa.height * 0.2)
  const x = Math.min(Math.max(right - width, wa.x), wa.x + wa.width - width)
  const y = Math.min(Math.max(top, wa.y), wa.y + wa.height - height)
  // Lock the size: on Windows a transparent frameless window can creep in size
  // while it is dragged (DPI rounding) — fixed min = max prevents that.
  win.setMinimumSize(1, 1)
  win.setMaximumSize(4000, 4000)
  win.setBounds({ x, y, width, height })
  win.setMinimumSize(width, height)
  win.setMaximumSize(width, height)
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
  if (state.mode !== 'recording') {
    state.hint = null
    state.live = { lines: [], status: 'off' }
  }
  apply()
}

/** Show a question card for ~2 min (replaced by newer cards). */
export function showHint(hint: ReplyHint): void {
  if (state.mode !== 'recording') return
  if (hintTimer) clearTimeout(hintTimer)
  hintTimer = setTimeout(() => setCapsule({ hint: null }), 120_000)
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

let noticeTimer: NodeJS.Timeout | null = null
export function capsuleNotice(text: string): void {
  if (noticeTimer) clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => setCapsule({ notice: null }), 4000)
  setCapsule({ notice: text })
}

/** Live captions from the main renderer (throttled there). */
export function setCapsuleLive(live: CapsuleState['live']): void {
  if (state.mode !== 'recording' && live.lines.length) return
  state = { ...state, live }
  const win = getOverlayWindow()
  // Content-only change: push it without re-applying the window bounds.
  if (win && !win.isDestroyed()) win.webContents.send('capsule:state', state)
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
