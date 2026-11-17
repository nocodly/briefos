import { MEETING_LANGUAGES, nativeLanguageName } from '../recording/meetingSession'

// The three language choices, shared by onboarding, Settings and the Agent page:
//   - your language: translations go into it
//   - the client speaks: fixed for live captions of their side
//   - you speak on calls: fixed for live captions of your side
// Fixed languages stop the recognizer from guessing (and drifting).

export interface LanguageValues {
  nativeLanguage: string
  clientLanguage: string
  myCallLanguage: string
}

const OPTIONS = MEETING_LANGUAGES.filter((l) => l.code)
const selectCls =
  'w-full rounded-xl border border-border bg-white/[.06] px-3 py-2.5 text-[13px] text-text focus:border-accent focus:outline-none'

export function LanguageFields({
  value,
  onChange
}: {
  value: LanguageValues
  onChange: <K extends keyof LanguageValues>(key: K, v: LanguageValues[K]) => void
}) {
  return (
    <div className="space-y-3.5">
      <Field label="Your language" hint="Translations of what the client says appear in this language.">
        <select value={value.nativeLanguage} onChange={(e) => onChange('nativeLanguage', e.target.value)} className={selectCls}>
          <option value="">My Windows language ({nativeLanguageName('')})</option>
          {OPTIONS.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="The client speaks" hint="Usually English. Fixed, so other languages never slip in.">
        <select value={value.clientLanguage} onChange={(e) => onChange('clientLanguage', e.target.value)} className={selectCls}>
          {OPTIONS.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="You speak on calls" hint="Your own lines are shown but not translated.">
        <select value={value.myCallLanguage} onChange={(e) => onChange('myCallLanguage', e.target.value)} className={selectCls}>
          <option value="">Same as the client</option>
          {OPTIONS.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
            </option>
          ))}
        </select>
      </Field>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[12px] font-medium text-text">{label}</label>
      {children}
      <p className="mt-1 text-[11px] text-text-3">{hint}</p>
    </div>
  )
}
