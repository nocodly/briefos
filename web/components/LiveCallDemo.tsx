'use client'

import { useEffect, useState } from 'react'

// Animated "during the call" demo: the client talks (English), question cards
// appear with the visitor's translation, the scope tracker fills itself and the
// open points show up at the end. Loops.

type Line = { who: 'them' | 'me'; text: string; card?: 0 | 1; scope?: number[] }

const SCRIPT: Line[] = [
  { who: 'them', text: 'Thanks for jumping on. We run three dental clinics and want online booking.' },
  { who: 'me', text: 'Sounds great. What should patients be able to do?' },
  { who: 'them', text: 'Book, reschedule and pay. Can you build both the patient app and the admin panel?', card: 0, scope: [0] },
  { who: 'them', text: 'Our budget is around four to five thousand, fixed price.', scope: [1] },
  { who: 'them', text: 'And we’d love an MVP by the end of June.', scope: [2] },
  { who: 'them', text: 'Have you worked with Stripe subscriptions before?', card: 1, scope: [3] }
]
const QUESTIONS = [
  'Can you build both the patient app and the admin panel?',
  'Have you worked with Stripe subscriptions before?'
]
const STEP_MS = 1900
const END_PAUSE_STEPS = 4

export function LiveCallDemo({
  labels,
  scopeItems,
  unclearItems,
  translations
}: {
  labels: { call: string; questions: string; scope: string; unclear: string; asked: string; you: string; client: string }
  scopeItems: [string, string][]
  unclearItems: string[]
  translations: string[]
}) {
  const [step, setStep] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setStep((s) => (s + 1) % (SCRIPT.length + END_PAUSE_STEPS + 1)), STEP_MS)
    return () => clearInterval(t)
  }, [])

  const shown = SCRIPT.slice(0, Math.min(step, SCRIPT.length))
  const cards = shown.filter((l) => l.card !== undefined).map((l) => l.card!) as number[]
  const scope = new Set(shown.flatMap((l) => l.scope ?? []))
  const showUnclear = step >= SCRIPT.length + 1

  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
      {/* Call transcript */}
      <div className="rounded-xl2 border border-line bg-white p-5 shadow-window">
        <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[.12em] text-ink-3">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#EF4444]" /> {labels.call}
          <span className="ml-auto font-mono normal-case tracking-normal">Zoom · 08:{String(12 + shown.length * 7).padStart(2, '0')}</span>
        </div>
        <div className="mt-4 flex min-h-[300px] flex-col gap-2.5">
          {shown.map((l, i) => (
            <div
              key={i}
              className={`max-w-[88%] animate-rise rounded-2xl px-3.5 py-2.5 text-[14px] leading-snug ${
                l.who === 'me' ? 'self-end bg-me text-ink' : 'self-start bg-them text-ink'
              }`}
            >
              <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                {l.who === 'me' ? labels.you : labels.client}
              </span>
              {l.text}
            </div>
          ))}
          {step < SCRIPT.length && (
            <div className="flex gap-1 self-start rounded-2xl bg-them px-3.5 py-3" aria-hidden="true">
              {[0, 1, 2].map((d) => (
                <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-3" style={{ animationDelay: `${d * 0.15}s` }} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Agent side */}
      <div className="flex flex-col gap-4">
        <div className="rounded-xl2 border border-white/10 bg-[#15171C] p-4 text-white shadow-window">
          <div className="text-[11px] font-semibold uppercase tracking-[.12em] text-[#FFB59C]">{labels.questions}</div>
          <div className="mt-2.5 flex min-h-[132px] flex-col gap-2">
            {cards.length === 0 && <div className="text-[13px] text-white/40">…</div>}
            {cards.map((c) => (
              <div key={c} className="animate-rise rounded-xl border border-accent/30 bg-accent/[.1] p-3">
                <div className="text-[10.5px] font-semibold uppercase tracking-[.1em] text-[#FFB59C]">{labels.asked}</div>
                <div className="mt-1 text-[13px] text-white/70">{QUESTIONS[c]}</div>
                <div className="mt-1 text-[14px] font-semibold leading-snug">{translations[c]}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl2 border border-line bg-white p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[.12em] text-accent-ink">{labels.scope}</div>
            <ul className="mt-2.5 space-y-2">
              {scopeItems.map(([k, v], i) => (
                <li
                  key={k}
                  className={`flex items-start gap-2 text-[13px] transition-all duration-500 ${scope.has(i) ? 'opacity-100' : 'opacity-25'}`}
                >
                  <span className={`mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full text-[10px] text-white ${scope.has(i) ? 'bg-[#16A34A]' : 'bg-line'}`}>
                    ✓
                  </span>
                  <span>
                    <span className="font-semibold text-ink">{k}:</span> <span className="text-ink-2">{scope.has(i) ? v : '…'}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl2 border border-line bg-white p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[.12em] text-[#B45309]">{labels.unclear}</div>
            <ul className="mt-2.5 space-y-2">
              {unclearItems.map((u) => (
                <li key={u} className={`flex gap-2 text-[13px] text-ink-2 transition-all duration-500 ${showUnclear ? 'opacity-100' : 'opacity-0'}`}>
                  <span className="text-[#D97706]">?</span> {u}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
