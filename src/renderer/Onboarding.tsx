import { useEffect, useRef, useState } from 'react'
import { invoke } from './lib/ipc'
import { LanguageFields, type LanguageValues } from './components/LanguageFields'
import { MEETING_LANGUAGES } from './recording/meetingSession'

// =============================================================================
// Onboarding — three steps, no API keys, no drivers:
//   1. What Minutama does (no bot, your notes + AI)
//   2. Your languages (your language for translations, the call language)
//   3. Allow the microphone (live level meter proves it works)
// =============================================================================

interface Props {
  onDone: () => void
}

export default function Onboarding({ onDone }: Props) {
  const [step, setStep] = useState(0)

  const finish = async () => {
    await invoke('settings:set', { key: 'onboardingComplete', value: true }).catch(() => {})
    onDone()
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 font-body">
      <div className="w-full max-w-[520px] glass-strong rounded-modal p-8 animate-fade-up">
        <div className="flex gap-1.5 mb-7">
          {[0, 1, 2].map((i) => (
            <div key={i} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-accent' : 'bg-border'}`} />
          ))}
        </div>

        {step === 0 ? <Welcome /> : step === 1 ? <LanguagesStep /> : <MicStep />}

        <div className="flex justify-between mt-8">
          <button
            onClick={() => setStep((n) => Math.max(0, n - 1))}
            disabled={step === 0}
            className="text-[13px] text-text-3 hover:text-text disabled:opacity-0"
          >
            Back
          </button>
          {step < 2 ? (
            <button
              onClick={() => setStep((n) => n + 1)}
              className="btn-accent rounded-lg px-5 py-2.5 text-[13px] font-semibold"
            >
              Continue
            </button>
          ) : (
            <button
              onClick={finish}
              className="btn-accent rounded-lg px-5 py-2.5 text-[13px] font-semibold"
            >
              Start using Minutama
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Welcome() {
  const points = [
    { icon: 'robot-off', title: 'No meeting bot', text: 'Minutama listens on your computer. Works with Zoom, Meet, Teams, Telegram, Slack — anything.' },
    { icon: 'pencil', title: 'Jot a few words', text: 'Write what matters to you during the call. Or nothing at all.' },
    { icon: 'sparkles', title: 'Get perfect notes', text: 'When the call ends, AI turns your notes + the conversation into clear notes and action items.' }
  ]
  return (
    <div>
      <h1 className="font-display font-extrabold text-[26px] text-text mb-2">Welcome to Minutama</h1>
      <p className="text-[14px] text-text-2 mb-6">AI notes for every meeting.</p>
      <div className="space-y-4">
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

function LanguagesStep() {
  const browser = (navigator.language || 'en').slice(0, 2).toLowerCase()
  const guess = MEETING_LANGUAGES.some((l) => l.code === browser) ? browser : ''
  const [v, setV] = useState<LanguageValues>({ nativeLanguage: guess, clientLanguage: 'en', myCallLanguage: '' })

  useEffect(() => {
    invoke<Partial<LanguageValues>>('settings:getAll')
      .then((all) => {
        const next = {
          nativeLanguage: all?.nativeLanguage || guess,
          clientLanguage: all?.clientLanguage || 'en',
          myCallLanguage: all?.myCallLanguage ?? ''
        }
        setV(next)
        // Save the guess so it is explicit from the start.
        if (!all?.nativeLanguage && guess) void invoke('settings:set', { key: 'nativeLanguage', value: guess }).catch(() => {})
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const change = <K extends keyof LanguageValues>(key: K, value: LanguageValues[K]) => {
    setV((prev) => ({ ...prev, [key]: value }))
    void invoke('settings:set', { key, value }).catch(() => {})
  }

  return (
    <div>
      <h1 className="font-display font-extrabold text-[24px] text-text mb-2">Your languages</h1>
      <p className="text-[14px] text-text-2 mb-5">
        Minutama shows what the client says in your language. You can change this any time in Settings.
      </p>
      <LanguageFields value={v} onChange={change} />
      <p className="mt-4 rounded-card border border-border-soft bg-white/[.04] px-3 py-2 text-[11.5px] leading-relaxed text-text-3">
        AI transcription and translation can contain mistakes. Always check important details — prices, dates,
        commitments — yourself.
      </p>
    </div>
  )
}

function MicStep() {
  const [state, setState] = useState<'idle' | 'on' | 'denied'>('idle')
  const [level, setLevel] = useState(0)
  const cleanup = useRef<() => void>(() => {})

  useEffect(() => () => cleanup.current(), [])

  const allow = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const ctx = new AudioContext()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      ctx.createMediaStreamSource(stream).connect(analyser)
      const buf = new Float32Array(new ArrayBuffer(analyser.fftSize * 4))
      const id = window.setInterval(() => {
        analyser.getFloatTimeDomainData(buf)
        let sum = 0
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
        setLevel(Math.sqrt(sum / buf.length))
      }, 100)
      cleanup.current = () => {
        window.clearInterval(id)
        stream.getTracks().forEach((t) => t.stop())
        void ctx.close()
      }
      setState('on')
    } catch {
      setState('denied')
    }
  }

  return (
    <div>
      <h1 className="font-display font-extrabold text-[24px] text-text mb-2">Allow your microphone</h1>
      <p className="text-[14px] text-text-2 mb-6">
        Minutama records your voice and your computer&apos;s audio only while you take notes. Audio is never stored.
      </p>
      {state === 'idle' && (
        <button
          onClick={allow}
          className="w-full border-2 border-dashed border-accent/40 rounded-panel py-6 text-accent font-semibold text-[14px] hover:bg-accent-soft transition-all"
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
            <div
              className="h-full bg-green rounded-full transition-all duration-100"
              style={{ width: `${Math.min(100, Math.sqrt(level) * 220)}%` }}
            />
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
    </div>
  )
}
