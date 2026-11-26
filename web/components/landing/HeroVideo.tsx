'use client'

import { useEffect, useState } from 'react'
import { Icon } from './Icon'

// The hero "video": a video call with the Minutama capsule on top, playing by
// itself in a loop, frame by frame (requestAnimationFrame):
//   the client speaks → her words appear letter by letter → the Spanish
//   translation types in under them → on her question the Ask AI button
//   appears → the mouse moves to it and clicks → the answer explains Stripe
//   and what to say.
// Text never reflows while typing: the rest of each line is already laid out,
// just invisible. Lines enter and leave by smoothly opening / closing.

const EN_CPS = 0.026 // client speech, letters per ms
const TR_CPS = 0.07 // translation stream
const AN_CPS = 0.06 // AI answer

const LINES = [
  { start: 400, en: 'We need a booking site for our coffee shop,', es: 'Necesitamos un sitio de reservas para nuestra cafetería,' },
  { start: 3300, en: 'with online payments through Stripe.', es: 'con pagos online a través de Stripe.' },
  { start: 5700, en: 'Have you worked with Stripe before?', es: '¿Has trabajado antes con Stripe?', q: true }
].map((l) => {
  const enEnd = l.start + l.en.length / EN_CPS
  const trStart = enEnd + 220
  return { ...l, enEnd, trStart, trEnd: trStart + l.es.length / TR_CPS }
})

const Q = LINES[2]
const T_BUTTON = Q.trEnd - 150 // Ask AI appears
const T_CURSOR = T_BUTTON + 350 // the mouse comes in
const T_MOVE = T_CURSOR + 150 // … and glides to the button
const T_CLICK = T_MOVE + 950
const T_ANSWER = T_CLICK + 230
const LOOP_MS = 17000
const FADE_AT = LOOP_MS - 700

type Labels = { call: string; live: string; you: string; client: string; lang: string; ask: string }

/** Shows the first `n` letters; the rest keeps its place but is invisible. */
function Typed({ text, n }: { text: string; n: number }) {
  const k = Math.max(0, Math.min(text.length, Math.floor(n)))
  return (
    <>
      {text.slice(0, k)}
      <span className="invisible">{text.slice(k)}</span>
    </>
  )
}

/** Opens / closes smoothly (height + fade). */
function Reveal({ open, children, className = '' }: { open: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`grid transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(.4,0,.2,1)] ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'} ${className}`}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  )
}

export function HeroVideo({ labels, answer }: { labels: Labels; answer: string }) {
  const [t, setT] = useState(T_ANSWER + answer.length / AN_CPS + 500) // first paint: the full picture

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      setT((now - t0) % LOOP_MS)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const answerOn = t >= T_ANSWER
  // Which lines are in the capsule: the newest two; once the answer opens,
  // only the question (so everything fits).
  const visible = (i: number) => {
    const l = LINES[i]
    if (t < l.start) return false
    const newer = LINES.filter((x) => x.start <= t && x.start > l.start).length
    if (answerOn) return i === 2
    return newer < 2
  }
  const speaking = LINES.some((l) => t >= l.start && t < l.enEnd)
  const buttonOn = t >= T_BUTTON
  const cursorOn = t >= T_CURSOR && t < T_ANSWER + 1400
  const moved = t >= T_MOVE
  const pressed = t >= T_CLICK && t < T_CLICK + 180
  const clicked = t >= T_CLICK
  const fading = t >= FADE_AT
  const secs = 4 * 60 + 12 + Math.floor(t / 1000)

  return (
    <div className="glass-card relative aspect-square w-full overflow-hidden rounded-[22px] sm:aspect-video">
      {/* Call backdrop */}
      <div className="absolute inset-0 bg-[radial-gradient(520px_320px_at_30%_20%,rgba(255,106,61,.14),transparent_70%),linear-gradient(180deg,#15161B,#0E0F13)]" />

      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-3.5 py-2.5 text-[10px]">
        <span className="flex items-center gap-2 text-t-2">
          <span className="flex items-center gap-1 rounded bg-[#F2555A] px-1 py-px font-bold text-white">
            <span className="h-1.5 w-1.5 animate-blink rounded-full bg-white" /> {labels.live}
          </span>
          {labels.call}
        </span>
        <span className="font-mono text-t-3">
          {String(Math.floor(secs / 60)).padStart(2, '0')}:{String(secs % 60).padStart(2, '0')}
        </span>
      </div>

      {/* Client tile */}
      <div className="absolute inset-x-3.5 bottom-12 top-9 rounded-xl border border-white/[.06] bg-[#1A1B21]">
        <div className="absolute left-1/2 top-2.5 -translate-x-1/2">
          <span
            className={`flex h-10 w-10 items-center justify-center rounded-full bg-[linear-gradient(135deg,#FFB088,#FF6A3D)] font-display text-[13px] font-bold text-white transition-shadow duration-500 ${
              speaking ? 'shadow-[0_0_0_3px_rgba(34,197,94,.55),0_0_0_7px_rgba(34,197,94,.18)]' : 'shadow-[0_0_0_0_rgba(34,197,94,0)]'
            }`}
          >
            AW
          </span>
        </div>
        <div className="absolute left-2.5 top-2.5 rounded bg-black/40 px-1.5 py-px text-[10px] text-t-1">Anna Weber</div>
        <div className="absolute right-2.5 top-2.5 flex h-11 w-16 items-end rounded-md border border-white/10 bg-[#24252C] p-1 sm:h-12 sm:w-[76px]">
          <span className="rounded bg-black/40 px-1 text-[9px] text-t-2">{labels.you}</span>
        </div>
      </div>

      {/* Minutama capsule */}
      <div
        className={`absolute inset-x-5 bottom-[54px] rounded-xl border border-white/10 bg-[#0E0F13]/95 px-3 py-2.5 shadow-[0_20px_50px_-15px_rgba(0,0,0,.8)] backdrop-blur transition-opacity duration-700 sm:inset-x-8 ${
          fading ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <div className="mb-1 flex items-center justify-between text-[9px] font-semibold uppercase tracking-[.14em]">
          <span className="flex items-center gap-1.5 text-accent-pale">
            <span className="flex h-3.5 w-3.5 items-center justify-center rounded bg-accent text-[7px] text-white">M</span>
            {labels.client}
          </span>
          <span className="normal-case tracking-normal text-t-3">
            <b className="text-accent-hi">ES</b> · {labels.lang}
          </span>
        </div>

        {LINES.map((l, i) => (
          <Reveal key={l.start} open={visible(i)}>
            <div className="flex items-start gap-2 pb-1">
              {l.q && (
                <span className="mt-px flex h-3.5 w-3.5 flex-none items-center justify-center rounded-full bg-[#F5A524]/20 text-[9px] font-bold text-[#F5A524]">?</span>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-medium leading-snug text-t-1 sm:text-[12px]">
                  <Typed text={l.en} n={(t - l.start) * EN_CPS} />
                </div>
                <div className="text-[10.5px] leading-snug text-[#8FD8F7] sm:text-[11.5px]">
                  <Typed text={l.es} n={(t - l.trStart) * TR_CPS} />
                </div>
              </div>
              {l.q && (
                <span className="relative flex-none">
                  <span
                    className={`flex items-center gap-1 rounded-full bg-accent px-2 py-1 text-[9.5px] font-semibold text-white shadow-[0_2px_12px_rgba(255,106,61,.5)] transition-[opacity,transform] duration-300 ease-out ${
                      buttonOn ? 'opacity-100' : 'opacity-0'
                    } ${pressed ? 'scale-90' : buttonOn ? 'scale-100' : 'scale-75'} ${clicked ? 'ring-2 ring-accent/40' : ''}`}
                  >
                    <Icon name="sparkles" className="h-3 w-3" /> {labels.ask}
                  </span>
                  {/* Click ripple */}
                  {clicked && t < T_CLICK + 700 && (
                    <span className="ripple-once pointer-events-none absolute inset-0 rounded-full border-2 border-accent-pale" />
                  )}
                  {/* Mouse */}
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className={`pointer-events-none absolute left-1/2 top-1/2 z-10 h-5 w-5 drop-shadow-[0_2px_4px_rgba(0,0,0,.6)] transition-[transform,opacity] ease-[cubic-bezier(.45,.05,.25,1)] ${
                      cursorOn ? 'opacity-100' : 'opacity-0'
                    }`}
                    style={{
                      transform: `translate(${moved ? 2 : 70}px, ${moved ? 2 : 58}px) scale(${pressed ? 0.85 : 1})`,
                      transitionDuration: moved && !clicked ? '900ms' : '200ms'
                    }}
                  >
                    <path d="M5 3l14 7.5-6.2 1.7L10 18.5z" fill="#fff" stroke="#0B0C0F" strokeWidth="1.4" strokeLinejoin="round" />
                  </svg>
                </span>
              )}
            </div>
          </Reveal>
        ))}

        <Reveal open={answerOn}>
          <div className="mt-0.5 rounded-lg border border-accent/30 bg-accent/10 px-2.5 py-1.5 text-[10.5px] leading-snug text-t-1 sm:text-[11px]">
            <div className="mb-0.5 flex items-center gap-1 font-semibold text-accent-hi">
              <Icon name="sparkles" className="h-3 w-3" /> {labels.ask}
            </div>
            <Typed text={answer} n={(t - T_ANSWER - 250) * AN_CPS} />
          </div>
        </Reveal>
      </div>

      {/* Call controls */}
      <div className="absolute inset-x-0 bottom-2.5 flex items-center justify-center gap-2">
        {['mic', 'video', 'screen'].map((n) => (
          <span key={n} className="flex h-7 w-7 items-center justify-center rounded-full bg-white/[.08] text-t-2">
            <Icon name={n} className="h-3.5 w-3.5" />
          </span>
        ))}
        <span className="flex h-7 w-10 items-center justify-center rounded-full bg-[#F2555A] text-white">
          <Icon name="phone" className="h-3.5 w-3.5" />
        </span>
      </div>
    </div>
  )
}
