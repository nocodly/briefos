import { useEffect, useRef, useState } from 'react'
import { invoke, subscribe } from './lib/ipc'
import { LogoMark } from './components/Logo'

// =============================================================================
// Capsule — the floating, always-on-top Minutama widget (transparent frameless
// window pinned to the right edge). The main process owns its state
// (src/main/Capsule.ts) and resizes the window per mode:
//
//   prompt     a call app took the mic → "Call on Zoom · Take notes?"
//   recording  logo + timer + waves + pause/stop, and the agent panel:
//              live reply hint ("They asked … → you could say …") and a task
//              box ("Tell your agent…" → save to notes / send to agent).
//              Collapsible to the compact bar.
// =============================================================================

interface ReplyHint {
  id: string
  question: string
  answer: string
}
interface CapsuleState {
  mode: 'hidden' | 'prompt' | 'recording'
  app: string | null
  callEnded: boolean
  hint: ReplyHint | null
  expanded: boolean
}

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

type Action = 'start' | 'dismiss' | 'open' | 'clearHint' | 'toggle'

export default function Overlay() {
  const [cap, setCap] = useState<CapsuleState>({
    mode: 'hidden',
    app: null,
    callEnded: false,
    hint: null,
    expanded: true
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

  const act = (a: Action) => invoke('capsule:action', a).catch(console.error)

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
        <div className="flex h-[84px] items-center gap-3 px-4" style={drag}>
          <div className="relative flex-shrink-0">
            <LogoMark size={42} />
            <span className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full bg-green ring-[3px] ring-[#121317] animate-pulse-dot" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-semibold leading-tight text-white">
              Call on {cap.app ?? 'your computer'}
            </div>
            <div className="mt-0.5 text-[12px] text-white/50">Take notes with Minutama?</div>
          </div>
          <div className="flex items-center gap-1.5" style={noDrag}>
            <button
              onClick={() => act('start')}
              className="btn-accent flex h-9 items-center gap-1.5 rounded-full px-4 text-[12.5px] font-semibold transition-all duration-200 active:scale-95"
            >
              <i className="ti ti-player-record-filled text-[12px]" /> Start
            </button>
            <IconButton icon="x" title="Not now" onClick={() => act('dismiss')} />
          </div>
        </div>
      </Shell>
    )
  }

  if (cap.mode !== 'recording') return null

  return (
    <Shell>
      <div className="flex flex-col">
        {/* Bar */}
        <div className="flex h-[68px] flex-shrink-0 items-center gap-3 px-3.5" style={drag}>
          <button onClick={() => act('open')} style={noDrag} title="Open notes" className="flex-shrink-0 transition-transform duration-200 hover:scale-105">
            <LogoMark size={38} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${paused ? 'bg-amber' : 'bg-red animate-pulse-dot'}`} />
              <span className="font-mono text-[17px] leading-none tracking-tight text-white">{formatClock(durationMs)}</span>
            </div>
            <div className="mt-2">
              <AudioWave active={!paused} />
            </div>
          </div>
          <div className="flex items-center gap-1.5" style={noDrag}>
            <IconButton icon={paused ? 'player-play' : 'player-pause'} title={paused ? 'Resume' : 'Pause'} onClick={togglePause} />
            <button
              onClick={stop}
              title="Stop and write notes"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-red text-white transition-all duration-200 hover:bg-red/85 active:scale-95"
            >
              <i className="ti ti-player-stop-filled text-[14px]" />
            </button>
            <IconButton
              icon={cap.expanded ? 'chevron-up' : 'sparkles'}
              title={cap.expanded ? 'Hide agent' : 'Show agent'}
              onClick={() => act('toggle')}
            />
          </div>
        </div>

        {cap.callEnded && (
          <div className="mx-3.5 mb-2 flex h-[26px] items-center gap-2 text-[11.5px] text-white/65" style={noDrag}>
            <i className="ti ti-phone-off text-[13px] text-accent-pale" />
            <span className="flex-1">Call ended — stop and write notes?</span>
            <button onClick={stop} className="font-semibold text-accent-pale transition-colors hover:text-white">
              Stop
            </button>
          </div>
        )}

        {cap.expanded && <AgentPanel hint={cap.hint} onClearHint={() => act('clearHint')} />}
      </div>
    </Shell>
  )
}

// ─── Agent panel: reply hint + task box ─────────────────────────────────────

function AgentPanel({ hint, onClearHint }: { hint: ReplyHint | null; onClearHint: () => void }) {
  const [text, setText] = useState('')
  const [flash, setFlash] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const submit = async (send: boolean) => {
    const t = text.trim()
    if (!t) return
    try {
      await invoke('capsule:task', { text: t, send })
      setText('')
      setFlash(send ? 'Opened in Minutama — review and send' : 'Saved to your notes ✓')
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setFlash(null), 2500)
    } catch (err) {
      setFlash((err as Error).message)
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-white/[.07] px-3 pb-3 pt-2.5" style={noDrag}>
      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[.12em] text-white/40">
        <i className="ti ti-sparkles text-[12px] text-accent" /> Agent
      </div>

      {hint ? (
        <div className="rounded-[14px] border border-accent/25 bg-accent/[.08] p-3">
          <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[.1em] text-accent-pale">
            <i className="ti ti-bulb text-[13px]" /> They asked
            <button onClick={onClearHint} className="ml-auto text-white/35 transition-colors hover:text-white" title="Hide">
              <i className="ti ti-x text-[13px]" />
            </button>
          </div>
          <div className="mt-1 line-clamp-1 text-[12px] text-white/55">{hint.question}</div>
          <div className="mt-2 line-clamp-4 text-[13.5px] leading-snug text-white">“{hint.answer}”</div>
        </div>
      ) : (
        <div className="rounded-[14px] border border-white/[.06] bg-white/[.03] px-3 py-2.5 text-[11.5px] leading-snug text-white/40">
          <i className="ti ti-ear text-[13px] text-white/50" /> Listening. When someone asks you something, a suggested answer appears here.
        </div>
      )}

      <div className="flex items-center gap-1.5 rounded-[14px] border border-white/10 bg-white/[.05] p-1.5 pl-3 transition-colors focus-within:border-accent/50">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit(e.ctrlKey || e.metaKey)
          }}
          placeholder={flash ?? 'Tell your agent… e.g. “send Anna the deck”'}
          className="min-w-0 flex-1 bg-transparent text-[12.5px] text-white outline-none placeholder:text-white/35"
        />
        <button
          onClick={() => void submit(false)}
          disabled={!text.trim()}
          title="Save as a task in your notes (Enter)"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-white/60 transition-all hover:bg-white/10 hover:text-white disabled:opacity-30"
        >
          <i className="ti ti-checkbox text-[15px]" />
        </button>
        <button
          onClick={() => void submit(true)}
          disabled={!text.trim()}
          title="Send to Claude Code / Codex (Ctrl+Enter)"
          className="btn-accent flex h-7 items-center gap-1 rounded-lg px-2 text-[11.5px] font-semibold transition-all disabled:opacity-30"
        >
          <i className="ti ti-send text-[13px]" /> Agent
        </button>
      </div>
    </div>
  )
}

function IconButton({ icon, title, onClick }: { icon: string; title: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[.08] text-white/80 transition-all duration-200 hover:bg-white/[.16] hover:text-white active:scale-95"
    >
      <i className={`ti ti-${icon} text-[15px]`} />
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
      <div ref={ref} className="relative w-full overflow-hidden rounded-[24px] border border-white/[.09] bg-[#121317]">
        <div className="pointer-events-none absolute -left-12 -top-16 h-36 w-36 rounded-full bg-accent/30 blur-3xl" />
        <div className="relative">{children}</div>
      </div>
    </div>
  )
}

function AudioWave({ active }: { active: boolean }) {
  const bars = [6, 12, 9, 16, 11, 7, 13, 8, 10]
  return (
    <div className="flex h-4 items-end gap-[3px]">
      {bars.map((h, i) => (
        <div
          key={i}
          className="w-[3px] rounded-full bg-accent"
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
