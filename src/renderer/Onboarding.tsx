import { useState, useEffect } from 'react'
import { invoke } from './lib/ipc'
import { supabase } from './lib/supabaseClient'

// =============================================================================
// Onboarding — shown after auth + plan selection. Collects API keys and
// explains audio setup. On finish marks onboardingComplete in electron-store.
// =============================================================================

interface Props {
  onDone: () => void
}

export default function Onboarding({ onDone }: Props) {
  const [step, setStep] = useState(0)
  const [openaiKey, setOpenaiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [plan, setPlan] = useState<string>('trial')

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data } = await supabase.from('profiles').select('plan').eq('id', user.id).single()
      if (data?.plan) setPlan(data.plan)
    })
  }, [])

  const needsOwnKeys = plan === 'byok'

  const totalSteps = 2

  const finish = async () => {
    // BYOK plan — own API keys are required
    if (needsOwnKeys) {
      if (!openaiKey.trim()) {
        setError('OpenAI API key is required for the Free + Own Keys plan.')
        return
      }
      // Anthropic key no longer required — summarization runs on OpenAI
    }
    setSaving(true)
    setError('')
    try {
      await invoke('settings:set', { key: 'openaiApiKey', value: openaiKey.trim() })
      await invoke('settings:set', { key: 'onboardingComplete', value: true })
      onDone()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-8 font-body text-text">
      <div className="w-[520px] bg-surface border border-border-soft rounded-modal shadow-xl overflow-hidden animate-fade-up">
        {/* Header */}
        <div className="bg-blue-deep px-8 py-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 bg-accent rounded-md flex items-center justify-center">
              <i className="ti ti-broadcast text-[17px] text-white" />
            </div>
            <span className="font-display font-bold text-[15px] text-white">
              Brief<span className="text-[#7CB9FF]">OS</span>
            </span>
          </div>
          <div className="flex gap-1.5">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-all ${i <= step ? 'bg-accent' : 'bg-white/15'}`}
              />
            ))}
          </div>
        </div>

        <div className="p-8">
          {step === 0 && (
            <KeysStep
              openaiKey={openaiKey}
              setOpenaiKey={setOpenaiKey}

              plan={plan}
            />
          )}
          {step === 1 && <AudioStep />}

          {error && (
            <div className="mt-4 text-[12px] text-red bg-red-soft border border-red/20 rounded-lg px-3 py-2 flex items-center gap-1.5">
              <i className="ti ti-alert-circle text-[14px] flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="flex items-center justify-between mt-8">
            <button
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
              className="text-text-3 hover:text-text-2 hover:bg-bg-2 rounded-lg px-2.5 py-2 text-[12px] transition-all disabled:opacity-0"
            >
              <i className="ti ti-arrow-left text-[14px]" /> Back
            </button>

            {step < totalSteps - 1 ? (
              <button
                onClick={() => setStep((s) => s + 1)}
                className="bg-accent hover:bg-blue-mid text-white rounded-lg px-5 py-2.5 text-[13px] font-medium flex items-center gap-1.5 transition-all shadow-[0_2px_8px_rgba(26,86,219,.22)] active:scale-[.97]"
              >
                Continue <i className="ti ti-arrow-right text-[15px]" />
              </button>
            ) : (
              <button
                onClick={finish}
                disabled={saving}
                className="bg-accent hover:bg-blue-mid text-white rounded-lg px-5 py-2.5 text-[13px] font-medium flex items-center gap-1.5 transition-all shadow-[0_2px_8px_rgba(26,86,219,.22)] active:scale-[.97] disabled:opacity-60"
              >
                {saving ? (
                  <><i className="ti ti-loader-2 text-[15px] animate-spin-slow" /> Saving…</>
                ) : (
                  <><i className="ti ti-check text-[15px]" /> Finish setup</>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function KeysStep(props: {
  openaiKey: string; setOpenaiKey: (v: string) => void
  plan: string
}) {
  const isPro = props.plan === 'pro' || props.plan === 'enterprise'
  const isByok = props.plan === 'byok'

  return (
    <div className="animate-fade-up">
      <h2 className="font-display font-bold text-[18px] text-blue-deep mb-1">API keys</h2>

      {(isPro || props.plan === 'trial') && (
        <div className="flex items-center gap-2 text-[12px] text-green bg-green-soft border border-green/20 rounded-lg px-3 py-2 mb-4">
          <i className="ti ti-circle-check text-[15px]" />
          {props.plan === 'trial'
            ? 'Your first 10 meetings are on us — no API keys needed.'
            : "You're on Pro — API costs are covered by us. Key below is optional."}
        </div>
      )}
      {isByok && (
        <div className="flex items-start gap-2 text-[12px] bg-blue-tint border border-accent/20 rounded-lg px-3 py-2.5 mb-4">
          <i className="ti ti-info-circle text-[15px] text-accent mt-0.5" />
          <span className="text-text-2">
            Enter your OpenAI key — you pay OpenAI directly (~$0.20–0.50 per meeting). Stored encrypted on your device only.
          </span>
        </div>
      )}

      <div className="space-y-3.5">
        <KeyField
          label="OpenAI API key"
          hint={isByok ? 'Transcription + summaries — required' : 'Optional — override our default'}
          icon="key"
          required={isByok}
          value={props.openaiKey}
          onChange={props.setOpenaiKey}
          placeholder="sk-…"
        />
      </div>
    </div>
  )
}

function KeyField({
  label, hint, icon, value, onChange, placeholder, required
}: {
  label: string; hint: string; icon: string
  value: string; onChange: (v: string) => void
  placeholder: string; required?: boolean
}) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label className="flex items-center gap-1.5 text-[12px] font-medium text-text mb-1.5">
        <i className={`ti ti-${icon} text-[14px] text-accent`} />
        {label}
        <span className="text-text-3 font-normal">· {hint}</span>
        {required && <span className="text-red text-[10px]">*</span>}
      </label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full font-mono text-[12px] bg-bg border border-border rounded-lg px-3 py-2.5 pr-9 text-text placeholder:text-text-4 focus:border-accent focus:outline-none transition-all"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-3 hover:text-text-2"
        >
          <i className={`ti ti-${show ? 'eye-off' : 'eye'} text-[15px]`} />
        </button>
      </div>
    </div>
  )
}

function AudioStep() {
  return (
    <div className="animate-fade-up">
      <h2 className="font-display font-bold text-[18px] text-blue-deep mb-1">System audio setup</h2>
      <p className="text-[12px] text-text-3 mb-5">
        To capture what you hear on calls, BriefOS records a Windows loopback device.
      </p>
      <div className="bg-amber-soft border border-amber/20 rounded-panel p-4 mb-4">
        <div className="flex items-start gap-2.5">
          <i className="ti ti-info-circle text-[18px] text-amber mt-0.5" />
          <div>
            <div className="text-[13px] font-semibold text-text mb-1">Install a virtual audio device</div>
            <p className="text-[12px] text-text-2 leading-relaxed">
              Install <span className="font-medium">VB-Cable</span> (free) to capture all meeting participants.
              Pick your device later in <span className="font-medium">Settings → Audio</span>.
            </p>
          </div>
        </div>
      </div>
      <div className="bg-bg border border-border-soft rounded-card p-4 space-y-2">
        {[
          { icon: 'keyboard', text: 'Press Ctrl+Shift+B to start / stop recording from anywhere' },
          { icon: 'microphone', text: 'BriefOS records both system audio and your microphone' },
          { icon: 'file-text', text: 'After stopping, your brief is ready in ~30 seconds' }
        ].map((item) => (
          <div key={item.icon} className="flex items-center gap-2.5 text-[12px] text-text-2">
            <i className={`ti ti-${item.icon} text-[15px] text-accent flex-shrink-0`} />
            {item.text}
          </div>
        ))}
      </div>
    </div>
  )
}
