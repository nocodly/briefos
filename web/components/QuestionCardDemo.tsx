'use client'

import { useEffect, useState } from 'react'
import { LogoMark } from './Logo'

// Hero demo for /freelancers: the client's question types in, then the line in
// the visitor's language appears, then a short term explanation. The visitor
// can switch the language to see their own.

const QUESTION = 'How would you structure the API on AWS — and can you have a first version by the end of next month?'

const LANGS = [
  {
    id: 'es',
    label: 'Español',
    text: '¿Cómo estructurarías la API en AWS? ¿Y podrías tener una primera versión a finales del mes que viene?',
    term: 'API Gateway + Lambda: la arquitectura «serverless» típica de AWS; pagas solo por petición.'
  },
  {
    id: 'pt',
    label: 'Português',
    text: 'Como você estruturaria a API na AWS — e consegue ter uma primeira versão até o fim do mês que vem?',
    term: 'API Gateway + Lambda: o padrão “serverless” típico da AWS; você paga só pelas requisições.'
  },
  {
    id: 'hi',
    label: 'हिन्दी',
    text: 'आप AWS पर API कैसे बनाएँगे — और क्या अगले महीने के अंत तक पहला वर्ज़न दे सकते हैं?',
    term: 'API Gateway + Lambda — AWS पर आम “serverless” सेटअप: सिर्फ़ रिक्वेस्ट के हिसाब से भुगतान।'
  },
  {
    id: 'pl',
    label: 'Polski',
    text: 'Jak zbudowałbyś API na AWS — i czy dasz radę zrobić pierwszą wersję do końca przyszłego miesiąca?',
    term: 'API Gateway + Lambda — typowy „serverless” układ API na AWS: płacisz tylko za zapytania.'
  },
  {
    id: 'uk',
    label: 'Українська',
    text: 'Як би ви побудували API на AWS — і чи зможете зробити першу версію до кінця наступного місяця?',
    term: 'API Gateway + Lambda — типова «безсерверна» схема API на AWS: платите лише за запити.'
  }
] as const

type Phase = 'typing' | 'translation' | 'term'
type LangId = (typeof LANGS)[number]['id']

/** Ads can force a language (?lang=pt); otherwise follow the browser (en-IN → Hindi). */
function initialLang(pageLang?: string): LangId {
  const ids = LANGS.map((l) => l.id) as readonly string[]
  const param = new URLSearchParams(window.location.search).get('lang')?.toLowerCase()
  if (param && ids.includes(param)) return param as LangId
  if (pageLang && ids.includes(pageLang)) return pageLang as LangId
  const nav = (navigator.languages?.length ? navigator.languages : [navigator.language]).map((l) => l.toLowerCase())
  for (const l of nav) {
    if (l === 'en-in') return 'hi'
    const base = l.slice(0, 2)
    if (base === 'ru') return 'uk'
    if (ids.includes(base)) return base as LangId
  }
  return 'es'
}

export function QuestionCardDemo({
  defaultLang,
  labels = { asked: 'Client asked', yourLanguage: 'Your language:' }
}: {
  defaultLang?: string
  labels?: { asked: string; yourLanguage: string }
}) {
  const [lang, setLang] = useState<LangId>((defaultLang as LangId) ?? 'es')
  const [typed, setTyped] = useState(0)
  const [phase, setPhase] = useState<Phase>('typing')
  const current = LANGS.find((l) => l.id === lang) ?? LANGS[0]

  useEffect(() => setLang(initialLang(defaultLang)), [defaultLang])

  // Type the question once; afterwards language switches only swap the lines.
  useEffect(() => {
    if (typed >= QUESTION.length) {
      const t1 = setTimeout(() => setPhase('translation'), 350)
      const t2 = setTimeout(() => setPhase('term'), 1100)
      return () => {
        clearTimeout(t1)
        clearTimeout(t2)
      }
    }
    const t = setTimeout(() => setTyped((n) => Math.min(QUESTION.length, n + 2)), 28)
    return () => clearTimeout(t)
  }, [typed])

  const showTranslation = phase !== 'typing'
  const showTerm = phase === 'term'

  return (
    <div>
      <div className="relative overflow-hidden rounded-[22px] border border-white/10 bg-[#15171C] p-4 text-white shadow-window">
        <div className="pointer-events-none absolute -left-12 -top-14 h-32 w-32 rounded-full bg-accent/35 blur-2xl" />
        <div className="relative">
          <div className="flex items-center gap-2.5">
            <LogoMark size={28} />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#EF4444]" />
            <span className="font-mono text-[13px] text-white/80">12:48</span>
            <span className="ml-auto text-[11px] text-white/40">Call with client · Zoom</span>
          </div>

          <div className="mt-3 rounded-[14px] border border-accent/30 bg-accent/[.10] p-3.5">
            <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[.12em] text-[#FFB59C]">
              {labels.asked}
            </div>
            <p className="mt-1.5 min-h-[44px] text-[14px] leading-snug text-white/75">
              {QUESTION.slice(0, typed)}
              {typed < QUESTION.length && <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-white/70" />}
            </p>
            <p
              className={`mt-2 text-[15.5px] font-semibold leading-snug text-white transition-all duration-500 ${
                showTranslation ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'
              }`}
            >
              {current.text}
            </p>
            <p
              className={`mt-2.5 border-t border-white/10 pt-2.5 text-[12.5px] leading-snug text-white/65 transition-all duration-500 ${
                showTerm ? 'opacity-100' : 'opacity-0'
              }`}
            >
              {current.term}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Show the card in your language">
        <span className="text-[13px] text-ink-3">{labels.yourLanguage}</span>
        {LANGS.map((l) => (
          <button
            key={l.id}
            onClick={() => setLang(l.id)}
            aria-pressed={lang === l.id}
            className={`rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors ${
              lang === l.id ? 'border-ink bg-ink text-paper' : 'border-line bg-white text-ink-2 hover:border-ink-3'
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>
    </div>
  )
}
