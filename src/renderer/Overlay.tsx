import { useEffect, useState } from 'react'
import { invoke, subscribe } from './lib/ipc'
import { LogoMark } from './components/Logo'

// =============================================================================
// Capsule — the floating, always-on-top Minutama widget (transparent frameless
// window, pinned to the right edge). The main process owns its state
// (src/main/Capsule.ts) and resizes the window per mode:
//
//   prompt     a call app took the mic → "Call on Zoom · Start notes?"
//   recording  logo + live waves + timer, pause / stop, open notes
//              + optional reply hint ("They asked … → you could say …")
//              + optional "Call ended — stop notes?"
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

export default function Overlay() {
  const [cap, setCap] = useState<CapsuleState>({ mode: 'hidden', app: null, callEnded: false, hint: null })
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

  const act = (a: 'start' | 'dismiss' | 'open' | 'clearHint') => invoke('capsule:action', a).catch(console.error)

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
        <div className="flex items-center gap-3 px-3.5 h-full" style={drag}>
          <div className="relative flex-shrink-0">
            <LogoMark size={40} />
            <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-green ring-2 ring-[#15171C] animate-pulse-dot" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-white leading-tight">
              Call on {cap.app ?? 'your computer'}
            </div>
            <div className="text-[11.5px] text-white/55 mt-0.5">Take notes with Minutama?</div>
          </div>
          <div className="flex items-center gap-1.5" style={noDrag}>
            <button
              onClick={() => act('start')}
              className="btn-accent h-9 rounded-full px-3.5 text-[12.5px] font-semibold flex items-center gap-1.5 active:scale-95 transition-all"
            >
              <i className="ti ti-player-record-filled text-[13px]" /> Start
            </button>
            <button
              onClick={() => act('dismiss')}
              title="Not now"
              className="h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 text-white/70 flex items-center justify-center transition-all"
            >
              <i className="ti ti-x text-[15px]" />
            </button>
          </div>
        </div>
      </Shell>
    )
  }

  if (cap.mode !== 'recording') return null

  return (
    <Shell>
      <div className="flex h-full flex-col">
        {/* Main row */}
        <div className="flex items-center gap-2.5 px-3 h-[68px] flex-shrink-0" style={drag}>
          <button onClick={() => act('open')} style={noDrag} title="Open notes" className="flex-shrink-0">
            <LogoMark size={36} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${paused ? 'bg-amber' : 'bg-red animate-pulse-dot'}`} />
              <span className="font-mono text-white text-[17px] leading-none tracking-tight">{formatClock(durationMs)}</span>
            </div>
            <div className="mt-1.5">
              <AudioWave active={!paused} />
            </div>
          </div>
          <div className="flex items-center gap-1.5" style={noDrag}>
            <button
              onClick={togglePause}
              title={paused ? 'Resume' : 'Pause'}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all active:scale-95"
            >
              <i className={`ti ti-${paused ? 'player-play' : 'player-pause'} text-[16px]`} />
            </button>
            <button
              onClick={stop}
              title="Stop and write notes"
              className="w-9 h-9 rounded-full bg-red hover:bg-red/85 text-white flex items-center justify-center transition-all active:scale-95"
            >
              <i className="ti ti-player-stop-filled text-[15px]" />
            </button>
          </div>
        </div>

        {/* Call ended nudge */}
        {cap.callEnded && !cap.hint && (
          <div className="mx-3 -mt-1 mb-2 flex items-center gap-2 text-[11.5px] text-white/70" style={noDrag}>
            <i className="ti ti-phone-off text-[13px] text-accent-pale" />
            <span className="flex-1">Call ended — stop and write notes?</span>
            <button onClick={stop} className="font-semibold text-accent-pale hover:text-white">
              Stop
            </button>
          </div>
        )}

        {/* Reply hint */}
        {cap.hint && (
          <div className="mx-2.5 mb-2.5 flex-1 rounded-[14px] bg-white/[.07] border border-white/10 p-3 animate-fade-up" style={noDrag}>
            <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[.1em] text-accent-pale">
              <i className="ti ti-bulb text-[13px]" /> They asked
              <button onClick={() => act('clearHint')} className="ml-auto text-white/40 hover:text-white" title="Hide">
                <i className="ti ti-x text-[13px]" />
              </button>
            </div>
            <div className="mt-1 text-[12px] text-white/60 line-clamp-1">{cap.hint.question}</div>
            <div className="mt-2 text-[13.5px] leading-snug text-white line-clamp-4">“{cap.hint.answer}”</div>
          </div>
        )}
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen w-screen p-1 select-none">
      <div className="h-full w-full rounded-[22px] bg-[#15171C]/90 border border-white/10 shadow-[0_12px_40px_-12px_rgba(0,0,0,.6)] backdrop-blur-xl overflow-hidden relative">
        <div className="pointer-events-none absolute -left-10 -top-12 h-28 w-28 rounded-full bg-accent/35 blur-2xl" />
        <div className="relative h-full">{children}</div>
      </div>
    </div>
  )
}

function AudioWave({ active }: { active: boolean }) {
  const bars = [6, 12, 9, 16, 11, 7, 13, 8]
  return (
    <div className="flex items-end gap-[3px] h-4">
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
