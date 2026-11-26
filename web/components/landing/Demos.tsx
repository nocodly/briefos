'use client'

import { useState } from 'react'
import { SHARE_TARGETS } from './brands'
import { Icon } from './Icon'
import { lettersOf, useInView, useLoop } from './useLoop'

// Small animated pictures for the landing. All motion is CSS transitions or
// frame-by-frame time, and pauses when off screen.

const ease = 'cubic-bezier(.4,0,.2,1)'

function Typed({ text, n, className = '' }: { text: string; n: number; className?: string }) {
  const [a, b] = lettersOf(text, n)
  return (
    <span className={className}>
      {a}
      <span className="invisible">{b}</span>
    </span>
  )
}

function Reveal({ open, children, ms = 550 }: { open: boolean; children: React.ReactNode; ms?: number }) {
  return (
    <div
      className="grid"
      style={{
        gridTemplateRows: open ? '1fr' : '0fr',
        opacity: open ? 1 : 0,
        transition: `grid-template-rows ${ms}ms ${ease}, opacity ${ms}ms ${ease}`
      }}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  )
}

/* ── 1. A hard question and a valuable hint, live ── */

const HQ = {
  en: 'Who owns the IP, and can you sign an NDA before we share the repo?',
  es: '¿De quién es la propiedad intelectual y puedes firmar un NDA antes de compartir el repo?',
  terms: [
    ['IP', 'propiedad intelectual: quién es dueño del código'],
    ['NDA', 'acuerdo de confidencialidad']
  ],
  say: 'Di: “The code is yours once it’s paid — happy to sign your NDA.”'
}

export function HardQuestionDemo({ clientLabel, hintLabel }: { clientLabel: string; hintLabel: string }) {
  const LOOP = 14000
  const { ref, t } = useLoop(LOOP, 11000)
  const enN = (t - 300) * 0.03
  const enDone = 300 + HQ.en.length / 0.03
  const esN = (t - enDone - 250) * 0.075
  const hintAt = enDone + 250 + HQ.es.length / 0.075 + 300
  const sayN = (t - hintAt - 900) * 0.055
  const fade = t > LOOP - 600
  return (
    <div ref={ref} className="glass-card rounded-[20px] p-5" style={{ opacity: fade ? 0 : 1, transition: `opacity .6s ${ease}` }}>
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-[.14em] text-accent-pale">{clientLabel}</div>
        <span className="flex items-center gap-1 text-[10px] text-t-3">
          <span className={`h-1.5 w-1.5 rounded-full bg-[#22C55E] ${t < enDone ? 'animate-blink' : 'opacity-40'}`} /> live
        </span>
      </div>
      <div className="mt-2 flex items-start gap-2">
        <span className="mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full bg-[#F5A524]/20 text-[10px] font-bold text-[#F5A524]">?</span>
        <div>
          <div className="text-[14px] font-medium leading-snug text-t-1">
            <Typed text={HQ.en} n={enN} />
          </div>
          <div className="mt-0.5 text-[13.5px] leading-snug text-[#8FD8F7]">
            <Typed text={HQ.es} n={esN} />
          </div>
        </div>
      </div>
      {/* Space is always reserved (no page jumps); the hint fades and slides in. */}
      <div
        style={{
          opacity: t >= hintAt ? 1 : 0,
          transform: t >= hintAt ? 'translateY(0)' : 'translateY(8px)',
          transition: `opacity .6s ${ease}, transform .6s ${ease}`
        }}
      >
        <div className="mt-3 rounded-xl border border-[#F5A524]/30 bg-[#F5A524]/[.07] p-3 text-[12.5px] leading-relaxed text-t-2">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[.1em] text-[#F5A524]">
            <Icon name="sparkles" className="h-3.5 w-3.5" /> {hintLabel}
          </div>
          {HQ.terms.map(([k, v], i) => (
            <div key={k} style={{ opacity: t >= hintAt + 200 + i * 350 ? 1 : 0, transition: `opacity .5s ${ease}` }}>
              <b className="text-[#F5A524]">{k}</b> — {v}
            </div>
          ))}
          <div className="mt-1 font-medium text-t-1">
            <Typed text={HQ.say} n={sayN} />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── 2. Ask AI: click the button, the answer appears ── */

const ASK = {
  q: 'How would you set up the deploy — Docker or Vercel?',
  a: 'Para un sitio pequeño Vercel es más simple y barato. Di: “I’d deploy on Vercel with a staging site first — Docker only if you need your own server.”'
}

/** The mouse pointer used in the demos. */
export function Pointer({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`pointer-events-none h-5 w-5 drop-shadow-[0_2px_4px_rgba(0,0,0,.6)] ${className}`} style={style}>
      <path d="M5 3l14 7.5-6.2 1.7L10 18.5z" fill="#fff" stroke="#0B0C0F" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * Ask AI plays by itself: the pointer comes in, glides to the button and
 * clicks; the AI "thinks" for a moment, then the answer types in. The answer
 * area keeps its size the whole time, so the page never jumps.
 */
export function AskDemo({ askLabel }: { askLabel: string }) {
  const LOOP = 13000
  const IN = 1300 // pointer appears
  const MOVE = 1500 // … and glides
  const CLICK = 2500
  const THINK = 2750
  const TYPE = 3250
  const OUT = 11800 // answer fades before the loop starts again
  const { ref, t } = useLoop(LOOP, 9000)
  const clicked = t >= CLICK && t < OUT
  const pressed = t >= CLICK && t < CLICK + 180
  const pointerOn = t >= IN && t < THINK + 900
  const moved = t >= MOVE
  const answerOn = t >= THINK && t < OUT
  return (
    <div ref={ref} className="glass-card rounded-[20px] p-5">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full bg-[#F5A524]/20 text-[10px] font-bold text-[#F5A524]">?</span>
        <div className="flex-1 text-[14px] font-medium leading-snug text-t-1">{ASK.q}</div>
        <span className="relative flex-none">
          <span
            className="relative flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-semibold text-white"
            style={{
              background: clicked ? 'rgba(255,106,61,.65)' : '#FF6A3D',
              boxShadow: clicked ? 'none' : '0 4px 18px rgba(255,106,61,.55)',
              transform: pressed ? 'scale(.9)' : 'scale(1)',
              transition: `transform .18s ${ease}, background .4s ${ease}, box-shadow .4s ${ease}`
            }}
          >
            <Icon name="sparkles" className="h-3.5 w-3.5" /> {askLabel}
          </span>
          {t >= CLICK && t < CLICK + 700 && <span className="ripple-once pointer-events-none absolute inset-0 rounded-full border-2 border-accent-pale" />}
          <Pointer
            className="absolute left-1/2 top-1/2 z-10"
            style={{
              opacity: pointerOn ? 1 : 0,
              transform: `translate(${moved ? 2 : 80}px, ${moved ? 2 : 70}px) scale(${pressed ? 0.85 : 1})`,
              transition: `transform ${moved && t < CLICK ? 950 : 180}ms cubic-bezier(.45,.05,.25,1), opacity .35s ease`
            }}
          />
        </span>
      </div>
      <div
        style={{
          opacity: answerOn ? 1 : 0,
          transform: answerOn ? 'translateY(0)' : 'translateY(8px)',
          transition: `opacity .55s ${ease}, transform .55s ${ease}`
        }}
      >
        <div className="mt-3 rounded-xl border border-accent/30 bg-accent/10 p-3 text-[12.5px] leading-relaxed text-t-1">
          <div className="mb-1 flex items-center gap-1.5 font-semibold text-accent-hi">
            <Icon name="sparkles" className="h-3.5 w-3.5" /> Ask AI
          </div>
          <div className="relative">
            {/* Thinking dots sit on top of the (still invisible) answer. */}
            <span
              className="absolute left-0 top-1 inline-flex gap-1"
              style={{ opacity: t >= THINK && t < TYPE ? 1 : 0, transition: 'opacity .2s ease' }}
            >
              {[0, 1, 2].map((d) => (
                <span key={d} className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-hi" style={{ animationDelay: `${d * 150}ms` }} />
              ))}
            </span>
            <Typed text={ASK.a} n={(t - TYPE) * 0.06} />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── 3. Notes ready → shared everywhere (a paper plane flies to each app) ── */

export function ShareDemo({
  title,
  ready,
  notes,
  task,
  due,
  share
}: {
  title: string
  ready: string
  notes: readonly string[]
  task: string
  due: string
  share: string
}) {
  const HOP = 1200
  const LOOP = HOP * SHARE_TARGETS.length + 2600
  const { ref, t } = useLoop(LOOP, LOOP - 900)
  const flying = t >= 700 && t < 700 + HOP * SHARE_TARGETS.length
  const hop = Math.min(SHARE_TARGETS.length - 1, Math.max(0, Math.floor((t - 700) / HOP)))
  const landed = (i: number) => t >= 700 + i * HOP + 850
  const resetting = t >= LOOP - 500
  // Plane: start at the Share button (right), then each target in turn.
  const x = t < 700 ? 88 : 10 + hop * 20
  const y = t < 700 ? 0 : 100
  return (
    <div ref={ref} className="glass-card relative rounded-[20px] p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="font-display text-[15px] font-bold text-t-1">{title}</div>
        <span className="flex-none rounded-full bg-[#22C55E]/15 px-2 py-0.5 text-[11px] font-semibold text-[#22C55E]">{ready}</span>
      </div>
      <div className="mt-3 space-y-1.5 text-[12.5px] text-t-2">
        {notes.map((n) => (
          <div key={n}>• {n}</div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 rounded-lg bg-white/[.04] px-3 py-2 text-[12.5px] text-t-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="h-4 w-4 flex-none rounded border border-white/25" />
          <span className="min-w-0">
            {task} · <span className="whitespace-nowrap text-accent-hi">{due}</span>
          </span>
        </span>
        <span className="flex flex-none items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent-hi">
          <Icon name="arrow" className="h-3 w-3" /> {share}
        </span>
      </div>

      {/* Share targets + the plane */}
      <div className="relative mt-5 h-16">
        <div className="absolute inset-x-0 bottom-0 grid grid-cols-5">
          {SHARE_TARGETS.map((s, i) => {
            const on = landed(i) && !resetting
            const color = s.hex === '#000000' ? '#FFFFFF' : s.hex
            return (
              <div key={s.name} className="flex flex-col items-center gap-1">
                <span
                  className="relative flex h-10 w-10 items-center justify-center rounded-xl border transition-all duration-500"
                  style={{
                    borderColor: on ? `${color}66` : 'rgba(255,255,255,.08)',
                    background: on ? `${color}1f` : 'rgba(255,255,255,.03)',
                    color: on ? color : '#807D78',
                    transform: on ? 'scale(1.06)' : 'scale(1)',
                    transitionTimingFunction: ease
                  }}
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                    <path d={s.path} />
                  </svg>
                  <span
                    className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#22C55E] text-white transition-all duration-300"
                    style={{ opacity: on ? 1 : 0, transform: on ? 'scale(1)' : 'scale(.4)' }}
                  >
                    <Icon name="check" className="h-2.5 w-2.5" />
                  </span>
                </span>
                <span className="max-w-full truncate text-[9.5px] text-t-3">{s.name}</span>
              </div>
            )
          })}
        </div>
        {/* X moves evenly, Y overshoots upward first → the plane flies in an arc. */}
        <div
          className="pointer-events-none absolute top-0"
          style={{
            left: `${x}%`,
            transition: `left ${t < 700 ? 0 : 900}ms cubic-bezier(.45,0,.35,1), opacity .4s ease`,
            opacity: flying || (t >= 700 && !resetting && t < 700 + HOP * SHARE_TARGETS.length + 300) ? 1 : 0
          }}
        >
          <div
            style={{
              transform: `translateY(${y === 0 ? -34 : -14}px)`,
              transition: `transform 900ms cubic-bezier(.3,-1.2,.6,1)`
            }}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 -translate-x-1/2 text-accent-hi drop-shadow-[0_2px_8px_rgba(255,106,61,.7)]" aria-hidden="true">
              <path d="M3 11.5 21 3l-6.5 18-3.2-7.3z M11.3 13.7 21 3" fill="currentColor" stroke="#0B0C0F" strokeWidth=".8" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Charts that draw themselves when scrolled into view ── */

export function AnimatedChart({ label, rising, delay = 0 }: { label: string; rising?: boolean; delay?: number }) {
  const { ref, seen } = useInView<HTMLDivElement>()
  const id = rising ? 'gUp' : 'gFlat'
  const d = rising
    ? 'M0 80 C30 78 50 70 75 66 S120 60 140 45 S175 20 200 8'
    : 'M0 62 C20 55 35 68 55 64 S90 56 110 63 S150 70 170 62 S190 58 200 63'
  return (
    <div ref={ref} className={`rounded-[18px] p-4 ${rising ? 'border border-accent/40 bg-accent/[.07]' : 'glass-card'}`}>
      <div className={`text-[12px] font-semibold ${rising ? 'text-accent-hi' : 'text-t-3'}`}>{label}</div>
      <svg viewBox="0 0 200 90" className="mt-2 h-24 w-full overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={rising ? '#FF6A3D' : '#807D78'} stopOpacity=".55" />
            <stop offset="100%" stopColor={rising ? '#FF6A3D' : '#807D78'} stopOpacity=".05" />
          </linearGradient>
          <clipPath id={`${id}-clip`}>
            <rect
              x="0"
              y="0"
              width="200"
              height="90"
              style={{
                transformOrigin: '0 0',
                transform: `scaleX(${seen ? 1 : 0})`,
                transition: `transform 1.8s ${ease} ${delay}ms`
              }}
            />
          </clipPath>
        </defs>
        <path d={`${d} L200 90 L0 90 Z`} fill={`url(#${id})`} clipPath={`url(#${id}-clip)`} />
        <path
          d={d}
          fill="none"
          stroke={rising ? '#FF8F6B' : '#807D78'}
          strokeWidth="2.2"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="1"
          style={{ strokeDashoffset: seen ? 0 : 1, transition: `stroke-dashoffset 1.8s ${ease} ${delay}ms` }}
        />
        {rising && (
          <circle
            cx="200"
            cy="8"
            r="4"
            fill="#FF8F6B"
            style={{ opacity: seen ? 1 : 0, transition: `opacity .4s ease ${delay + 1700}ms` }}
          />
        )}
      </svg>
    </div>
  )
}

/* ── FAQ with a smooth open / close ── */

export function Faq({ items }: { items: readonly { q: string; a: string }[] }) {
  const [open, setOpen] = useState<Set<number>>(new Set())
  const toggle = (i: number) =>
    setOpen((s) => {
      const n = new Set(s)
      if (n.has(i)) n.delete(i)
      else n.add(i)
      return n
    })
  return (
    <div className="mt-10 space-y-3">
      {items.map((f, i) => {
        const on = open.has(i)
        return (
          <div key={f.q} className={`glass-card rounded-[14px] transition-colors duration-500 ${on ? 'border-accent/25' : ''}`}>
            <button
              onClick={() => toggle(i)}
              aria-expanded={on}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-semibold text-t-1"
            >
              {f.q}
              <span
                className="flex-none text-t-3"
                style={{ transform: `rotate(${on ? 180 : 0}deg)`, transition: `transform .5s ${ease}` }}
              >
                <Icon name="chevron" className="h-5 w-5" />
              </span>
            </button>
            <Reveal open={on} ms={500}>
              <p
                className="px-5 pb-5 text-[15px] leading-relaxed text-t-2"
                style={{ transform: on ? 'translateY(0)' : 'translateY(-6px)', transition: `transform .5s ${ease}` }}
              >
                {f.a}
              </p>
            </Reveal>
          </div>
        )
      })}
    </div>
  )
}
