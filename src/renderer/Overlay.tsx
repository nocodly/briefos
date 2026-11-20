import { useEffect, useRef, useState } from 'react'
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
  callEnded: boolean
  hint: ReplyHint | null
  expanded: boolean
  agentRun: AgentRun | null
  notice: string | null
  large?: boolean
  live?: {
    lines: { id: string; speaker: 'me' | 'them'; text: string; translation: string | null; final: boolean }[]
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
            <div className="truncate text-[12.5px] font-semibold leading-tight text-white">Call on {cap.app ?? 'your computer'}</div>
            <div className="mt-0.5 text-[11px] text-white/50">Take notes?</div>
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

      {cap.expanded && <AgentPanel hint={cap.hint} run={cap.agentRun} notice={cap.notice} live={cap.live} large={Boolean(cap.large)} ask={cap.ask ?? null} />}
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
  ask
}: {
  hint: ReplyHint | null
  run: AgentRun | null
  notice: string | null
  live?: CapsuleState['live']
  large: boolean
  ask: AskState | null
}) {
  // During a call the capsule shows only the conversation: live captions with
  // translation, "Ask AI" on any line, and the client's question card. Tasks,
  // dates and agents are handled after the call, in the meeting notes.
  return (
    <div className="flex flex-col gap-2 border-t border-white/[.07] px-2.5 pb-2.5 pt-2" style={noDrag}>
      {/* Same tree whether the chat is open or not, so the captions never re-mount (and re-type). */}
      <div className={large ? 'flex gap-2' : 'flex flex-col gap-2'}>
        {live && live.status !== 'off' && (
          <div className="min-w-0 flex-1">
            <LiveCaptions live={live} large={large} compact={!large && Boolean(ask)} />
          </div>
        )}
        {ask && <AskPanel ask={ask} large={large && Boolean(live && live.status !== 'off')} />}
      </div>
      {hint && <QuestionCardView hint={hint} />}
      {notice && !hint && (
        <div className="flex items-center gap-1.5 px-0.5 text-[11px] text-white/45">
          <i className="ti ti-info-circle text-[12px] text-accent" /> {notice}
        </div>
      )}
      {run && <RunCard run={run} />}
    </div>
  )
}

function LiveCaptions({ live, large, compact = false }: { live: NonNullable<CapsuleState['live']>; large: boolean; compact?: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  const follow = useRef(true)
  const [following, setFollowing] = useState(true)
  const lines = live.lines

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
        className={`caption-scroll overflow-y-auto px-4 pb-4 pt-2 ${large ? 'h-[460px]' : compact ? 'h-[200px]' : 'h-[300px]'}`}
      >
        {lines.length === 0 ? (
          <div className="pt-2 text-[13px] text-white/35">Words appear here as people speak.</div>
        ) : (
          <div className={`flex flex-col ${large ? 'gap-5' : 'gap-3.5'}`}>
            {lines.map((l) => (
              <CaptionLine key={l.id} line={l} large={large} />
            ))}
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
      <div className="border-t border-white/[.06] px-4 py-1.5 text-[10.5px] text-white/35">
        AI transcription and translation can contain mistakes. Check important details yourself.
      </div>
    </div>
  )
}

/**
 * "Ask AI" mini chat: the picked line, the AI answer (streams in) and a box for
 * follow-up questions. Lives next to the captions so the call can go on.
 */
function AskPanel({ ask, large }: { ask: AskState; large: boolean }) {
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
      className={`flex flex-col rounded-[14px] border border-accent/30 bg-[#1A1210]/60 animate-caption-in ${
        large ? 'h-[503px] w-[300px] flex-none' : 'h-[240px]'
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

function CaptionLine({ line, large }: { line: CaptionLineData; large: boolean }) {
  const client = line.speaker !== 'me'
  return (
    <div className="group relative animate-caption-in">
      <div className="flex items-center gap-2">
        <div className={`text-[10px] font-semibold uppercase tracking-[.12em] ${client ? 'text-accent-pale' : 'text-[#9DB7FF]'}`}>
          {client ? 'Client' : 'You'}
        </div>
        {line.text.trim() && (
          <button
            onClick={() => void invoke('capsule:ask', { line: line.text })}
            title="Ask AI what this means and what to answer"
            className="ml-auto flex items-center gap-1 rounded-full border border-accent/40 bg-accent/15 px-2 py-0.5 text-[10.5px] font-semibold text-accent-pale opacity-0 transition-opacity duration-150 hover:bg-accent/30 focus:opacity-100 group-hover:opacity-100"
          >
            <i className="ti ti-sparkles text-[11px]" /> Ask AI
          </button>
        )}
      </div>
      <SmoothText
        text={line.text}
        typing={!line.final}
        className={`mt-1 leading-relaxed ${large ? 'text-[16px]' : 'text-[13px]'} ${client ? 'text-white/80' : 'text-white/90'}`}
      />
      {client && line.translation && (
        <div className={`mt-2 border-l-2 border-[#5EC8F2]/60 pl-3 ${large ? 'ml-1' : ''}`}>
          <SmoothText
            text={line.translation}
            typing={false}
            className={`font-medium leading-relaxed text-[#BFE9FF] ${large ? 'text-[18px]' : 'text-[14px]'}`}
          />
        </div>
      )}
    </div>
  )
}

/**
 * Writes the text out at a calm reading pace (about 22 letters a second) and
 * only speeds up when far behind, so the eyes can follow. The newest letters
 * glow orange and an orange caret leads while the line is still being spoken.
 */
function SmoothText({ text, typing, className }: { text: string; typing: boolean; className?: string }) {
  const [shown, setShown] = useState(0)
  const target = useRef(text)
  target.current = text

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let pos = 0
    const step = (now: number) => {
      const dt = Math.min(64, now - last)
      last = now
      const goal = target.current.length
      if (pos > goal) pos = goal
      const behind = goal - pos
      if (behind > 0) {
        // 22 letters/s; gently faster only when more than ~3 s behind.
        const speed = 0.022 + Math.max(0, behind - 66) * 0.0015
        pos = Math.min(goal, pos + speed * dt)
        setShown(Math.floor(pos))
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [])

  const visible = text.slice(0, shown)
  const writing = typing || shown < text.length
  // While writing, the newest letters glow orange; once done they settle.
  const settled = writing ? visible.slice(0, Math.max(0, visible.length - 4)) : visible
  const fresh = writing ? visible.slice(settled.length) : ''
  return (
    <div className={className}>
      {settled}
      {fresh && <span className="text-[#FFB59C]">{fresh}</span>}
      {writing && <span className="caption-caret" aria-hidden="true" />}
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
