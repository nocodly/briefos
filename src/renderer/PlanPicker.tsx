import { useState } from 'react'
import { supabase, updateProfile, type PlanType } from './lib/supabaseClient'
import { invoke } from './lib/ipc'

// =============================================================================
// PlanPicker — shown once after registration. 4 tiers:
//   trial   → 10 free meetings, we cover API costs, no pro features
//   byok    → unlimited meetings, own API keys, no pro features
//   pro     → paid, we cover API costs, all pro features
//   enterprise → custom
// =============================================================================

interface PlanDef {
  id: PlanType
  name: string
  price: string
  period?: string
  badge?: string
  badgeColor?: string
  description: string
  features: string[]
  cta: string
}

const PLANS: PlanDef[] = [
  {
    id: 'trial',
    name: 'Free Trial',
    price: '$0',
    badge: 'No card needed',
    badgeColor: 'bg-green-soft text-green',
    description: '10 meetings on us. No API keys required — just start recording.',
    features: [
      '10 meetings included',
      'AI transcription & summary',
      'All languages',
      'Clipboard export',
      'Full transcript'
    ],
    cta: 'Start for free'
  },
  {
    id: 'byok',
    name: 'Free + Own Keys',
    price: '$0',
    badge: 'All features',
    badgeColor: 'bg-blue-tint text-accent',
    description: 'Use your own OpenAI key (~$0.20–0.50/meeting). All features unlocked — exports, diarization, reports.',
    features: [
      'Unlimited meetings',
      'Your OpenAI key (Whisper + GPT-4o)',
      'Optional: Anthropic key for Claude',
      'PDF · Notion · Slack · Email exports',
      'Speaker diarization & Period Reports'
    ],
    cta: 'Use my own keys'
  }
]

interface Props {
  onDone: () => void
}

export default function PlanPicker({ onDone }: Props) {
  const [selected, setSelected] = useState<PlanType>('trial')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const confirm = async () => {
    setSaving(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      await updateProfile(user.id, { plan: selected })
      await invoke('settings:set', { key: 'plan', value: selected })
      onDone()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const plan = PLANS.find((p) => p.id === selected)!

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-6 font-body text-text">
      <div className="w-full max-w-[680px] animate-fade-up">
        <div className="text-center mb-7">
          <div className="w-12 h-12 bg-blue-tint rounded-2xl flex items-center justify-center mx-auto mb-4">
            <i className="ti ti-crown text-[24px] text-accent" />
          </div>
          <h1 className="font-display font-extrabold text-[26px] text-blue-deep">Choose your plan</h1>
          <p className="text-[13px] text-text-3 mt-1">You can change this anytime in Settings.</p>
        </div>

        {/* Plan grid */}
        <div className="grid grid-cols-1 gap-3 mb-5">
          {PLANS.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelected(p.id)}
              className={`text-left rounded-panel border-2 p-4 transition-all ${
                selected === p.id
                  ? 'border-accent bg-blue-tint shadow-[0_0_0_3px_rgba(26,86,219,.10)]'
                  : 'border-border-soft bg-surface hover:border-accent/40'
              }`}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-display font-bold text-[14px] text-blue-deep">{p.name}</span>
                  {p.badge && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${p.badgeColor}`}>
                      {p.badge}
                    </span>
                  )}
                </div>
                <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center mt-0.5 ${
                  selected === p.id ? 'border-accent bg-accent' : 'border-border'
                }`}>
                  {selected === p.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
              </div>

              {/* Price */}
              <div className="flex items-baseline gap-0.5 mb-1.5">
                <span className="font-display font-extrabold text-[20px] text-accent">{p.price}</span>
                {p.period && <span className="text-[12px] text-text-3">{p.period}</span>}
              </div>

              {/* Description */}
              <p className="text-[11px] text-text-3 mb-2.5 leading-relaxed">{p.description}</p>

              {/* Features */}
              <div className="space-y-1">
                {p.features.map((f) => (
                  <div key={f} className="flex items-center gap-1.5 text-[11px] text-text-2">
                    <i className="ti ti-check text-[11px] text-green flex-shrink-0" />{f}
                  </div>
                ))}
              </div>
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 text-[12px] text-red bg-red-soft border border-red/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <button
          onClick={confirm}
          disabled={saving}
          className="w-full bg-accent hover:bg-blue-mid text-white rounded-lg py-3 text-[14px] font-semibold flex items-center justify-center gap-2 transition-all shadow-[0_2px_10px_rgba(26,86,219,.28)] active:scale-[.98] disabled:opacity-60"
        >
          {saving ? (
            <><i className="ti ti-loader-2 animate-spin-slow text-[16px]" /> Saving…</>
          ) : (
            <><i className="ti ti-arrow-right text-[16px]" /> {plan.cta}</>
          )}
        </button>
      </div>
    </div>
  )
}
