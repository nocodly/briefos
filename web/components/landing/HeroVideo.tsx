'use client'

import { Pointer } from './Demos'
import { Icon } from './Icon'
import { useLoop } from './useLoop'

// The call demo: a video call with the Minutama capsule on top, playing by
// itself in a loop, frame by frame:
//   the client speaks → her words appear letter by letter → the Spanish
//   translation types in under them → "Have you worked with Stripe?" gets a
//   term hint on its own → "How would you set up the webhooks?" gets the Ask
//   AI button → the mouse glides to it and clicks → the answer types in.
// Text never reflows while typing (the rest is laid out, just invisible), and
// lines enter / leave by smoothly opening / closing.

const EN_CPS = 0.026 // client speech, letters per ms
const TR_CPS = 0.07 // translation stream
const AN_CPS = 0.06 // hints and answers
const GAP = 650 // pause between the client's sentences

type Line = { en: string; es: string; q?: boolean; term?: boolean; ask?: boolean }

const SCRIPT: Line[] = [
  { en: 'We need a booking site for our coffee shop,', es: 'Necesitamos un sitio de reservas para nuestra cafetería,' },
  { en: 'with online payments through Stripe.', es: 'con pagos online a través de Stripe.' },
  { en: 'Have you worked with Stripe before?', es: '¿Has trabajado antes con Stripe?', q: true, term: true },
  { en: 'And how would you set up the webhooks?', es: '¿Y cómo configurarías los webhooks?', q: true, ask: true }
]

const TERM = { word: 'Stripe', text: 'servicio de pagos online: tarjetas, suscripciones y facturas.' }

// Timeline (ms) built from the script.
const LINES = (() => {
  let at = 400
  return SCRIPT.map((l) => {
    const start = at
    const enEnd = start + l.en.length / EN_CPS
    const trStart = enEnd + 220
    const trEnd = trStart + l.es.length / TR_CPS
    // After the Stripe question, leave time to read its hint.
    at = trEnd + GAP + (l.term ? 1900 : 0)
    return { ...l, start, enEnd, trStart, trEnd }
  })
})()
const QT = LINES[2] // Stripe question → hint by itself
const QA = LINES[3] // webhooks question → Ask AI click
const T_TERM = QT.trEnd + 250
const T_BUTTON = QA.trEnd - 150
const T_POINTER = T_BUTTON + 350
const T_MOVE = T_POINTER + 150
const T_CLICK = T_MOVE + 1000
const T_ANSWER = T_CLICK + 240

export function HeroVideo({ labels, answer }: { labels: Labels; answer: string }) {
  const LOOP = T_ANSWER + 250 + answer.length / AN_CPS + 4200
  const FADE_AT = LOOP - 700
  const { ref, t } = useLoop(LOOP, T_ANSWER + 250 + answer.length / AN_CPS + 600)

  const answerOn = t >= T_ANSWER
  // The newest two lines; once the answer opens, only the question it answers.
  const visible = (i: number) => {
    const l = LINES[i]
    if (t < l.start) return false
    if (answerOn) return i === LINES.length - 1
    return LINES.filter((x) => x.start <= t && x.start > l.start).length < 2
  }
  const termOn = t >= T_TERM && t < QA.trEnd + 300 && !answerOn
  const speaking = LINES.some((l) => t >= l.start && t < l.enEnd)
  const buttonOn = t >= T_BUTTON
  const pointerOn = t >= T_POINTER && t < T_ANSWER + 1200
  const moved = t >= T_MOVE
  const pressed = t >= T_CLICK && t < T_CLICK + 180
  const clicked = t >= T_CLICK
  const fading = t >= FADE_AT
  const secs = 4 * 60 + 12 + Math.floor(t / 1000)

  return (
    <div ref={ref} className="glass-card relative aspect-square w-full overflow-hidden rounded-[22px] sm:aspect-video">
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
        className="absolute inset-x-4 bottom-[54px] rounded-xl border border-white/10 bg-[#0E0F13]/95 px-3 py-2.5 shadow-[0_20px_50px_-15px_rgba(0,0,0,.8)] backdrop-blur sm:inset-x-6"
        style={{ opacity: fading ? 0 : 1, transition: 'opacity .7s cubic-bezier(.4,0,.2,1)' }}
      >
        <div className="mb-1 flex items-center justify-between gap-2 text-[9px] font-semibold uppercase tracking-[.14em]">
          <span className="flex items-center gap-1.5 text-accent-pale">
            <span className="flex h-3.5 w-3.5 items-center justify-center rounded bg-accent text-[7px] text-white">M</span>
            {labels.client}
          </span>
          <span className="whitespace-nowrap normal-case tracking-normal text-t-3">
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
              {l.ask && (
                <span className="relative flex-none">
                  <span
                    className="flex items-center gap-1 rounded-full bg-accent px-2 py-1 text-[9.5px] font-semibold text-white shadow-[0_2px_12px_rgba(255,106,61,.5)]"
                    style={{
                      opacity: buttonOn ? 1 : 0,
                      transform: `scale(${pressed ? 0.9 : buttonOn ? 1 : 0.75})`,
                      transition: 'opacity .35s ease-out, transform .25s ease-out'
                    }}
                  >
                    <Icon name="sparkles" className="h-3 w-3" /> {labels.ask}
                  </span>
                  {clicked && t < T_CLICK + 700 && (
                    <span className="ripple-once pointer-events-none absolute inset-0 rounded-full border-2 border-accent-pale" />
                  )}
                  <Pointer
                    className="absolute left-1/2 top-1/2 z-10"
                    style={{
                      opacity: pointerOn ? 1 : 0,
                      transform: `translate(${moved ? 2 : -120}px, ${moved ? 2 : 8}px) scale(${pressed ? 0.85 : 1})`,
                      transition: `transform ${moved && !clicked ? 950 : 180}ms cubic-bezier(.45,.05,.25,1), opacity .35s ease`
                    }}
                  />
                </span>
              )}
            </div>
            {/* The term hint shows up by itself under the Stripe question. */}
            {l.term && (
              <Reveal open={termOn}>
                <div className="mb-1 ml-5 rounded-lg border border-[#F5A524]/25 bg-[#F5A524]/[.07] px-2 py-1 text-[10.5px] leading-snug text-t-2">
                  <b className="text-[#F5A524]">{TERM.word}</b> — <Typed text={TERM.text} n={(t - T_TERM - 200) * AN_CPS} />
                </div>
              </Reveal>
            )}
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
function Reveal({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div
      className="grid"
      style={{
        gridTemplateRows: open ? '1fr' : '0fr',
        opacity: open ? 1 : 0,
        transition: 'grid-template-rows .5s cubic-bezier(.4,0,.2,1), opacity .5s cubic-bezier(.4,0,.2,1)'
      }}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  )
}
