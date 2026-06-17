import { useEffect, useState } from 'react'
import { invoke, subscribe } from './lib/ipc'

// =============================================================================
// Overlay — floating always-on-top recording widget (240x110 transparent
// frameless window). Live timer from recording:tick, audio wave, pulsing dot,
// pause/resume + stop wired to the recording:* channels. The window itself is
// created/closed by the main process (createOverlayWindow / closeOverlayWindow).
// =============================================================================

function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

export default function Overlay() {
  const [durationMs, setDurationMs] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    const unsub = subscribe('recording:tick', ({ durationMs: ms }) => setDurationMs(ms))
    // Sync initial state in case the widget mounts mid-recording.
    invoke<{ durationMs: number; paused: boolean }>('recording:status')
      .then((st) => {
        if (st) {
          setDurationMs(st.durationMs ?? 0)
          setPaused(Boolean(st.paused))
        }
      })
      .catch(() => {})
    return unsub
  }, [])

  const togglePause = async () => {
    try {
      if (paused) {
        await invoke('recording:resume')
        setPaused(false)
      } else {
        await invoke('recording:pause')
        setPaused(true)
      }
    } catch (err) {
      console.error('[overlay] pause/resume failed', err)
    }
  }

  const stop = async () => {
    try {
      await invoke('recording:stop')
    } catch (err) {
      console.error('[overlay] stop failed', err)
    }
  }

  return (
    <div
      className="h-screen w-screen flex items-center px-3.5 gap-3 bg-blue-deep/95 rounded-[18px] border border-white/10 shadow-2xl backdrop-blur-md select-none"
      style={{ WebkitAppRegion: 'drag' } as unknown as React.CSSProperties}
    >
      {/* Recording status dot */}
      <div className="flex flex-col items-center gap-1.5">
        <span
          className={`w-3 h-3 rounded-full ${paused ? 'bg-amber' : 'bg-red animate-pulse-dot'}`}
        />
      </div>

      {/* Timer + wave */}
      <div className="flex-1">
        <div className="font-mono text-white text-[20px] leading-none tracking-tight">
          {formatClock(durationMs)}
        </div>
        <div className="mt-1.5">
          <AudioWave active={!paused} />
        </div>
      </div>

      {/* Controls (not draggable) */}
      <div
        className="flex items-center gap-1.5"
        style={{ WebkitAppRegion: 'no-drag' } as unknown as React.CSSProperties}
      >
        <button
          onClick={togglePause}
          title={paused ? 'Resume' : 'Pause'}
          className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all active:scale-95"
        >
          <i className={`ti ti-${paused ? 'player-play' : 'player-pause'} text-[16px]`} />
        </button>
        <button
          onClick={stop}
          title="Stop recording"
          className="w-9 h-9 rounded-full bg-red hover:bg-red/85 text-white flex items-center justify-center transition-all active:scale-95"
        >
          <i className="ti ti-player-stop-filled text-[16px]" />
        </button>
      </div>
    </div>
  )
}

function AudioWave({ active }: { active: boolean }) {
  const bars = [8, 14, 10, 18, 12, 7]
  return (
    <div className="flex items-end gap-0.5 h-5">
      {bars.map((h, i) => (
        <div
          key={i}
          className="w-[3px] rounded-sm bg-[#7CB9FF]"
          style={{
            height: active ? `${h}px` : '4px',
            transformOrigin: 'bottom',
            animation: active ? `wave 0.8s ease-in-out ${i * 0.1}s infinite` : 'none',
            transition: 'height 0.3s ease'
          }}
        />
      ))}
    </div>
  )
}
