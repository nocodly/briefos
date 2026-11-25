import { screen, type BrowserWindow } from 'electron'
import { createOverlayWindow, closeOverlayWindow, getOverlayWindow, isOverlayLoaded, isOverlayShown, revealOverlay } from './index'
import { getSetting, setSetting } from './store'

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
  /** Calendar event the prompt is about ("Call with Anna at 15:00"). */
  event?: { title: string; start: number; hasNotes: boolean } | null
  /** The call app released the mic while we are still recording. */
  callEnded: boolean
  hint: ReplyHint | null
  /** Recording capsule shows the agent panel (hints + task box). */
  expanded: boolean
  /** Latest agent task started from the capsule (Claude Code / Codex). */
  agentRun: CapsuleAgentRun | null
  /** Short status line shown for a few seconds (e.g. "No question yet"). */
  notice: string | null
  /** Large reading view: a big window in the middle of the screen. */
  large: boolean
  /** Captions area height (px) — the user can drag the capsule bigger/smaller. */
  captionsH: number
  /** Live captions of the client: last lines with translations. */
  live: { lines: CapsuleLiveLine[]; status: 'off' | 'connecting' | 'live' | 'failed' }
  /** "Ask AI" mini chat about a caption line (null = closed). */
  ask: CapsuleAsk | null
}

export interface CapsuleAsk {
  /** The caption line the user picked. */
  line: string
  /** Follow-up questions and AI answers; the first answer is about the line. */
  messages: { role: 'user' | 'assistant'; text: string }[]
  status: 'thinking' | 'answering' | 'done' | 'failed'
  error: string | null
}

export interface CapsuleLiveLine {
  id: string
  speaker: 'me' | 'them'
  text: string
  translation: string | null
  final: boolean
  /** Sentence → translation pairs (client lines). */
  parts?: { text: string; translation: string | null; live?: boolean; skip?: boolean; done?: boolean; terms?: { term: string; explanation: string }[] }[]
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
  large: true,
  captionsH: 460,
  live: { lines: [], status: 'off' },
  ask: null
}
let hintTimer: NodeJS.Timeout | null = null

const MARGIN = 16

/** Width per mode; height comes from the rendered content (capsule:fit). */
function widthFor(s: CapsuleState, workWidth: number): number {
  if (s.mode === 'prompt') return 316
  if (!s.expanded) return 252
  const custom = sizeFor(s.large)
  if (custom) return Math.min(Math.max(custom.w, MIN_W), workWidth - 2 * MARGIN)
  return s.large ? Math.min(820, workWidth - 2 * MARGIN) : 440
}

const MIN_W = 380
const MIN_CAPTIONS_H = 140
const DEFAULT_CAPTIONS_H = { large: 460, small: 300 }
/** Size the user chose for this view (null = default). */
function sizeFor(large: boolean): { w: number; h: number } | null {
  return (large ? sizeLarge : sizeSmall) ?? null
}
let sizeLarge: { w: number; h: number } | null = null
let sizeSmall: { w: number; h: number } | null = null
let sizesLoaded = false
function loadSizes(): void {
  if (sizesLoaded) return
  sizesLoaded = true
  sizeLarge = (getSetting('capsuleSizeLarge') as { w: number; h: number } | null) ?? null
  sizeSmall = (getSetting('capsuleSizeSmall') as { w: number; h: number } | null) ?? null
}
function captionsHFor(large: boolean): number {
  return sizeFor(large)?.h ?? (large ? DEFAULT_CAPTIONS_H.large : DEFAULT_CAPTIONS_H.small)
}

/**
 * The user drags the capsule's corner: new width and captions height. The
 * top-left corner stays where it is. `done` saves the size for next calls.
 */
export function resizeCapsule(w: number, h: number, done: boolean): void {
  if (state.mode !== 'recording' || !state.expanded) return
  const win = getOverlayWindow()
  if (!win || win.isDestroyed()) return
  const b = win.getBounds()
  const wa = screen.getDisplayMatching(b).workArea
  const width = Math.round(Math.min(Math.max(w, MIN_W), wa.width - 2 * MARGIN))
  const captionsH = Math.round(Math.min(Math.max(h, MIN_CAPTIONS_H), wa.height - 260))
  const size = { w: width, h: captionsH }
  if (state.large) {
    sizeLarge = size
    largeSpot = { x: b.x, y: b.y }
  } else {
    sizeSmall = size
    userSpot = { right: b.x + width, y: b.y }
  }
  if (done) setSetting(state.large ? 'capsuleSizeLarge' : 'capsuleSizeSmall', size)
  setCapsule({ captionsH })
}

/** Double-click on the corner: back to the default size. */
export function resetCapsuleSize(): void {
  if (state.large) sizeLarge = null
  else sizeSmall = null
  setSetting(state.large ? 'capsuleSizeLarge' : 'capsuleSizeSmall', null)
  setCapsule({ captionsH: captionsHFor(state.large) })
}
function isLarge(s: CapsuleState): boolean {
  return s.mode === 'recording' && s.expanded && s.large
}
const MIN_HEIGHT = 64
let contentHeight = MIN_HEIGHT

/** Where the user dragged the capsule: its right edge + top (null = default). Separate for the large view. */
let userSpot: { right: number; y: number } | null = null
let largeSpot: { x: number; y: number } | null = null
const tracked = new WeakSet<BrowserWindow>()

/** The capsule is about to appear: show it once the new content has its size. */
let revealPending = false
let revealTimer: NodeJS.Timeout | null = null
let shownMode: CapsuleState['mode'] = 'hidden'

function revealWhenReady(win: BrowserWindow): void {
  if (!revealPending) return
  revealPending = false
  if (revealTimer) clearTimeout(revealTimer)
  revealTimer = null
  revealOverlay(win)
  // The content is already rendered at its final size off-screen: move it in.
  apply()
}

function apply(): void {
  if (state.mode === 'hidden') {
    revealPending = false
    shownMode = 'hidden'
    closeOverlayWindow()
    return
  }
  const win = createOverlayWindow()
  if (shownMode !== state.mode) {
    // New mode (prompt → recording, or first show): wait for the renderer to
    // report the new height, so the window appears at its final size.
    shownMode = state.mode
    if (!isOverlayShown()) {
      revealPending = true
      if (revealTimer) clearTimeout(revealTimer)
      revealTimer = setTimeout(() => revealWhenReady(win), isOverlayLoaded() ? 250 : 2500)
    }
  }
  if (!tracked.has(win)) {
    tracked.add(win)
    // Remember the spot after a drag; keep the right edge as the anchor so the
    // capsule grows to the left when it widens.
    win.on('moved', () => {
      const b = win.getBounds()
      if (b.x < -10000) return // parked off-screen, not a user drag
      if (isLarge(state)) largeSpot = { x: b.x, y: b.y }
      else userSpot = { right: b.x + b.width, y: b.y }
    })
  }
  const large = isLarge(state)
  const anchor = large ? largeSpot && { x: largeSpot.x + 10, y: largeSpot.y + 10 } : userSpot && { x: userSpot.right - 10, y: userSpot.y + 10 }
  const display = anchor ? screen.getDisplayNearestPoint(anchor) : screen.getPrimaryDisplay()
  const wa = display.workArea
  const width = widthFor(state, wa.width)
  const height = Math.min(Math.max(MIN_HEIGHT, contentHeight), wa.height - 2 * MARGIN)
  let x: number
  let top: number
  if (large) {
    // Big reading view: centred unless the user moved it.
    x = largeSpot ? largeSpot.x : wa.x + Math.round((wa.width - width) / 2)
    top = largeSpot ? largeSpot.y : wa.y + Math.round(wa.height * 0.08)
  } else {
    const right = userSpot ? userSpot.right : wa.x + wa.width - MARGIN
    x = right - width
    top = userSpot ? userSpot.y : wa.y + Math.round(wa.height * 0.2)
  }
  x = Math.min(Math.max(x, wa.x), wa.x + wa.width - width)
  let y = Math.min(Math.max(top, wa.y), wa.y + wa.height - height)
  // Not revealed yet: lay it out off-screen at its final size first.
  if (!isOverlayShown()) {
    x = -30000
    y = -30000
  }
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
  const h = Math.round(Math.min(Math.max(height, MIN_HEIGHT), 1400))
  if (Math.abs(h - contentHeight) >= 2) {
    contentHeight = h
    if (state.mode !== 'hidden') apply()
  }
  const win = getOverlayWindow()
  if (win && state.mode !== 'hidden' && h > MIN_HEIGHT) revealWhenReady(win)
}

export function getCapsule(): CapsuleState {
  return state
}

export function setCapsule(patch: Partial<CapsuleState>): void {
  state = { ...state, ...patch }
  if (state.mode !== 'recording') {
    state.hint = null
    state.live = { lines: [], status: 'off' }
    state.ask = null
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

/** "Ask AI" mini chat, driven by the main renderer (it holds the session). */
export function setCapsuleAsk(ask: CapsuleAsk | null): void {
  if (state.mode !== 'recording' && ask) return
  const opening = Boolean(ask) !== Boolean(state.ask)
  if (opening) {
    // Opening / closing changes the layout: re-apply the window bounds.
    setCapsule({ ask, expanded: true })
    return
  }
  state = { ...state, ask }
  const win = getOverlayWindow()
  if (win && !win.isDestroyed()) win.webContents.send('capsule:state', state)
}

/** Switch between the big centred reading view and the small side capsule. */
export function toggleCapsuleLarge(): void {
  setSetting('capsuleLarge', !state.large)
  setCapsule({ large: !state.large, expanded: true, captionsH: captionsHFor(!state.large) })
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

/** 5 minutes before a calendar event: offer to take notes, with its context ready. */
export function capsuleOnEventSoon(ev: { title: string; start: number; description: string }): void {
  if (state.mode !== 'hidden') return
  setCapsule({ mode: 'prompt', app: null, event: { title: ev.title, start: ev.start, hasNotes: Boolean(ev.description.trim()) } })
}

export function capsuleOnCallStart(app: string): void {
  if (state.mode === 'recording') {
    setCapsule({ app, callEnded: false })
    return
  }
  if (dismissedApp === app) return
  // Keep the calendar event only if this call is around its time.
  const ev = state.event && Math.abs(Date.now() - state.event.start) < 20 * 60 * 1000 ? state.event : null
  setCapsule({ mode: 'prompt', app, event: ev })
}

export function capsuleOnCallEnd(): void {
  dismissedApp = null
  if (state.mode === 'prompt') setCapsule({ mode: 'hidden', app: null })
  else if (state.mode === 'recording') setCapsule({ callEnded: true })
}

export function capsuleOnRecordingStart(): void {
  loadSizes()
  const large = getSetting('capsuleLarge') !== false
  setCapsule({
    captionsH: captionsHFor(large),
    event: null, mode: 'recording', callEnded: false, hint: null, expanded: true, large: getSetting('capsuleLarge') !== false })
}

export function capsuleOnRecordingStop(): void {
  // Stopped while the call is still running → don't nag about the same call.
  if (state.app && !state.callEnded) dismissedApp = state.app
  setCapsule({ mode: 'hidden', app: null, callEnded: false })
}

/** User closed the "Start notes?" prompt for this call. */
export function capsuleDismiss(): void {
  if (state.app) dismissedApp = state.app
  setCapsule({ mode: 'hidden', event: null })
}
