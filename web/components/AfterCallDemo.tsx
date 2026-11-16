'use client'

import { useEffect, useState } from 'react'

// Animated "after the call" demo: brief → estimate (hours count up) → email,
// cycling on its own; the visitor can click a tab.

const BRIEF = [
  ['Goal', 'Online booking for 3 dental clinics'],
  ['Scope', 'Patient app (book, reschedule, pay) + admin panel'],
  ['Budget', '$4–5k, fixed price'],
  ['Deadline', 'MVP by 30 June'],
  ['Open', 'Who provides the designs? Clinics at launch?']
]
const ESTIMATE: [string, number][] = [
  ['Auth + patient profiles', 10],
  ['Booking calendar + rescheduling', 24],
  ['Stripe payments', 8],
  ['Admin panel', 18]
]
const EMAIL = [
  'Hi Sarah, thanks for the call today!',
  'To confirm: a patient app (booking, rescheduling, payments) and an admin panel for your 3 clinics.',
  'Budget $4–5k fixed, MVP by 30 June.',
  'One open point: who provides the designs?',
  'I’ll send the detailed estimate by Friday.'
]
const CYCLE_MS = 6000

export function AfterCallDemo({ tabs }: { tabs: [string, string, string] }) {
  const [tab, setTab] = useState(0)
  const [tick, setTick] = useState(0)
  const [manual, setManual] = useState(false)

  useEffect(() => {
    setTick(0)
    const t = setInterval(() => setTick((n) => n + 1), 350)
    return () => clearInterval(t)
  }, [tab])
  useEffect(() => {
    if (manual) return
    const t = setTimeout(() => setTab((x) => (x + 1) % 3), CYCLE_MS)
    return () => clearTimeout(t)
  }, [tab, manual])

  const total = ESTIMATE.reduce((n, [, h]) => n + h, 0)
  const counted = Math.min(total, Math.round((total * tick) / 10))

  return (
    <div className="mx-auto max-w-3xl rounded-xl2 border border-line bg-white p-2 shadow-window">
      <div className="flex gap-1 rounded-[16px] bg-sand p-1" role="tablist">
        {tabs.map((t, i) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === i}
            onClick={() => {
              setManual(true)
              setTab(i)
            }}
            className={`flex-1 rounded-[12px] px-3 py-2 text-[13px] font-semibold transition-colors sm:text-[14px] ${
              tab === i ? 'bg-white text-ink shadow-sm' : 'text-ink-3 hover:text-ink'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="min-h-[250px] p-5 sm:p-7">
        {tab === 0 && (
          <dl className="space-y-3">
            {BRIEF.map(([k, v], i) => (
              <div key={k} className={`grid grid-cols-[90px_1fr] gap-3 text-[14.5px] transition-opacity duration-300 ${tick > i ? 'opacity-100' : 'opacity-0'}`}>
                <dt className="font-semibold text-ink">{k}</dt>
                <dd className={k === 'Open' ? 'text-[#B45309]' : 'text-ink-2'}>{v}</dd>
              </div>
            ))}
          </dl>
        )}
        {tab === 1 && (
          <table className="w-full text-[14.5px]">
            <tbody>
              {ESTIMATE.map(([task, h], i) => (
                <tr key={task} className={`border-b border-line transition-opacity duration-300 ${tick > i ? 'opacity-100' : 'opacity-0'}`}>
                  <td className="py-2.5 text-ink-2">{task}</td>
                  <td className="py-2.5 text-right font-mono text-ink">{h} h</td>
                </tr>
              ))}
              <tr>
                <td className="pt-3 font-semibold text-ink">Total (draft)</td>
                <td className="pt-3 text-right font-mono text-[18px] font-bold text-accent-ink">{counted} h</td>
              </tr>
            </tbody>
          </table>
        )}
        {tab === 2 && (
          <div className="space-y-2 border-l-4 border-accent/40 pl-4 text-[14.5px] leading-relaxed text-ink-2">
            {EMAIL.map((l, i) => (
              <p key={l} className={`transition-opacity duration-300 ${tick > i ? 'opacity-100' : 'opacity-0'}`}>
                {l}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
