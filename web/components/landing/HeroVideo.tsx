'use client'

import { useEffect, useState } from 'react'
import { Icon } from './Icon'

// The hero "video": a call with the Minutama capsule on top. Press play and
// the client's words appear with the translation under them, then the Ask AI
// hint — the same thing the app shows during a real call.

const LINES = [
  { en: 'We need a booking site for our coffee shop,', tr: 'Necesitamos un sitio de reservas para nuestra cafetería,' },
  { en: 'with Stripe payments.', tr: 'con pagos por Stripe.' },
  { en: 'Could you send me a fixed price estimate by Friday?', tr: '¿Podrías enviarme un presupuesto de precio fijo antes del viernes?', q: true }
]

export function HeroVideo() {
  const [playing, setPlaying] = useState(false)
  const [step, setStep] = useState(0) // how many lines are shown (+1 = hint)

  useEffect(() => {
    if (!playing) return
    if (step > LINES.length) {
      const t = setTimeout(() => {
        setStep(0)
        setPlaying(false)
      }, 4500)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setStep((s) => s + 1), step === 0 ? 400 : 1700)
    return () => clearTimeout(t)
  }, [playing, step])

  // Like the capsule: the newest two lines.
  const shown = (playing ? LINES.slice(0, step) : LINES).slice(-2)
  const hint = playing ? step > LINES.length : true

  return (
    <div className="glass-card relative aspect-square w-full overflow-hidden rounded-[22px] sm:aspect-video">
      {/* Call window */}
      <div className="absolute inset-0 bg-[radial-gradient(500px_300px_at_70%_0%,rgba(255,106,61,.16),transparent_70%)]" />
      <div className="absolute left-4 top-4 flex items-center gap-2 text-[11px] text-t-3">
        <span className="h-2 w-2 animate-blink rounded-full bg-[#F2555A]" /> Client call · 12:04
      </div>
      <div className="absolute right-4 top-3.5 flex items-center gap-1.5 rounded-full bg-white/[.06] px-2.5 py-1 text-[11px] text-t-2">
        <span className="font-semibold text-accent-hi">ES</span> your language
      </div>

      {/* Capsule */}
      <div className="absolute inset-x-4 bottom-4 top-11 flex flex-col justify-end gap-2 overflow-hidden rounded-2xl border border-white/10 bg-[#121318]/90 p-4 sm:inset-x-5">
        <div className="text-[10px] font-semibold uppercase tracking-[.14em] text-accent-pale">Client</div>
        {shown.map((l) => (
          <div key={l.en} className="animate-rise">
            <div className="flex items-start gap-2">
              {l.q && <span className="mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full bg-[#F5A524]/20 text-[10px] font-bold text-[#F5A524]">?</span>}
              <div className="min-w-0">
                <div className="text-[13px] font-medium leading-snug text-t-1 sm:text-[14px]">{l.en}</div>
                <div className="mt-0.5 text-[12.5px] leading-snug text-[#8FD8F7] sm:text-[13.5px]">{l.tr}</div>
              </div>
            </div>
          </div>
        ))}
        {hint && (
          <div className="animate-rise mt-1 flex items-start gap-2 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-[12px] leading-snug text-t-1">
            <Icon name="sparkles" className="mt-0.5 h-3.5 w-3.5 flex-none text-accent-hi" />
            <span>
              <b className="text-accent-hi">Ask AI:</b> She wants a fixed price by Friday. Say: “Yes — I’ll send it Thursday.”
            </span>
          </div>
        )}
      </div>

      {/* Play */}
      {!playing && (
        <button
          onClick={() => {
            setStep(0)
            setPlaying(true)
          }}
          aria-label="Play the demo"
          className="group absolute inset-0 flex items-center justify-center bg-night/45 backdrop-blur-[1px] transition-colors hover:bg-night/35"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 text-night shadow-[0_10px_40px_-8px_rgba(255,106,61,.7)] transition-transform group-hover:scale-105">
            <Icon name="play" fill className="ml-1 h-7 w-7" />
          </span>
        </button>
      )}
    </div>
  )
}
