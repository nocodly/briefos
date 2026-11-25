import { useEffect, useRef, useState } from 'react'
import { invoke } from './lib/ipc'
import { LanguageFields, type LanguageValues } from './components/LanguageFields'
import { detectSystemLanguage } from './lib/systemLanguage'

// =============================================================================
// Onboarding — three simple steps, each one thing the user will do:
//   1. Start recording   — allow the mic (live level proves it works)
//   2. Ask AI on a call   — live captions + translation, "Ask AI" on any line;
//                           pick your language here
//   3. Get the result     — notes, tasks with dates → calendar, follow-up email;
//                           recordings from elsewhere can be imported
// =============================================================================

interface Props {
  onDone: () => void
}

const STEPS = ['Start recording', 'Ask AI on the call', 'Get the result']

export default function Onboarding({ onDone }: Props) {
  // Survives a window reload: you continue on the same step.
  const [step, setStepState] = useState(() => {
    try {
      return Math.min(2, Math.max(0, Number(sessionStorage.getItem('onboardingStep')) || 0))
    } catch {
      return 0
    }
  })
  const setStep = (next: number | ((n: number) => number)) =>
    setStepState((cur) => {
      const v = typeof next === 'function' ? next(cur) : next
      try {
        sessionStorage.setItem('onboardingStep', String(v))
      } catch {
        /* storage off */
      }
      return v
    })

  const finish = async () => {
    await invoke('settings:set', { key: 'onboardingComplete', value: true }).catch(() => {})
    onDone()
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 font-body">
      <div className="w-full max-w-[560px] glass-strong rounded-modal p-8 animate-fade-up">
        <div className="mb-7 grid grid-cols-3 gap-2">
          {STEPS.map((label, i) => (
            <button key={label} onClick={() => setStep(i)} className="text-left">
              <div className={`h-1 rounded-full ${i <= step ? 'bg-accent' : 'bg-border'}`} />
              <div className={`mt-2 text-[11px] font-semibold ${i === step ? 'text-text' : 'text-text-3'}`}>
                {i + 1}. {label}
              </div>
            </button>
          ))}
        </div>

        {step === 0 ? <RecordStep /> : step === 1 ? <AskStep /> : <ResultStep />}

        <div className="flex justify-between mt-8">
          <button
            onClick={() => setStep((n) => Math.max(0, n - 1))}
            disabled={step === 0}
            className="text-[13px] text-text-3 hover:text-text disabled:opacity-0"
          >
            Back
          </button>
          {step < 2 ? (
            <button onClick={() => setStep((n) => n + 1)} className="btn-accent rounded-lg px-5 py-2.5 text-[13px] font-semibold">
              Next
            </button>
          ) : (
            <button onClick={finish} className="btn-accent rounded-lg px-5 py-2.5 text-[13px] font-semibold">
              Start using Minutama
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function StepTitle({ n, title, text }: { n: number; title: string; text: string }) {
  return (
    <div className="mb-5">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[.12em] text-accent">Step {n} of 3</div>
      <h1 className="font-display font-extrabold text-[24px] text-text mb-1.5">{title}</h1>
      <p className="text-[14px] leading-relaxed text-text-2">{text}</p>
    </div>
  )
}

// ── 1. Start recording ──────────────────────────────────────────────────────

function RecordStep() {
  const [state, setState] = useState<'idle' | 'on' | 'denied'>('idle')
  const [level, setLevel] = useState(0)
  const cleanup = useRef<() => void>(() => {})

  useEffect(() => () => cleanup.current(), [])

  // Mic level without an AudioContext: the Web Audio graph made the window
  // crash and reload right after "Allow microphone" on some PCs. Frames are
  // read straight from the track (the same way live captions do it).
  const allow = async () => {
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false }
      })
    } catch {
      setState('denied')
      return
    }
    setState('on')
    let stopped = false
    cleanup.current = () => {
      stopped = true
      stream.getTracks().forEach((t) => t.stop())
    }
    type Frame = { numberOfFrames: number; copyTo: (d: Float32Array, o: { planeIndex: number; format?: string }) => void; close: () => void }
    const Processor = (window as unknown as {
      MediaStreamTrackProcessor?: new (o: { track: MediaStreamTrack }) => { readable: ReadableStream<Frame> }
    }).MediaStreamTrackProcessor
    const track = stream.getAudioTracks()[0]
    if (!Processor || !track) return // permission works; just no level meter
    const reader = new Processor({ track }).readable.getReader()
    let buf = new Float32Array(0)
    let last = 0
    try {
      while (!stopped) {
        const { value, done } = await reader.read()
        if (done || !value) break
        try {
          if (buf.length !== value.numberOfFrames) buf = new Float32Array(value.numberOfFrames)
          value.copyTo(buf, { planeIndex: 0, format: 'f32-planar' })
        } catch {
          /* unsupported format: skip this frame */
        } finally {
          value.close()
        }
        const now = performance.now()
        if (now - last > 90) {
          last = now
          let sum = 0
          for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
          setLevel(Math.sqrt(sum / Math.max(1, buf.length)))
        }
      }
    } catch {
      /* stopped */
    } finally {
      void reader.cancel().catch(() => {})
    }
  }

  return (
    <div>
      <StepTitle
        n={1}
        title="Start recording"
        text="Join your call in Zoom, Meet, Teams or any app. Minutama asks “Start notes?” — or press Start call. No bot joins the call."
      />
      <div className="mb-5 flex items-center gap-2 rounded-card border border-border bg-white/[.04] px-3 py-2.5 text-[12.5px] text-text-2">
        <i className="ti ti-keyboard text-[16px] text-accent" /> Shortcut: <span className="font-mono text-text">Ctrl + Shift + B</span>
      </div>
      {state === 'idle' && (
        <button
          onClick={allow}
          className="w-full border-2 border-dashed border-accent/40 rounded-panel py-5 text-accent font-semibold text-[14px] hover:bg-accent-soft transition-all"
        >
          <i className="ti ti-microphone text-[18px]" /> Allow microphone
        </button>
      )}
      {state === 'on' && (
        <div className="bg-green-soft border border-green/20 rounded-panel p-4">
          <div className="text-[13px] text-green font-semibold mb-2">
            <i className="ti ti-circle-check" /> Microphone works — say something
          </div>
          <div className="h-2 bg-surface rounded-full overflow-hidden">
            <div className="h-full bg-green rounded-full transition-all duration-100" style={{ width: `${Math.min(100, Math.sqrt(level) * 220)}%` }} />
          </div>
        </div>
      )}
      {state === 'denied' && (
        <div className="bg-red-soft border border-red/20 rounded-panel p-4 text-[13px] text-red">
          Microphone access is blocked. Open Windows Settings → Privacy &amp; security → Microphone and allow desktop apps,
          then try again.
          <button onClick={allow} className="block mt-2 underline">
            Try again
          </button>
        </div>
      )}
      <div className="mt-4 flex items-start gap-2.5 rounded-card border border-accent/30 bg-accent-soft px-3 py-2.5 text-[12.5px] leading-relaxed text-text-2">
        <i className="ti ti-headset mt-0.5 text-[16px] text-accent" />
        <span>
          No call today? After setup press <b className="text-text">Test call</b> — a short practice call with an AI
          client, so you see everything work first.
        </span>
      </div>
      <p className="mt-3 text-[11.5px] text-text-3">Tip: headphones give the cleanest captions.</p>
    </div>
  )
}

// ── 2. Ask AI on the call ───────────────────────────────────────────────────

function AskStep() {
  const [v, setV] = useState<LanguageValues>({ nativeLanguage: 'en', clientLanguage: 'en', myCallLanguage: '' })

  useEffect(() => {
    // "Your language" = your Windows language, preselected and saved.
    void Promise.all([invoke<Partial<LanguageValues>>('settings:getAll').catch(() => null), detectSystemLanguage()]).then(
      ([all, sys]) => {
        const native = all?.nativeLanguage || sys
        setV({ nativeLanguage: native, clientLanguage: all?.clientLanguage || 'en', myCallLanguage: all?.myCallLanguage ?? '' })
        if (!all?.nativeLanguage) void invoke('settings:set', { key: 'nativeLanguage', value: native }).catch(() => {})
      }
    )
  }, [])

  const change = <K extends keyof LanguageValues>(key: K, value: LanguageValues[K]) => {
    setV((prev) => ({ ...prev, [key]: value }))
    void invoke('settings:set', { key, value }).catch(() => {})
  }

  return (
    <div>
      <StepTitle
        n={2}
        title="Ask AI during the call"
        text="The capsule shows what the client says, translated into your language. Hover any line and click Ask AI — the answer appears next to it while you keep talking."
      />
      <CapsulePreview lang={v.nativeLanguage} />
      <div className="mt-5">
        <LanguageFields value={v} onChange={change} compact />
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-text-3">
        AI transcription and translation can contain mistakes. Check prices, dates and commitments yourself.
      </p>
    </div>
  )
}

// The preview shows the translation in the language you picked.
const PREVIEW: Record<string, [string, string]> = {
  uk: ['Яка ваша оцінка MVP — фіксована ціна чи погодинно?', 'Він питає про оцінку й формат оплати. Скажи:'],
  ru: ['Какая ваша оценка MVP — фиксированная цена или почасовая?', 'Он спрашивает об оценке и формате оплаты. Скажи:'],
  de: ['Wie hoch ist Ihre Schätzung für das MVP – Festpreis oder stundenweise?', 'Er fragt nach deiner Schätzung und der Abrechnung. Sag:'],
  pl: ['Jaka jest Twoja wycena MVP — stała cena czy godzinowo?', 'Pyta o wycenę i formę rozliczenia. Powiedz:'],
  es: ['¿Cuál es tu estimación para el MVP: precio fijo o por hora?', 'Pregunta por tu estimación y la forma de pago. Di:'],
  fr: ['Quelle est votre estimation pour le MVP : prix fixe ou à l’heure ?', 'Il demande ton estimation et le mode de paiement. Dis :'],
  it: ['Qual è la tua stima per l’MVP: prezzo fisso o a ore?', 'Chiede la tua stima e il tipo di pagamento. Di’:'],
  pt: ['Qual é a sua estimativa para o MVP: preço fixo ou por hora?', 'Ele pergunta sua estimativa e a forma de pagamento. Diga:'],
  hi: ['MVP के लिए आपका अनुमान क्या है — फिक्स्ड प्राइस या प्रति घंटा?', 'वह आपके अनुमान और भुगतान के तरीके के बारे में पूछ रहा है। कहें:'],
  bn: ['MVP-র জন্য আপনার অনুমান কত — নির্দিষ্ট দাম নাকি ঘণ্টা হিসেবে?', 'তিনি আপনার অনুমান ও পেমেন্টের ধরন জানতে চাইছেন। বলুন:'],
  ur: ['MVP کے لیے آپ کا اندازہ کیا ہے — مقررہ قیمت یا فی گھنٹہ؟', 'وہ آپ کے اندازے اور ادائیگی کے طریقے کے بارے میں پوچھ رہے ہیں۔ کہیں:'],
  tl: ['Magkano ang tantya mo para sa MVP — fixed price o kada oras?', 'Tinatanong niya ang tantya mo at paraan ng bayad. Sabihin:'],
  id: ['Berapa perkiraan Anda untuk MVP — harga tetap atau per jam?', 'Dia menanyakan perkiraan dan cara pembayaran. Katakan:'],
  vi: ['Ước tính của bạn cho MVP là bao nhiêu — giá cố định hay theo giờ?', 'Anh ấy hỏi về ước tính và cách thanh toán. Hãy nói:'],
  tr: ['MVP için tahmininiz nedir — sabit fiyat mı, saatlik mi?', 'Tahminini ve ödeme şeklini soruyor. Şöyle de:'],
  ar: ['ما تقديرك لـ MVP — سعر ثابت أم بالساعة؟', 'يسأل عن تقديرك وطريقة الدفع. قل:'],
  ro: ['Care este estimarea ta pentru MVP — preț fix sau pe oră?', 'Întreabă de estimare și modul de plată. Spune:'],
  en: ['', 'They’re asking for your estimate and how you charge. Say:']
}

function CapsulePreview({ lang }: { lang: string }) {
  const [tr, hint] = PREVIEW[lang] ?? PREVIEW.en
  return (
    <div className="flex gap-2 rounded-[16px] border border-white/[.09] bg-[#121317] p-2.5" aria-hidden="true">
      <div className="min-w-0 flex-1 rounded-[12px] border border-white/[.08] bg-white/[.035] px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[9.5px] font-semibold uppercase tracking-[.12em] text-accent-pale">Client</span>
          <span className="ml-auto flex items-center gap-1 rounded-full border border-accent/40 bg-accent/15 px-1.5 py-0.5 text-[9.5px] font-semibold text-accent-pale">
            <i className="ti ti-sparkles text-[10px]" /> Ask AI
          </span>
        </div>
        <div className="mt-1 text-[12px] leading-snug text-white/80">What’s your estimate for the MVP — fixed price or hourly?</div>
        {tr && (
          <div className="mt-1.5 border-l-2 border-[#5EC8F2]/60 pl-2 text-[12px] font-medium leading-snug text-[#BFE9FF]">{tr}</div>
        )}
      </div>
      <div className="w-[42%] flex-none rounded-[12px] border border-accent/30 bg-[#1A1210]/60 px-3 py-2.5">
        <div className="flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-[.1em] text-accent-pale">
          <i className="ti ti-sparkles text-[10px]" /> Ask AI
        </div>
        <div className="mt-1 text-[11px] leading-snug text-white/85">
          {hint} “About 2–3 weeks, fixed price per milestone.”
        </div>
      </div>
    </div>
  )
}

// ── 3. Get the result ───────────────────────────────────────────────────────

function ResultStep() {
  const points = [
    { icon: 'file-text', title: 'Notes and a client brief', text: 'What the client wants, budget, deadlines and open points — ready when the call ends.' },
    { icon: 'calendar-plus', title: 'Tasks with dates', text: '“Send the estimate by Friday” becomes a task — add it to your calendar in one click.' },
    { icon: 'mail', title: 'Follow-up email', text: 'A short recap to send the client, in the language of the call.' },
    { icon: 'upload', title: 'Import other calls', text: 'Have a transcript from Zoom, Teams or Google Meet? Import it and get the same notes.' }
  ]
  return (
    <div>
      <StepTitle n={3} title="Get the result of the call" text="Press Stop when the call ends. Minutama writes everything up for you." />
      <div className="space-y-3.5">
        {points.map((p) => (
          <div key={p.title} className="flex gap-3">
            <div className="w-9 h-9 rounded-card bg-accent-soft flex items-center justify-center flex-shrink-0">
              <i className={`ti ti-${p.icon} text-[18px] text-accent`} />
            </div>
            <div>
              <div className="text-[14px] font-semibold text-text">{p.title}</div>
              <div className="text-[13px] text-text-3 leading-relaxed">{p.text}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
