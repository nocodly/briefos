'use client'

import { useEffect, useState } from 'react'
import { Icon } from './Icon'

// The hero "video": a video call with the Minutama capsule on top, playing by
// itself in a loop. The client speaks (words appear as they are heard), the
// Spanish translation follows, a tech term gets a one-line hint, the question
// gets an Ask AI answer — what the app really shows during a call.

const LINES = [
  { start: 600, en: 'We need a booking site for our coffee shop,', es: 'Necesitamos un sitio de reservas para nuestra cafetería,' },
  { start: 3600, en: 'with online payments through Stripe.', es: 'con pagos online a través de Stripe.', term: 5900 },
  { start: 7000, en: 'Could you send me a fixed price estimate by Friday?', es: '¿Podrías enviarme un presupuesto de precio fijo antes del viernes?', ask: 10100 }
]
const WORD_MS = 220
const LOOP_MS = 15500

type Labels = { call: string; live: string; you: string; client: string; lang: string; ask: string }

export function HeroVideo({ labels, termLine, answer }: { labels: Labels; termLine: string; answer: string }) {
  const [t, setT] = useState(12500) // first paint: the full picture

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t0 = performance.now()
    const id = setInterval(() => setT((performance.now() - t0) % LOOP_MS), 80)
    return () => clearInterval(id)
  }, [])

  const words = (l: (typeof LINES)[number]) => l.en.split(' ')
  const ends = (l: (typeof LINES)[number]) => l.start + words(l).length * WORD_MS
  const started = LINES.filter((l) => t >= l.start)
  const shown = started.slice(-2) // like the capsule: the newest two lines
  const speaking = started.some((l) => t < ends(l))
  const termOn = t >= (LINES[1].term ?? 0) && t < LINES[2].start + 400
  const asking = t >= (LINES[2].ask ?? 0)
  const answerOn = t >= (LINES[2].ask ?? 0) + 800
  const fading = t > LOOP_MS - 500
  const secs = 4 * 60 + 12 + Math.floor(t / 1000)

  return (
    <div className="glass-card relative aspect-square w-full overflow-hidden rounded-[22px] sm:aspect-video">
      {/* Call backdrop */}
      <div className="absolute inset-0 bg-[radial-gradient(520px_320px_at_30%_20%,rgba(255,106,61,.14),transparent_70%),linear-gradient(180deg,#15161B,#0E0F13)]" />

      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 py-3 text-[11px]">
        <span className="flex items-center gap-2 text-t-2">
          <span className="flex items-center gap-1 rounded bg-[#F2555A] px-1.5 py-0.5 font-bold text-white">
            <span className="h-1.5 w-1.5 animate-blink rounded-full bg-white" /> {labels.live}
          </span>
          {labels.call}
        </span>
        <span className="font-mono text-t-3">
          {String(Math.floor(secs / 60)).padStart(2, '0')}:{String(secs % 60).padStart(2, '0')}
        </span>
      </div>

      {/* Client tile */}
      <div className="absolute inset-x-4 bottom-14 top-10 rounded-2xl border border-white/[.06] bg-[#1A1B21]">
        <div className="absolute left-1/2 top-[7%] -translate-x-1/2 sm:top-3">
          <span
            className={`flex h-14 w-14 items-center justify-center rounded-full bg-[linear-gradient(135deg,#FFB088,#FF6A3D)] font-display text-[18px] font-bold text-white transition-shadow duration-300 sm:h-12 sm:w-12 sm:text-[16px] ${
              speaking ? 'shadow-[0_0_0_4px_rgba(34,197,94,.55),0_0_0_9px_rgba(34,197,94,.18)]' : ''
            }`}
          >
            AW
          </span>
        </div>
        <div className="absolute left-3 top-3 rounded-md bg-black/40 px-2 py-0.5 text-[11px] text-t-1">Anna Weber</div>
        {/* You */}
        <div className="absolute right-3 top-3 flex h-14 w-20 items-end rounded-lg border border-white/10 bg-[#24252C] p-1.5 sm:h-16 sm:w-24">
          <span className="rounded bg-black/40 px-1.5 text-[10px] text-t-2">{labels.you}</span>
        </div>
      </div>

      {/* Minutama capsule */}
      <div
        className={`absolute inset-x-6 bottom-[60px] rounded-2xl border border-white/10 bg-[#0E0F13]/95 p-3 shadow-[0_20px_50px_-15px_rgba(0,0,0,.8)] backdrop-blur transition-opacity duration-500 sm:inset-x-10 ${
          fading ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[.14em]">
          <span className="flex items-center gap-1.5 text-accent-pale">
            <span className="flex h-3.5 w-3.5 items-center justify-center rounded bg-accent text-[7px] text-white">M</span>
            {labels.client}
          </span>
          <span className="normal-case tracking-normal text-t-3">
            <b className="text-accent-hi">ES</b> · {labels.lang}
          </span>
        </div>
        <div className="space-y-1.5">
          {shown.map((l) => {
            const n = Math.min(words(l).length, Math.max(1, Math.floor((t - l.start) / WORD_MS) + 1))
            const trOn = t >= ends(l) + 400
            return (
              <div key={l.start} className="flex items-start gap-2">
                {l.ask && (
                  <span className="mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full bg-[#F5A524]/20 text-[10px] font-bold text-[#F5A524]">?</span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-medium leading-snug text-t-1 sm:text-[13.5px]">{words(l).slice(0, n).join(' ')}</div>
                  <div
                    className={`text-[12px] leading-snug text-[#8FD8F7] transition-opacity duration-500 sm:text-[13px] ${trOn ? 'opacity-100' : 'opacity-0'}`}
                  >
                    {l.es}
                  </div>
                </div>
                {l.ask && asking && (
                  <span className="flex flex-none animate-rise items-center gap-1 rounded-full bg-accent px-2 py-1 text-[10.5px] font-semibold text-white shadow-[0_2px_12px_rgba(255,106,61,.5)]">
                    <Icon name="sparkles" className="h-3 w-3" /> {labels.ask}
                  </span>
                )}
              </div>
            )
          })}
        </div>
        {termOn && (
          <div className="mt-1.5 animate-rise text-[11.5px] text-t-2">
            <b className="text-[#F5A524]">Stripe</b> — {termLine}
          </div>
        )}
        {answerOn && (
          <div className="mt-2 flex animate-rise items-start gap-2 rounded-xl border border-accent/30 bg-accent/10 px-2.5 py-1.5 text-[11.5px] leading-snug text-t-1">
            <Icon name="sparkles" className="mt-0.5 h-3 w-3 flex-none text-accent-hi" />
            <span>{answer}</span>
          </div>
        )}
      </div>

      {/* Call controls */}
      <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-2.5">
        {['mic', 'video', 'screen'].map((n) => (
          <span key={n} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[.08] text-t-2">
            <Icon name={n} className="h-4 w-4" />
          </span>
        ))}
        <span className="flex h-8 w-11 items-center justify-center rounded-full bg-[#F2555A] text-white">
          <Icon name="phone" className="h-4 w-4" />
        </span>
      </div>
    </div>
  )
}
