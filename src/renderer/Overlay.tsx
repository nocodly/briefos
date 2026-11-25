import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { invoke, subscribe } from './lib/ipc'
import { LogoMark } from './components/Logo'

// =============================================================================
// Capsule — the floating, always-on-top Minutama widget, fixed at the right
// edge of the screen; drag it anywhere — it remembers the spot. The main process owns its state
// (src/main/Capsule.ts); the window height follows this content (capsule:fit).
//
//   prompt     a call app took the mic → "Call on Zoom · Take notes?"
//   recording  compact bar (logo, timer, waves, pause/stop, size, collapse) and
//              the call panel: live captions + translation, "Ask AI" on any
//              line, and the client's question card. Nothing else during a call.
// =============================================================================

interface ReplyHint {
  id: string
  question: string
  answer: string
  translation?: string | null
  term?: string | null
  termExplanation?: string | null
  latencyMs?: number | null
  total?: number
  open?: number
}
interface AgentRun {
  runId: string | null
  task: string
  agent: string
  status: 'starting' | 'running' | 'done' | 'failed'
  tail: string
}
interface CapsuleState {
  mode: 'hidden' | 'prompt' | 'recording'
  app: string | null
  event?: { title: string; start: number; hasNotes: boolean } | null
  callEnded: boolean
  hint: ReplyHint | null
  expanded: boolean
  agentRun: AgentRun | null
  notice: string | null
  large?: boolean
  captionsH?: number
  live?: {
    lines: {
      id: string
      speaker: 'me' | 'them'
      text: string
      translation: string | null
      final: boolean
      parts?: { text: string; translation: string | null; live?: boolean; skip?: boolean }[]
    }[]
    status: 'off' | 'connecting' | 'live' | 'failed'
  }
  ask?: AskState | null
}
interface AskState {
  line: string
  messages: { role: 'user' | 'assistant'; text: string }[]
  status: 'thinking' | 'answering' | 'done' | 'failed'
  error: string | null
}

type Action = 'start' | 'dismiss' | 'open' | 'clearHint' | 'toggle' | 'size' | 'clearRun' | 'cancelRun'

// Drag the capsule by its body; anything clickable opts out.
const drag = { WebkitAppRegion: 'drag' } as unknown as React.CSSProperties
const noDrag = { WebkitAppRegion: 'no-drag' } as unknown as React.CSSProperties

function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

const act = (a: Action) => invoke('capsule:action', a).catch(console.error)

export default function Overlay() {
  const [cap, setCap] = useState<CapsuleState>({
    mode: 'hidden',
    app: null,
    callEnded: false,
    hint: null,
    expanded: true,
    agentRun: null,
    notice: null
  })
  const [durationMs, setDurationMs] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    const unsubs = [
      subscribe('capsule:state', (s: CapsuleState) => setCap(s)),
      subscribe('recording:tick', ({ durationMs: ms }) => setDurationMs(ms))
    ]
    invoke<CapsuleState>('capsule:get').then(setCap).catch(() => {})
    invoke<{ durationMs: number; paused: boolean }>('recording:status')
      .then((st) => {
        if (st) {
          setDurationMs(st.durationMs ?? 0)
          setPaused(Boolean(st.paused))
        }
      })
      .catch(() => {})
    return () => unsubs.forEach((u) => u())
  }, [])

  const togglePause = async () => {
    try {
      await invoke(paused ? 'recording:resume' : 'recording:pause')
      setPaused(!paused)
    } catch (err) {
      console.error('[capsule] pause/resume failed', err)
    }
  }
  const stop = () => invoke('recording:stop').catch(console.error)

  if (cap.mode === 'prompt') {
    return (
      <Shell>
        <div className="flex h-[66px] items-center gap-2.5 px-3" style={drag}>
          <div className="relative flex-shrink-0">
            <LogoMark size={34} />
            <span className="absolute -right-1 -top-1 h-3 w-3 animate-pulse-dot rounded-full bg-green ring-[3px] ring-[#121317]" />
          </div>
          <div className="min-w-0 flex-1">
            {cap.event ? (
              <>
                <div className="truncate text-[12.5px] font-semibold leading-tight text-white" title={cap.event.title}>
                  {cap.event.title}
                </div>
                <div className="mt-0.5 truncate text-[11px] text-white/50">
                  {new Date(cap.event.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {cap.event.hasNotes ? ' · context from your calendar ready' : ' · take notes?'}
                </div>
              </>
            ) : (
              <>
                <div className="truncate text-[12.5px] font-semibold leading-tight text-white">Call on {cap.app ?? 'your computer'}</div>
                <div className="mt-0.5 text-[11px] text-white/50">Take notes?</div>
              </>
            )}
          </div>
          <button
            onClick={() => act('start')}
            style={noDrag}
            className="btn-accent flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[12px] font-semibold active:scale-95"
          >
            <i className="ti ti-player-record-filled text-[11px]" /> Start
          </button>
          <IconButton icon="x" title="Not now" onClick={() => act('dismiss')} />
        </div>
        <button
          onClick={() => void invoke('capsule:quick', 'consent')}
          style={noDrag}
          className="mx-3 mb-2.5 -mt-1 flex items-center gap-1.5 text-left text-[10.5px] text-white/45 hover:text-white"
          title="Copies a short message you can paste into the call chat"
        >
          <i className="ti ti-message-circle text-[12px] text-accent-pale" />
          Let them know you take notes · <span className="underline">copy message</span>
        </button>
      </Shell>
    )
  }

  if (cap.mode !== 'recording') return null

  return (
    <Shell>
      {/* Bar */}
      <div className="flex h-[56px] items-center gap-2.5 px-2.5" style={drag}>
        <button onClick={() => act('open')} title="Open notes" style={noDrag} className="flex-shrink-0 hover:scale-105">
          <LogoMark size={32} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${paused ? 'bg-amber' : 'animate-pulse-dot bg-red'}`} />
            <span className="font-mono text-[14px] leading-none tracking-tight text-white">{formatClock(durationMs)}</span>
          </div>
          <div className="mt-1.5">
            <AudioWave active={!paused} />
          </div>
        </div>
        <IconButton icon={paused ? 'player-play' : 'player-pause'} title={paused ? 'Resume' : 'Pause'} onClick={togglePause} />
        <button
          onClick={stop}
          title="Stop and write notes"
          style={noDrag}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-red text-white hover:bg-red/85 active:scale-95"
        >
          <i className="ti ti-player-stop-filled text-[13px]" />
        </button>
        {cap.expanded && (
          <IconButton
            icon={cap.large ? 'arrows-minimize' : 'arrows-maximize'}
            title={cap.large ? 'Small capsule at the side' : 'Big reading view in the middle'}
            onClick={() => act('size')}
          />
        )}
        <IconButton
          icon={cap.expanded ? 'chevron-up' : 'sparkles'}
          title={cap.expanded ? 'Hide agent' : 'Show agent'}
          onClick={() => act('toggle')}
        />
      </div>

      {cap.callEnded && (
        <div className="mx-3 mb-2 flex items-center gap-2 text-[11px] text-white/65" style={noDrag}>
          <i className="ti ti-phone-off text-[12px] text-accent-pale" />
          <span className="flex-1">Call ended — stop and write notes?</span>
          <button onClick={stop} className="font-semibold text-accent-pale hover:text-white">
            Stop
          </button>
        </div>
      )}

      {cap.expanded && <AgentPanel
          hint={cap.hint}
          run={cap.agentRun}
          notice={cap.notice}
          live={cap.live}
          large={Boolean(cap.large)}
          ask={cap.ask ?? null}
          captionsH={cap.captionsH ?? (cap.large ? 460 : 300)}
        />}
    </Shell>
  )
}

// ─── Agent panel ────────────────────────────────────────────────────────────

function AgentPanel({
  hint,
  run,
  notice,
  live,
  large,
  ask,
  captionsH
}: {
  hint: ReplyHint | null
  run: AgentRun | null
  notice: string | null
  live?: CapsuleState['live']
  large: boolean
  ask: AskState | null
  captionsH: number
}) {
  // During a call the capsule shows only the conversation: live captions with
  // translation, "Ask AI" on any line, and the client's question card. Tasks,
  // dates and agents are handled after the call, in the meeting notes.
  return (
    <div className="relative flex flex-col gap-2 border-t border-white/[.07] px-2.5 pb-2.5 pt-2" style={noDrag}>
      {/* Same tree whether the chat is open or not, so the captions never re-mount (and re-type). */}
      <div className={large ? 'flex gap-2' : 'flex flex-col gap-2'}>
        {live && live.status !== 'off' && (
          <div className="min-w-0 flex-1">
            <LiveCaptions live={live} large={large} height={!large && ask ? Math.min(200, captionsH) : captionsH} hint={hint} />
          </div>
        )}
        {ask && <AskPanel ask={ask} large={large && Boolean(live && live.status !== 'off')} height={captionsH + 43} />}
      </div>
      {/* With live captions the question is marked inside them (with its term); the separate card is only for calls without captions. */}
      {hint && !(live && live.status !== 'off') && <QuestionCardView hint={hint} />}
      {notice && !hint && (
        <div className="flex items-center gap-1.5 px-0.5 text-[11px] text-white/45">
          <i className="ti ti-info-circle text-[12px] text-accent" /> {notice}
        </div>
      )}
      {run && <RunCard run={run} />}
      <ResizeGrip captionsH={captionsH} />
    </div>
  )
}

/**
 * Drag the bottom-right corner to make the capsule bigger or smaller (width +
 * captions height); double-click to go back to the default size. Remembered
 * for the next calls.
 */
function ResizeGrip({ captionsH }: { captionsH: number }) {
  const start = useRef<{ x: number; y: number; w: number; h: number } | null>(null)
  const frame = useRef(0)
  const latest = useRef<{ w: number; h: number } | null>(null)

  const send = (done: boolean) => {
    if (!latest.current) return
    void invoke('capsule:resize', { ...latest.current, done }).catch(() => {})
  }
  return (
    <div
      role="separator"
      aria-label="Resize"
      title="Drag to resize · double-click to reset"
      onPointerDown={(e) => {
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        start.current = { x: e.screenX, y: e.screenY, w: window.innerWidth, h: captionsH }
      }}
      onPointerMove={(e) => {
        const s = start.current
        if (!s) return
        latest.current = { w: s.w + (e.screenX - s.x), h: s.h + (e.screenY - s.y) }
        if (!frame.current) {
          frame.current = requestAnimationFrame(() => {
            frame.current = 0
            send(false)
          })
        }
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId)
        if (start.current) send(true)
        start.current = null
        latest.current = null
      }}
      onDoubleClick={() => void invoke('capsule:resize', { reset: true }).catch(() => {})}
      className="absolute bottom-1 right-1 z-20 flex h-5 w-5 cursor-nwse-resize items-end justify-end p-0.5 text-white/30 hover:text-white/70"
      style={noDrag}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <path d="M9 1L1 9M9 5L5 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </div>
  )
}

function LiveCaptions({
  live,
  large,
  height,
  hint
}: {
  live: NonNullable<CapsuleState['live']>
  large: boolean
  height: number
  hint: ReplyHint | null
}) {
  const box = useRef<HTMLDivElement>(null)
  const follow = useRef(true)
  const [following, setFollowing] = useState(true)
  const lines = live.lines
  const [mode, setModeState] = useState<CaptionMode>(() => {
    try {
      return localStorage.getItem('captionMode') === 'translation' ? 'translation' : 'both'
    } catch {
      return 'both'
    }
  })
  const setMode = (m: CaptionMode) => {
    setModeState(m)
    try {
      localStorage.setItem('captionMode', m)
    } catch {
      /* private storage off */
    }
  }
  // Focus: the newest client sentences are big and bright; older ones calm
  // down. Scrolled up to read history → everything is in full colour again.
  const clientParts: string[] = []
  for (const l of lines) {
    if (l.speaker === 'me') continue
    const parts = l.parts?.length ? l.parts : [{ text: l.text, translation: l.translation }]
    parts.forEach((_, i) => clientParts.push(`${l.id}#${i}`))
  }
  const fresh = new Set(clientParts.slice(-3))
  // Ask AI is pinned on ONE sentence only: the newest client line's question
  // (or its newest finished sentence).
  const lastClient = [...lines].reverse().find((l) => l.speaker !== 'me' && l.text.trim())

  // Always keep the newest words in view: every frame, glide the scroll toward
  // the bottom (also while a line is still being typed). Stops only when the
  // user scrolls up to read; scrolling back down resumes it.
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const el = box.current
      if (el && follow.current) {
        const target = el.scrollHeight - el.clientHeight
        const diff = target - el.scrollTop
        if (diff > 0.5) el.scrollTop += Math.max(1, diff * 0.18)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const setFollow = (v: boolean) => {
    follow.current = v
    setFollowing(v)
  }
  const atBottom = (el: HTMLDivElement) => el.scrollHeight - el.scrollTop - el.clientHeight < 24

  return (
    <div className="relative rounded-[14px] border border-white/[.08] bg-white/[.035]">
      <div className="flex items-center gap-1.5 px-4 pt-2.5 text-[10px] font-semibold uppercase tracking-[.1em] text-white/45">
        <span className={`h-1.5 w-1.5 rounded-full ${live.status === 'live' ? 'animate-pulse-dot bg-green' : 'bg-amber'}`} />
        {live.status === 'live' ? 'Live' : live.status === 'failed' ? 'Live captions off' : 'Connecting…'}
        <ModeSwitch mode={mode} onChange={setMode} />
      </div>
      <div
        ref={box}
        // Only a deliberate scroll up stops following; reaching the bottom again resumes it.
        onWheel={(e) => {
          if (e.deltaY < 0) setFollow(false)
          else if (atBottom(e.currentTarget)) setFollow(true)
        }}
        onScroll={(e) => {
          if (!follow.current && atBottom(e.currentTarget)) setFollow(true)
        }}
        onMouseDown={() => setFollow(false)}
        onMouseUp={(e) => atBottom(e.currentTarget) && setFollow(true)}
        style={{ height }}
        className="caption-scroll overflow-y-auto px-4 pb-4 pt-2"
      >
        {lines.length === 0 ? (
          <div className="pt-2 text-[13px] text-white/35">Words appear here as people speak.</div>
        ) : (
          <div className={`flex flex-col ${large ? 'gap-5' : 'gap-3.5'}`}>
            {lines.map((l, i) => (
              <CaptionLine
                key={l.id}
                line={l}
                large={large}
                mode={mode}
                fresh={fresh}
                calm={following}
                hint={hint}
                newest={l.id === lastClient?.id}
                continued={i > 0 && l.speaker !== 'me' && lines[i - 1].speaker !== 'me'}
              />
            ))}
            {/* Room below the newest line: it sits a bit above the bottom edge, nearer the middle. */}
            <div aria-hidden="true" style={{ height: Math.round(height * 0.28) }} />
          </div>
        )}
      </div>
      {!following && (
        <button
          onClick={() => setFollow(true)}
          className="absolute bottom-10 left-1/2 -translate-x-1/2 rounded-full bg-accent px-3 py-1 text-[11.5px] font-semibold text-white shadow-lg animate-caption-in"
        >
          ↓ Latest
        </button>
      )}
      {lines.length === 0 && (
        <div className="border-t border-white/[.06] px-4 py-1.5 text-[10.5px] text-white/35">
          AI transcription and translation can contain mistakes. Check important details yourself.
        </div>
      )}
    </div>
  )
}

/**
 * "Ask AI" mini chat: the picked line, the AI answer (streams in) and a box for
 * follow-up questions. Lives next to the captions so the call can go on.
 */
function AskPanel({ ask, large, height }: { ask: AskState; large: boolean; height: number }) {
  const [text, setText] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const busy = ask.status === 'thinking' || ask.status === 'answering'

  // Keep the newest part of the answer in view while it streams.
  useEffect(() => {
    const el = box.current
    if (el) el.scrollTop = el.scrollHeight
  }, [ask.messages, ask.status])

  const send = () => {
    const t = text.trim()
    if (!t || busy) return
    setText('')
    void invoke('capsule:ask', { followUp: t })
  }

  return (
    <div
      style={large ? { height } : undefined}
      className={`flex flex-col rounded-[14px] border border-accent/30 bg-[#1A1210]/60 animate-caption-in ${
        large ? 'w-[300px] flex-none' : 'h-[240px]'
      }`}
    >
      <div className="flex items-center gap-1.5 px-3.5 pt-2.5 text-[10px] font-semibold uppercase tracking-[.1em] text-accent-pale">
        <i className="ti ti-sparkles text-[12px]" /> Ask AI
        <button
          onClick={() => void invoke('capsule:ask', { close: true })}
          title="Close"
          className="ml-auto flex h-5 w-5 items-center justify-center rounded-md text-white/45 hover:bg-white/10 hover:text-white"
        >
          <i className="ti ti-x text-[12px]" />
        </button>
      </div>
      <div ref={box} className="caption-scroll min-h-0 flex-1 overflow-y-auto px-3.5 pb-2 pt-2">
        <div className="border-l-2 border-white/20 pl-2.5 text-[12px] italic leading-snug text-white/55 line-clamp-3">{ask.line}</div>
        <div className="mt-2.5 flex flex-col gap-2.5">
          {ask.messages.map((m, i) =>
            m.role === 'user' ? (
              <div key={i} className="self-end rounded-[10px] bg-white/[.08] px-2.5 py-1.5 text-[12px] text-white/85">
                {m.text}
              </div>
            ) : (
              <div key={i} className={`whitespace-pre-wrap leading-relaxed text-white/90 ${large ? 'text-[14px]' : 'text-[13px]'}`}>
                {m.text}
                {ask.status === 'answering' && i === ask.messages.length - 1 && <span className="caption-caret" aria-hidden="true" />}
              </div>
            )
          )}
          {ask.status === 'thinking' && (
            <div className="flex items-center gap-1.5 text-[12px] text-white/50">
              <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent" /> Thinking…
            </div>
          )}
          {ask.status === 'failed' && <div className="text-[12px] text-red">{ask.error ?? 'AI could not answer right now.'}</div>}
        </div>
      </div>
      <div className="flex items-center gap-1 border-t border-white/[.06] p-1.5 pl-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder={busy ? 'AI is answering…' : 'Ask a follow-up…'}
          className="min-w-0 flex-1 bg-transparent text-[12px] text-white outline-none placeholder:text-white/35"
        />
        <button
          onClick={send}
          disabled={!text.trim() || busy}
          title="Ask (Enter)"
          className="btn-accent flex h-7 w-7 items-center justify-center rounded-lg disabled:opacity-30"
        >
          <i className="ti ti-send text-[13px]" />
        </button>
      </div>
    </div>
  )
}

type CaptionLineData = NonNullable<CapsuleState['live']>['lines'][number]

type CaptionMode = 'both' | 'translation'

/** "Both" = the client's words + translation; "Translation" = only the translation. */
function ModeSwitch({ mode, onChange }: { mode: CaptionMode; onChange: (m: CaptionMode) => void }) {
  return (
    <div className="ml-auto flex rounded-full bg-white/[.06] p-0.5 normal-case tracking-normal">
      {(
        [
          ['both', 'Both'],
          ['translation', 'Translation']
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${mode === id ? 'bg-white/[.12] text-white' : 'text-white/45 hover:text-white/75'}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

const wordsOf = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean)
/** The question card for this sentence (same words), to show its term inline. */
function hintFor(text: string, hint: ReplyHint | null): ReplyHint | null {
  if (!hint?.term || !hint.termExplanation) return null
  const a = new Set(wordsOf(text))
  const b = wordsOf(hint.question)
  if (!b.length) return null
  return b.filter((w) => a.has(w)).length / b.length >= 0.6 ? hint : null
}

/**
 * Words appear the moment they are recognized (no letter-by-letter typing that
 * falls behind fast speakers); each new word fades in, the newest is orange.
 */
function LiveWords({ text, className }: { text: string; className: string }) {
  const seen = useRef(0)
  const words = text.split(/(\s+)/)
  const count = words.filter((w) => w.trim()).length
  const from = seen.current
  useEffect(() => {
    seen.current = count
  })
  let n = 0
  return (
    <div className={className}>
      {words.map((w, i) => {
        if (!w.trim()) return w
        n++
        const isNew = n > from
        const newest = n === count
        return (
          <span key={i} className={`${isNew ? 'animate-word-in' : ''} ${newest ? 'text-[#FFB59C]' : ''}`}>
            {w}
          </span>
        )
      })}
      <span className="caption-caret" aria-hidden="true" />
    </div>
  )
}

/**
 * One client sentence: their words (bright — you speak this language on the
 * call) with the translation right under it. Questions get a "?" mark and the
 * hard term explained. Newest sentences are big; older ones calm down unless
 * you scrolled up to read.
 */
function Sentence({
  text,
  translation,
  speaking,
  mode,
  big,
  large,
  hint,
  pinAsk,
  skip = false
}: {
  text: string
  translation: string | null
  skip?: boolean
  speaking: boolean
  mode: CaptionMode
  big: boolean
  large: boolean
  hint: ReplyHint | null
  pinAsk: boolean
}) {
  const question = /\?\s*$/.test(text.trim())
  const term = hintFor(text, hint)
  const srcSize = large ? 'text-[17px]' : 'text-[14px]'
  const trSize = large ? 'text-[16px]' : 'text-[13.5px]'
  const srcColor = big ? 'text-white' : 'text-white/55'
  const trColor = big ? 'text-[#8FD8F7]' : 'text-[#8FD8F7]/55'
  const showSource = mode === 'both' || !translation
  return (
    <div className="group/s relative flex gap-2 transition-colors duration-500">
      <span
        className={`mt-[3px] flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full text-[11px] font-bold ${
          question ? 'bg-amber/20 text-amber' : 'invisible'
        }`}
        aria-hidden={!question}
      >
        ?
      </span>
      <div className="min-w-0 flex-1">
        {showSource &&
          (speaking ? (
            <LiveWords text={text} className={`font-medium leading-snug ${srcSize} ${mode === 'translation' ? 'text-white/45' : srcColor}`} />
          ) : (
            <div className={`font-medium leading-snug transition-colors duration-700 ${srcSize} ${mode === 'translation' ? 'text-white/45' : srcColor}`}>
              {text}
            </div>
          ))}
        {translation ? (
          <RevealText
            text={translation}
            className={`animate-caption-in leading-snug transition-[color,opacity] duration-700 ${speaking ? 'opacity-60' : ''} ${showSource ? 'mt-0.5' : ''} ${
              mode === 'translation' ? `${large ? 'text-[18px]' : 'text-[15px]'} ${big ? 'text-white' : 'text-white/55'}` : `${trSize} ${trColor}`
            }`}
          />
        ) : (
          !speaking &&
          !skip && (
            <div className="mt-1 flex gap-1" aria-label="Translating">
              {[0, 1, 2].map((d) => (
                <span key={d} className="h-1 w-1 animate-pulse rounded-full bg-[#5EC8F2]/60" style={{ animationDelay: `${d * 150}ms` }} />
              ))}
            </div>
          )
        )}
        {term && (
          <div className={`mt-1 text-[12px] leading-snug ${big ? 'text-white/70' : 'text-white/40'}`}>
            <span className="font-semibold text-amber">{term.term}</span> — {term.termExplanation}
          </div>
        )}
      </div>
      {!speaking && (
        <button
          onClick={() => void invoke('capsule:ask', { line: text })}
          title="Ask AI what this means and what to answer"
          className={`flex h-fit flex-none items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-white shadow-[0_2px_10px_rgba(255,106,61,.35)] transition-opacity duration-150 hover:brightness-110 focus:opacity-100 group-hover/s:opacity-100 ${
            pinAsk ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <i className="ti ti-sparkles text-[11px]" /> Ask AI
        </button>
      )}
    </div>
  )
}

/**
 * Streamed translation text arrives in bursts of a few words. Reveal it at a
 * steady, fast pace (catches up within ~0.3 s) so it flows instead of jumping.
 * Never shows less than before; a replaced text that doesn't continue the
 * shown one appears at once.
 */
function RevealText({ text, className }: { text: string; className: string }) {
  const [shown, setShown] = useState(0)
  const target = useRef(text)
  const shownRef = useRef(0)
  const prevText = useRef(text)

  // A new version that doesn't continue what is on screen appears at once.
  useLayoutEffect(() => {
    const onScreen = prevText.current.slice(0, shownRef.current)
    if (!text.startsWith(onScreen)) {
      shownRef.current = text.length
      setShown(text.length)
    }
    target.current = text
    prevText.current = text
  }, [text])

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const step = (now: number) => {
      const dt = Math.min(50, now - last)
      last = now
      const goal = target.current.length
      const n = shownRef.current
      if (n < goal) {
        // ~90 chars/s, faster when far behind: catches up within ~0.3 s.
        const next = Math.min(goal, n + Math.max(1, Math.round(((goal - n) / 6 + 1.5) * (dt / 16))))
        shownRef.current = next
        setShown(next)
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [])

  return <div className={className}>{text.slice(0, Math.min(shown, text.length))}</div>
}

const CaptionLine = memo(CaptionLineView, (a, b) =>
  a.large === b.large &&
  a.mode === b.mode &&
  a.calm === b.calm &&
  a.newest === b.newest &&
  a.continued === b.continued &&
  a.hint === b.hint &&
  a.line.text === b.line.text &&
  a.line.final === b.line.final &&
  a.line.translation === b.line.translation &&
  JSON.stringify(a.line.parts) === JSON.stringify(b.line.parts) &&
  (a.line.parts ?? [{}]).every((_, i) => a.fresh.has(`${a.line.id}#${i}`) === b.fresh.has(`${b.line.id}#${i}`))
)

function CaptionLineView({
  line,
  large,
  mode,
  fresh,
  calm,
  hint,
  newest,
  continued = false
}: {
  line: CaptionLineData
  large: boolean
  mode: CaptionMode
  fresh: Set<string>
  /** Following the newest words: older sentences calm down. False while scrolled up. */
  calm: boolean
  hint: ReplyHint | null
  newest: boolean
  /** Same speaker as the line above: continue the block, no new label. */
  continued?: boolean
}) {
  // Your own lines: one quiet line on the right — you know what you said.
  if (line.speaker === 'me') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] truncate rounded-[10px] bg-white/[.05] px-2.5 py-1 text-[12px] text-white/45" title={line.text}>
          <span className="font-semibold text-[#9DB7FF]/70">You:</span> {line.text}
        </div>
      </div>
    )
  }
  const parts = line.parts?.length ? line.parts : [{ text: line.text, translation: line.translation, live: !line.final }]
  // Ask AI stays visible on the newest finished question (or newest sentence).
  const finished = parts.map((p, i) => ({ p, i })).filter(({ p }) => !(p.live && !line.final))
  const pinned = ([...finished].reverse().find(({ p }) => /\?\s*$/.test(p.text.trim())) ?? finished[finished.length - 1])?.i
  const lineFresh = parts.some((_, i) => fresh.has(`${line.id}#${i}`))
  return (
    <div
      className={`animate-caption-in border-l-2 pl-2.5 transition-colors duration-500 ${continued ? (large ? '-mt-3' : '-mt-2') : ''} ${
        lineFresh || !calm ? 'border-accent/70' : 'border-white/15'
      }`}
    >
      {!continued && (
        <div className={`mb-1 text-[10px] font-semibold uppercase tracking-[.12em] ${lineFresh || !calm ? 'text-accent-pale' : 'text-white/35'}`}>Client</div>
      )}
      <div className={`flex flex-col ${large ? 'gap-2.5' : 'gap-1.5'}`}>
        {parts.map((p, i) => (
          <Sentence
            key={i}
            text={p.text}
            translation={p.translation}
            skip={Boolean(p.skip)}
            speaking={Boolean(p.live) && !line.final}
            mode={mode}
            big={!calm || fresh.has(`${line.id}#${i}`)}
            large={large}
            hint={hint}
            pinAsk={newest && i === pinned}
          />
        ))}
      </div>
    </div>
  )
}

function QuestionCardView({ hint }: { hint: ReplyHint }) {
  const secs = hint.latencyMs ? (hint.latencyMs / 1000).toFixed(1) : null
  return (
    <div className="rounded-[12px] border border-accent/25 bg-accent/[.08] px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.1em] text-accent-pale">
        <i className="ti ti-help-circle text-[12px]" /> Client asked
        {secs && <span className="font-mono normal-case tracking-normal text-white/30" title="From the end of their sentence to this card">{secs}s</span>}
        <span className="ml-auto flex items-center gap-2 normal-case tracking-normal">
          {hint.open !== undefined && hint.open > 1 && <span className="text-white/40">{hint.open} open</span>}
          <button onClick={() => void invoke('capsule:quick', 'answered')} className="text-white/45 hover:text-green" title="Answered">
            <i className="ti ti-check text-[13px]" />
          </button>
          <button onClick={() => act('clearHint')} className="text-white/35 hover:text-white" title="Hide">
            <i className="ti ti-x text-[12px]" />
          </button>
        </span>
      </div>
      <div className="mt-1 line-clamp-3 text-[12px] leading-snug text-white/70">{hint.question}</div>
      {hint.translation && (
        <div className="mt-1 line-clamp-3 text-[13px] font-medium leading-snug text-white">{hint.translation}</div>
      )}
      {hint.term && hint.termExplanation && (
        <div className="mt-1.5 line-clamp-2 border-t border-white/[.07] pt-1.5 text-[11px] leading-snug text-white/60">
          <span className="font-semibold text-accent-pale">{hint.term}:</span> {hint.termExplanation}
        </div>
      )}
      {hint.answer && (
        <div className="mt-1.5 line-clamp-3 text-[11px] leading-snug text-white/55">
          <span className="font-semibold text-white/70">Mention:</span> {hint.answer}
        </div>
      )}
    </div>
  )
}

function RunCard({ run }: { run: AgentRun }) {
  const busy = run.status === 'starting' || run.status === 'running'
  return (
    <div className="rounded-[12px] border border-white/10 bg-white/[.04] px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-[10.5px]">
        {busy ? (
          <i className="ti ti-loader-2 animate-spin-slow text-[12px] text-accent" />
        ) : run.status === 'done' ? (
          <i className="ti ti-circle-check-filled text-[12px] text-green" />
        ) : (
          <i className="ti ti-alert-circle-filled text-[12px] text-red" />
        )}
        <span className="font-semibold uppercase tracking-[.08em] text-white/50">
          {run.agent} · {busy ? 'working' : run.status === 'done' ? 'done' : 'failed'}
        </span>
        <span className="ml-auto flex gap-2">
          {busy ? (
            <button onClick={() => act('cancelRun')} className="text-white/45 hover:text-red">
              Stop
            </button>
          ) : (
            <>
              <button onClick={() => act('open')} className="text-white/45 hover:text-white">
                Open
              </button>
              <button onClick={() => act('clearRun')} className="text-white/45 hover:text-white" title="Hide">
                <i className="ti ti-x text-[12px]" />
              </button>
            </>
          )}
        </span>
      </div>
      <div className="mt-1 line-clamp-1 text-[12px] font-medium text-white">{run.task}</div>
      {run.tail && <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-white/50">{run.tail}</div>}
    </div>
  )
}

function IconButton({ icon, title, onClick }: { icon: string; title: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={noDrag}
      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/[.08] text-white/80 hover:bg-white/[.16] hover:text-white active:scale-95"
    >
      <i className={`ti ti-${icon} text-[14px]`} />
    </button>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  // The window is sized to this content: measure it and report the height so
  // nothing is ever cut off. Solid fill and no outer shadow — on Windows,
  // blur or a shadow clipped by the transparent window shows as a grey box.
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const report = () => invoke('capsule:fit', Math.ceil(el.getBoundingClientRect().height) + 8).catch(() => {})
    const ro = new ResizeObserver(report)
    ro.observe(el)
    report()
    return () => ro.disconnect()
  }, [])

  return (
    <div className="w-screen select-none p-1">
      <div ref={ref} className="relative w-full overflow-hidden rounded-[20px] border border-white/[.09] bg-[#121317]">
        <div className="pointer-events-none absolute -left-12 -top-16 h-32 w-32 rounded-full bg-accent/30 blur-3xl" />
        <div className="relative">{children}</div>
      </div>
    </div>
  )
}

function AudioWave({ active }: { active: boolean }) {
  const bars = [5, 10, 7, 13, 9, 6, 11, 7]
  return (
    <div className="flex h-3.5 items-end gap-[2.5px]">
      {bars.map((h, i) => (
        <div
          key={i}
          className="w-[2.5px] rounded-full bg-accent"
          style={{
            height: active ? `${h}px` : '3px',
            transformOrigin: 'bottom',
            animation: active ? `wave 0.9s ease-in-out ${i * 0.09}s infinite` : 'none',
            transition: 'height 0.3s ease'
          }}
        />
      ))}
    </div>
  )
}
