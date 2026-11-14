import { useEffect, useRef, useState } from 'react'
import { invoke, subscribe } from './lib/ipc'
import { LogoMark } from './components/Logo'

// =============================================================================
// Capsule — the floating, always-on-top Minutama widget, fixed at the right
// edge of the screen (not draggable). The main process owns its state
// (src/main/Capsule.ts); the window height follows this content (capsule:fit).
//
//   prompt     a call app took the mic → "Call on Zoom · Take notes?"
//   recording  compact bar (logo, timer, waves, pause/stop, agent toggle) and
//              the agent panel:
//                - live reply hint ("They asked … → you could say …")
//                - task box → ✓ save to notes / ✦ send to your agent
//                - send asks to confirm, then shows the agent working and the
//                  result right here — no need to open the main window.
// =============================================================================

interface ReplyHint {
  id: string
  question: string
  answer: string
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
}

type Action = 'start' | 'dismiss' | 'open' | 'clearHint' | 'toggle' | 'clearRun' | 'cancelRun'

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
    agentRun: null
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
        <div className="flex h-[66px] items-center gap-2.5 px-3">
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
            className="btn-accent flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[12px] font-semibold active:scale-95"
          >
            <i className="ti ti-player-record-filled text-[11px]" /> Start
          </button>
          <IconButton icon="x" title="Not now" onClick={() => act('dismiss')} />
        </div>
      </Shell>
    )
  }

  if (cap.mode !== 'recording') return null

  return (
    <Shell>
      {/* Bar */}
      <div className="flex h-[56px] items-center gap-2.5 px-2.5">
        <button onClick={() => act('open')} title="Open notes" className="flex-shrink-0 hover:scale-105">
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
          className="flex h-8 w-8 items-center justify-center rounded-full bg-red text-white hover:bg-red/85 active:scale-95"
        >
          <i className="ti ti-player-stop-filled text-[13px]" />
        </button>
        <IconButton
          icon={cap.expanded ? 'chevron-up' : 'sparkles'}
          title={cap.expanded ? 'Hide agent' : 'Show agent'}
          onClick={() => act('toggle')}
        />
      </div>

      {cap.callEnded && (
        <div className="mx-3 mb-2 flex items-center gap-2 text-[11px] text-white/65">
          <i className="ti ti-phone-off text-[12px] text-accent-pale" />
          <span className="flex-1">Call ended — stop and write notes?</span>
          <button onClick={stop} className="font-semibold text-accent-pale hover:text-white">
            Stop
          </button>
        </div>
      )}

      {cap.expanded && <AgentPanel hint={cap.hint} run={cap.agentRun} />}
    </Shell>
  )
}

// ─── Agent panel ────────────────────────────────────────────────────────────

function AgentPanel({ hint, run }: { hint: ReplyHint | null; run: AgentRun | null }) {
  const [text, setText] = useState('')
  const [confirm, setConfirm] = useState<string | null>(null)
  const [agentName, setAgentName] = useState('Claude Code')
  const [flash, setFlash] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    invoke<string>('settings:get', 'agentProvider')
      .then((v) => setAgentName(v === 'codex' ? 'Codex' : 'Claude Code'))
      .catch(() => {})
  }, [])

  const say = (msg: string) => {
    setFlash(msg)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setFlash(null), 2500)
  }

  const save = async () => {
    const t = text.trim()
    if (!t) return
    await invoke('capsule:task', { text: t, send: false }).catch(() => {})
    setText('')
    say('Saved to your notes ✓')
  }

  const send = async (task: string) => {
    setConfirm(null)
    await invoke('capsule:task', { text: task, send: true }).catch((e) => say((e as Error).message))
  }

  return (
    <div className="flex flex-col gap-2 border-t border-white/[.07] px-2.5 pb-2.5 pt-2">
      {hint ? (
        <div className="rounded-[12px] border border-accent/25 bg-accent/[.08] px-2.5 py-2">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.1em] text-accent-pale">
            <i className="ti ti-bulb text-[12px]" /> They asked
            <button onClick={() => act('clearHint')} className="ml-auto text-white/35 hover:text-white" title="Hide">
              <i className="ti ti-x text-[12px]" />
            </button>
          </div>
          <div className="mt-0.5 line-clamp-1 text-[11.5px] text-white/55">{hint.question}</div>
          <div className="mt-1 line-clamp-4 text-[12.5px] leading-snug text-white">“{hint.answer}”</div>
        </div>
      ) : (
        !run &&
        !confirm && (
          <div className="flex items-center gap-1.5 px-0.5 text-[11px] text-white/40">
            <i className="ti ti-sparkles text-[12px] text-accent" /> Listening for questions…
          </div>
        )
      )}

      {run && !confirm && <RunCard run={run} />}

      {confirm !== null ? (
        <div className="rounded-[12px] border border-white/10 bg-white/[.05] p-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[.1em] text-white/45">Send to {agentName}?</div>
          <div className="mt-1 line-clamp-3 text-[12.5px] leading-snug text-white">{confirm}</div>
          <div className="mt-1 text-[10.5px] text-white/40">With this meeting’s notes and transcript.</div>
          <div className="mt-2 flex justify-end gap-1.5">
            <button
              onClick={() => {
                setText(confirm)
                setConfirm(null)
              }}
              className="rounded-lg px-2.5 py-1 text-[11.5px] text-white/60 hover:bg-white/10 hover:text-white"
            >
              Cancel
            </button>
            <button onClick={() => void send(confirm)} className="btn-accent flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11.5px] font-semibold">
              <i className="ti ti-send text-[12px]" /> Send
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1 rounded-[12px] border border-white/10 bg-white/[.05] p-1 pl-2.5 focus-within:border-accent/50">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || !text.trim()) return
              if (e.ctrlKey || e.metaKey) {
                setConfirm(text.trim())
                setText('')
              } else void save()
            }}
            placeholder={flash ?? 'Tell your agent…'}
            className="min-w-0 flex-1 bg-transparent text-[12px] text-white outline-none placeholder:text-white/35"
          />
          <button
            onClick={() => void save()}
            disabled={!text.trim()}
            title="Save as a task in your notes (Enter)"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-30"
          >
            <i className="ti ti-checkbox text-[14px]" />
          </button>
          <button
            onClick={() => {
              setConfirm(text.trim())
              setText('')
            }}
            disabled={!text.trim()}
            title={`Send to ${agentName} (Ctrl+Enter)`}
            className="btn-accent flex h-7 w-7 items-center justify-center rounded-lg disabled:opacity-30"
          >
            <i className="ti ti-send text-[13px]" />
          </button>
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
