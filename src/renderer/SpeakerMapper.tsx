import { useState } from 'react'
import { invoke } from './lib/ipc'

// =============================================================================
// SpeakerMapper — shown after recording stops (user flow step 6). Receives the
// detected speaker labels (SPEAKER_00, …) and lets the user assign real names,
// persisted via meetings:renameSpeakers before the summary is generated.
// =============================================================================

export interface SpeakerMapperProps {
  meetingId: string
  /** Distinct diarized labels, e.g. ['SPEAKER_00', 'SPEAKER_01']. */
  speakers: string[]
  /** Called after names are saved (or skipped) to continue to summary. */
  onComplete: () => void
}

// Stable color per speaker index (design-system accent family).
const AVATAR_COLORS = [
  'bg-accent',
  'bg-green',
  'bg-amber',
  'bg-purple',
  'bg-[#1B4F8A]',
  'bg-[#0EA874]'
]

function prettyLabel(label: string): string {
  // 'SPEAKER_00' → 'Speaker 1'
  const m = label.match(/(\d+)/)
  return m ? `Speaker ${parseInt(m[1], 10) + 1}` : label
}

export default function SpeakerMapper({ meetingId, speakers, onComplete }: SpeakerMapperProps) {
  const [names, setNames] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const setName = (label: string, value: string) =>
    setNames((prev) => ({ ...prev, [label]: value }))

  const save = async (skip: boolean) => {
    setSaving(true)
    setError('')
    try {
      if (!skip) {
        const mapping: Record<string, string> = {}
        for (const label of speakers) {
          const entered = (names[label] || '').trim()
          if (entered) mapping[label] = entered
        }
        if (Object.keys(mapping).length > 0) {
          await invoke('meetings:renameSpeakers', { meetingId, mapping })
        }
      }
      onComplete()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-blue-deep/60 backdrop-blur-sm z-50 flex items-center justify-center font-body p-8">
      <div className="bg-surface rounded-modal w-[480px] shadow-2xl animate-fade-up overflow-hidden">
        <div className="px-7 pt-7 pb-5">
          <div className="w-11 h-11 rounded-panel bg-blue-tint flex items-center justify-center mb-3">
            <i className="ti ti-users text-[22px] text-accent" />
          </div>
          <h2 className="font-display font-bold text-[20px] text-blue-deep mb-1">
            Who was on the call?
          </h2>
          <p className="text-[12px] text-text-3">
            We detected {speakers.length} {speakers.length === 1 ? 'voice' : 'voices'}. Add names so
            your brief reads clearly — or skip to use generic labels.
          </p>
        </div>

        <div className="px-7 pb-2 space-y-2.5 max-h-[340px] overflow-auto">
          {speakers.map((label, i) => (
            <div key={label} className="flex items-center gap-3">
              <div
                className={`w-9 h-9 rounded-full ${
                  AVATAR_COLORS[i % AVATAR_COLORS.length]
                } flex items-center justify-center flex-shrink-0`}
              >
                <span className="text-white font-display font-bold text-[13px]">{i + 1}</span>
              </div>
              <input
                value={names[label] ?? ''}
                onChange={(e) => setName(label, e.target.value)}
                placeholder={prettyLabel(label)}
                className="flex-1 text-[13px] bg-bg border border-border rounded-lg px-3 py-2.5 text-text placeholder:text-text-4 focus:border-accent focus:outline-none transition-all"
              />
            </div>
          ))}
        </div>

        {error && (
          <div className="mx-7 mt-2 text-[12px] text-red bg-red-soft border border-red/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between px-7 py-5 mt-3 border-t border-border-soft bg-bg">
          <button
            onClick={() => save(true)}
            disabled={saving}
            className="text-text-3 hover:text-text-2 hover:bg-bg-2 rounded-lg px-3 py-2 text-[12px] transition-all disabled:opacity-50"
          >
            Skip
          </button>
          <button
            onClick={() => save(false)}
            disabled={saving}
            className="bg-accent hover:bg-blue-mid text-white rounded-lg px-5 py-2.5 text-[13px] font-medium flex items-center gap-1.5 transition-all shadow-[0_2px_8px_rgba(26,86,219,.22)] active:scale-[.97] disabled:opacity-60"
          >
            {saving ? (
              <>
                <i className="ti ti-loader-2 text-[15px] animate-spin-slow" /> Saving…
              </>
            ) : (
              <>
                <i className="ti ti-sparkles text-[15px]" /> Save & generate summary
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
