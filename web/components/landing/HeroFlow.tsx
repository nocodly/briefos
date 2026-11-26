'use client'

import { lettersOf, useLoop } from './useLoop'

// Hero picture: clients speak English on the left; thin lines carry their
// words into Minutama in the middle; on the right you read them in your own
// language. Each step one client talks and the language changes, so the idea
// is clear at a glance: any client → Minutama → your language.

const CLIENTS = [
  { initials: 'AW', name: 'Anna · Berlin', en: 'Can you start next Monday?', y: 18 },
  { initials: 'MJ', name: 'Mike · Austin', en: 'What’s your rate for the MVP?', y: 50 },
  { initials: 'LS', name: 'Lucy · London', en: 'Could you send the estimate by Friday?', y: 82 }
]

const LANGS: { code: string; name: string; rtl?: boolean; tr: [string, string, string] }[] = [
  { code: 'ES', name: 'Español', tr: ['¿Puedes empezar el próximo lunes?', '¿Cuál es tu tarifa para el MVP?', '¿Podrías enviar el presupuesto antes del viernes?'] },
  { code: 'UK', name: 'Українська', tr: ['Чи можете почати наступного понеділка?', 'Яка ваша ставка за MVP?', 'Чи можете надіслати оцінку до п’ятниці?'] },
  { code: 'PT', name: 'Português', tr: ['Você pode começar na próxima segunda?', 'Qual é a sua taxa para o MVP?', 'Pode enviar o orçamento até sexta?'] },
  { code: 'HI', name: 'हिन्दी', tr: ['क्या आप अगले सोमवार से शुरू कर सकते हैं?', 'MVP के लिए आपकी दर क्या है?', 'क्या आप शुक्रवार तक अनुमान भेज सकते हैं?'] },
  { code: 'TR', name: 'Türkçe', tr: ['Önümüzdeki pazartesi başlayabilir misiniz?', 'MVP için ücretiniz nedir?', 'Tahmini cuma gününe kadar gönderebilir misiniz?'] },
  { code: 'AR', name: 'العربية', rtl: true, tr: ['هل يمكنك البدء يوم الاثنين القادم؟', 'ما هو سعرك مقابل الـ MVP؟', 'هل يمكنك إرسال التقدير قبل يوم الجمعة؟'] }
]

const STEP = 4200
const LOOP = STEP * LANGS.length
// Inside a step (ms): the client speaks, the words travel, the translation types.
const SPEAK_END = 1500
const NODE_AT = 1250
const OUT_AT = 1500
const TYPE_AT = 1750
const TYPE_CPS = 0.035

// Geometry in a 100 × 100 box (the SVG is stretched to the container).
const NODE = { x: 58, y: 50 }
const path = (y: number) => `M 41 ${y} C 50 ${y}, 50 ${NODE.y}, ${NODE.x - 4} ${NODE.y}`
const OUT_PATH = `M ${NODE.x + 4} ${NODE.y} L 69 ${NODE.y}`

export function HeroFlow({ youSee, clientsSpeak }: { youSee: string; clientsSpeak: string }) {
  const { ref, t } = useLoop(LOOP, STEP * 0 + 3600)
  const step = Math.floor(t / STEP)
  const local = t % STEP
  const ci = step % CLIENTS.length
  const lang = LANGS[step % LANGS.length]
  const speaking = local < SPEAK_END
  const [typed, rest] = lettersOf(lang.tr[ci], (local - TYPE_AT) * TYPE_CPS)
  const nodeHot = local >= NODE_AT && local < NODE_AT + 900
  // A light dot travels along the active line, then from Minutama to you.
  const inP = Math.min(1, Math.max(0, local / 1250))
  const outP = Math.min(1, Math.max(0, (local - OUT_AT) / 350))

  return (
    <div ref={ref} className="relative aspect-[4/5] w-full select-none sm:aspect-[16/12]">
      {/* Lines */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <linearGradient id="flowLine" x1="0" x2="1">
            <stop offset="0" stopColor="#FF8F6B" stopOpacity=".15" />
            <stop offset="1" stopColor="#FF8F6B" stopOpacity=".9" />
          </linearGradient>
        </defs>
        {CLIENTS.map((c, i) => (
          <g key={c.initials}>
            <path d={path(c.y)} fill="none" stroke="rgba(255,255,255,.16)" strokeWidth="0.35" />
            <path
              d={path(c.y)}
              fill="none"
              stroke="url(#flowLine)"
              strokeWidth="0.7"
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray="1"
              strokeDashoffset={i === ci ? 1 - inP : 1}
              style={{ transition: i === ci ? 'none' : 'stroke-dashoffset .6s ease-out' }}
            />
          </g>
        ))}
        <path d={OUT_PATH} fill="none" stroke="rgba(255,255,255,.16)" strokeWidth="0.35" />
        <path
          d={OUT_PATH}
          fill="none"
          stroke="#FF8F6B"
          strokeWidth="0.7"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="1"
          strokeDashoffset={1 - outP}
        />
      </svg>

      {/* Clients (left) */}
      <div className="absolute left-0 top-0 h-full w-[41%]">
        <div className="absolute -top-1 left-0 text-[10.5px] font-semibold uppercase tracking-[.14em] text-t-3 sm:text-[11px]">{clientsSpeak}</div>
        {CLIENTS.map((c, i) => {
          const active = i === ci
          return (
            <div
              key={c.initials}
              className={`absolute left-0 right-1 -translate-y-1/2 rounded-2xl border px-2.5 py-2 transition-all duration-500 ease-out sm:px-3 sm:py-2.5 ${
                active ? 'border-accent/40 bg-white/[.07] shadow-[0_10px_30px_-12px_rgba(255,106,61,.45)]' : 'border-white/[.07] bg-white/[.03] opacity-60'
              }`}
              style={{ top: `${c.y}%` }}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[linear-gradient(135deg,#FFB088,#FF6A3D)] text-[9px] font-bold text-white transition-shadow duration-500 sm:h-7 sm:w-7 sm:text-[10px] ${
                    active && speaking ? 'shadow-[0_0_0_3px_rgba(34,197,94,.5)]' : ''
                  }`}
                >
                  {c.initials}
                </span>
                <span className="truncate text-[10px] text-t-3 sm:text-[11px]">{c.name}</span>
                <span className="ml-auto rounded bg-white/[.08] px-1 text-[9px] font-bold text-t-2">EN</span>
              </div>
              <div className="mt-1.5 text-[11.5px] font-medium leading-snug text-t-1 sm:text-[13px]">{c.en}</div>
            </div>
          )
        })}
      </div>

      {/* Minutama (middle) */}
      <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${NODE.x}%`, top: `${NODE.y}%` }}>
        <span
          className={`relative flex h-11 w-11 items-center justify-center rounded-[14px] bg-accent shadow-[0_10px_34px_-6px_rgba(255,106,61,.75)] transition-transform duration-500 ease-out sm:h-14 sm:w-14 ${
            nodeHot ? 'scale-110' : 'scale-100'
          }`}
        >
          <svg viewBox="0 0 32 32" className="h-7 w-7 sm:h-9 sm:w-9" aria-hidden="true">
            <rect x="7" y="9" width="3.4" height="14" rx="1.7" fill="#fff" />
            <rect x="12.2" y="13" width="3.4" height="8" rx="1.7" fill="#fff" />
            <rect x="16.4" y="13" width="3.4" height="8" rx="1.7" fill="#fff" />
            <rect x="21.6" y="9" width="3.4" height="14" rx="1.7" fill="#fff" />
          </svg>
        </span>
        <div className="absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold text-t-2 sm:text-[11px]">Minutama</div>
      </div>

      {/* You (right) */}
      <div className="absolute right-0 top-1/2 w-[31%] -translate-y-1/2">
        <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[.14em] text-t-3 sm:text-[11px]">{youSee}</div>
        <div className="glass-card rounded-2xl p-2.5 sm:p-3.5">
          <div className="flex items-center gap-1.5">
            <span key={lang.code} className="animate-rise rounded-md bg-accent/20 px-1.5 py-0.5 text-[10px] font-bold text-accent-hi">
              {lang.code}
            </span>
            <span key={lang.name} className="animate-rise truncate text-[10px] text-t-3 sm:text-[11px]">
              {lang.name}
            </span>
          </div>
          <div
            dir={lang.rtl ? 'rtl' : 'ltr'}
            className="mt-2 min-h-[4.2em] text-[12px] font-medium leading-snug text-[#8FD8F7] sm:text-[14px]"
          >
            {typed}
            <span className="invisible">{rest}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
