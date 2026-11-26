'use client'

import { lettersOf, useLoop } from './useLoop'

// Hero picture, one idea at a glance: what the client says (English, with a
// voice wave) → Minutama → what you see (big, in your language, typing in)
// plus a short hint. Every few seconds the line and the language change.

const PAIRS = [
  {
    en: 'Could you send the estimate by Friday?',
    code: 'ES',
    lang: 'Español',
    tr: '¿Podrías enviar el presupuesto antes del viernes?',
    hint: 'Di: “Yes — I’ll send it on Thursday.”'
  },
  {
    en: 'What’s your rate for the MVP?',
    code: 'UK',
    lang: 'Українська',
    tr: 'Яка ваша ставка за MVP?',
    hint: 'Скажи: “$2,000 fixed, paid per milestone.”'
  },
  {
    en: 'Have you worked with Stripe before?',
    code: 'PT',
    lang: 'Português',
    tr: 'Você já trabalhou com Stripe?',
    hint: 'Stripe — pagamentos online. Diga: “Yes, I’ve built Stripe Checkout.”'
  },
  {
    en: 'Can you start next Monday?',
    code: 'HI',
    lang: 'हिन्दी',
    tr: 'क्या आप अगले सोमवार से शुरू कर सकते हैं?',
    hint: 'कहें: “Yes, Monday works for me.”'
  }
]

// On the Spanish site every line is shown in Spanish.
const PAIRS_ES = [
  { en: PAIRS[0].en, code: 'ES', lang: 'Español', tr: PAIRS[0].tr, hint: PAIRS[0].hint },
  { en: PAIRS[1].en, code: 'ES', lang: 'Español', tr: '¿Cuál es tu tarifa para el MVP?', hint: 'Di: “$2,000 fixed, paid per milestone.”' },
  { en: PAIRS[2].en, code: 'ES', lang: 'Español', tr: '¿Has trabajado antes con Stripe?', hint: 'Stripe — pagos online. Di: “Yes, I’ve built Stripe Checkout.”' },
  { en: PAIRS[3].en, code: 'ES', lang: 'Español', tr: '¿Puedes empezar el próximo lunes?', hint: 'Di: “Yes, Monday works for me.”' }
]

const STEP = 6200
const SPEAK = 1700 // the client talks (wave on, English typing)
const ARROW = SPEAK + 100
const TYPE = SPEAK + 450 // translation starts
const HINT = 3700
const OUT = STEP - 450 // crossfade to the next pair

const ease = 'cubic-bezier(.4,0,.2,1)'
const BARS = [0.35, 0.7, 1, 0.55, 0.85, 0.45, 0.95, 0.6, 0.8, 0.4, 0.7, 0.5]

export function HeroSplit({ clientSays, youSee, spanishOnly = false }: { clientSays: string; youSee: string; spanishOnly?: boolean }) {
  const list = spanishOnly ? PAIRS_ES : PAIRS
  const { ref, t } = useLoop(STEP * list.length, 5200)
  const p = list[Math.floor(t / STEP) % list.length]
  const local = t % STEP
  const speaking = local < SPEAK
  const shown = local < OUT
  const [en, enRest] = lettersOf(p.en, (local / SPEAK) * p.en.length * 1.05)
  const [tr, trRest] = lettersOf(p.tr, (local - TYPE) * 0.032)
  const [hint, hintRest] = lettersOf(p.hint, (local - HINT - 150) * 0.05)
  const fade = { opacity: shown ? 1 : 0, transition: `opacity .45s ${ease}` }

  return (
    <div ref={ref} className="relative grid items-stretch gap-3 sm:grid-cols-[1fr_auto_1.15fr] sm:gap-4">
      {/* What the client says */}
      <div className="glass-card flex flex-col rounded-[20px] p-4 sm:p-5">
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[linear-gradient(135deg,#FFB088,#FF6A3D)] text-[11px] font-bold text-white"
            style={{
              boxShadow: speaking ? '0 0 0 3px rgba(34,197,94,.5), 0 0 0 8px rgba(34,197,94,.15)' : '0 0 0 0 rgba(34,197,94,0)',
              transition: `box-shadow .5s ${ease}`
            }}
          >
            CL
          </span>
          <div className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-[.12em] text-t-3">{clientSays}</div>
          <span className="ml-auto rounded bg-white/[.08] px-1.5 py-0.5 text-[10px] font-bold text-t-2">EN</span>
        </div>
        <div className="mt-3 min-h-[2.8em] font-display text-[17px] font-bold leading-snug text-t-1 sm:text-[19px]" style={fade}>
          {en}
          <span className="invisible">{enRest}</span>
        </div>
        {/* Voice wave */}
        <div className="mt-auto flex h-6 items-end gap-[3px] pt-3">
          {BARS.map((h, i) => (
            <span
              key={i}
              className="w-[4px] origin-bottom rounded-full bg-[#22C55E]"
              style={{
                height: `${h * 100}%`,
                opacity: speaking ? 0.85 : 0.18,
                transform: speaking ? undefined : 'scaleY(.25)',
                animation: speaking ? `hero-bar ${0.7 + (i % 4) * 0.15}s ease-in-out ${i * 60}ms infinite` : 'none',
                transition: `opacity .5s ${ease}, transform .5s ${ease}`
              }}
            />
          ))}
        </div>
      </div>

      {/* Minutama in between */}
      <div className="flex items-center justify-center">
        <div className="flex items-center gap-1.5 sm:flex-col">
          <span className="hidden h-px w-6 bg-white/15 sm:block sm:h-6 sm:w-px" />
          <span
            className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-accent"
            style={{
              boxShadow: local >= ARROW && local < TYPE + 500 ? '0 0 0 8px rgba(255,106,61,.18), 0 12px 34px -6px rgba(255,106,61,.8)' : '0 10px 28px -8px rgba(255,106,61,.6)',
              transform: local >= ARROW && local < TYPE + 500 ? 'scale(1.08)' : 'scale(1)',
              transition: `box-shadow .5s ${ease}, transform .5s ${ease}`
            }}
          >
            <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden="true">
              <rect x="7" y="9" width="3.4" height="14" rx="1.7" fill="#fff" />
              <rect x="12.2" y="13" width="3.4" height="8" rx="1.7" fill="#fff" />
              <rect x="16.4" y="13" width="3.4" height="8" rx="1.7" fill="#fff" />
              <rect x="21.6" y="9" width="3.4" height="14" rx="1.7" fill="#fff" />
            </svg>
          </span>
          <svg viewBox="0 0 24 24" className="h-5 w-5 rotate-90 text-accent-hi sm:rotate-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14 M13 6l6 6-6 6" />
          </svg>
        </div>
      </div>

      {/* What you see */}
      <div className="flex flex-col rounded-[20px] border border-accent/35 bg-accent/[.07] p-4 shadow-[0_20px_60px_-30px_rgba(255,106,61,.6)] sm:p-5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[.14em] text-accent-pale">{youSee}</span>
          <span className="ml-auto rounded-md bg-accent/20 px-1.5 py-0.5 text-[10px] font-bold text-accent-hi" style={fade}>
            {p.code}
          </span>
          <span className="text-[11px] text-t-3" style={fade}>
            {p.lang}
          </span>
        </div>
        <div className="mt-3 min-h-[2.8em] font-display text-[18px] font-bold leading-snug text-[#8FD8F7] sm:text-[21px]" style={fade}>
          {tr}
          <span className="invisible">{trRest}</span>
        </div>
        <div
          className="mt-3 rounded-xl border border-white/10 bg-night/50 px-3 py-2 text-[12px] leading-snug text-t-1"
          style={{
            opacity: local >= HINT && shown ? 1 : 0,
            transform: local >= HINT && shown ? 'translateY(0)' : 'translateY(6px)',
            transition: `opacity .5s ${ease}, transform .5s ${ease}`
          }}
        >
          <span className="mr-1 font-semibold text-accent-hi">✦ AI</span>
          {hint}
          <span className="invisible">{hintRest}</span>
        </div>
      </div>
    </div>
  )
}
