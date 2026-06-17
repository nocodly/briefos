// =============================================================================
// Processing — full-screen modal shown while the pipeline runs (chunk →
// transcribe → diarize → summarize). App.tsx renders this on progress:* events
// and passes the latest human-readable step string. We infer the active stage
// from that string to drive the checklist.
// =============================================================================

interface Stage {
  key: string
  label: string
  icon: string
  /** Substrings that, when present in the step text, mark this stage active. */
  match: string[]
}

const STAGES: Stage[] = [
  { key: 'chunk', label: 'Splitting audio into chunks', icon: 'scissors', match: ['chunk', 'split'] },
  {
    key: 'transcribe',
    label: 'Transcribing with Whisper',
    icon: 'file-text',
    match: ['transcrib', 'whisper']
  },
  {
    key: 'diarize',
    label: 'Detecting speakers',
    icon: 'users',
    match: ['speaker', 'diariz']
  },
  {
    key: 'summary',
    label: 'Generating AI summary',
    icon: 'sparkles',
    match: ['summary', 'analyz', 'claude']
  }
]

function activeIndex(step: string): number {
  const s = (step || '').toLowerCase()
  for (let i = STAGES.length - 1; i >= 0; i--) {
    if (STAGES[i].match.some((m) => s.includes(m))) return i
  }
  return 0
}

export default function Processing({ step }: { step: string }) {
  const active = activeIndex(step)

  return (
    <div className="fixed inset-0 bg-blue-deep/60 backdrop-blur-sm z-50 flex items-center justify-center font-body">
      <div className="bg-surface rounded-modal p-9 w-[420px] shadow-2xl animate-fade-up">
        <div className="w-14 h-14 border-[3px] border-blue-pale border-t-accent rounded-full animate-spin-slow mx-auto mb-5" />
        <h2 className="font-display font-bold text-[20px] text-blue-deep text-center mb-1">
          Analyzing your meeting
        </h2>
        <p className="text-[12px] text-text-3 text-center mb-6 min-h-[18px]">
          {step || 'Preparing…'}
        </p>

        <div className="space-y-1.5">
          {STAGES.map((stage, i) => {
            const done = i < active
            const current = i === active
            return (
              <div
                key={stage.key}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-card border transition-all ${
                  current
                    ? 'border-accent/30 bg-blue-tint'
                    : done
                      ? 'border-border-soft bg-surface'
                      : 'border-border-soft bg-bg opacity-60'
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    done
                      ? 'bg-green-soft text-green'
                      : current
                        ? 'bg-accent text-white'
                        : 'bg-bg-2 text-text-3'
                  }`}
                >
                  {done ? (
                    <i className="ti ti-check text-[15px]" />
                  ) : current ? (
                    <i className="ti ti-loader-2 text-[15px] animate-spin-slow" />
                  ) : (
                    <i className={`ti ti-${stage.icon} text-[15px]`} />
                  )}
                </div>
                <span
                  className={`text-[13px] ${
                    current ? 'text-text font-medium' : done ? 'text-text-2' : 'text-text-3'
                  }`}
                >
                  {stage.label}
                </span>
              </div>
            )
          })}
        </div>

        <p className="text-[11px] text-text-4 text-center mt-6">
          Audio stays on your device — only text is sent to the APIs.
        </p>
      </div>
    </div>
  )
}
