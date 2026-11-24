import { useEffect, useState } from 'react'
import { Page } from './components/Page'
import { sendFeedback } from './lib/api'
import { supabase } from './lib/supabaseClient'

// =============================================================================
// Feedback — "Help us improve Minutama": name, 1–5 stars, a message. Goes to
// the team by email (functions/feedback) and is stored for the roadmap.
// =============================================================================

const VERSION = (import.meta.env.VITE_APP_VERSION as string) || ''
const IDEAS = [
  'The text is too fast, I can’t keep up',
  'Everything works great!',
  'The translation is sometimes wrong',
  'I’d love a feature: …'
]

export default function FeedbackPage() {
  const [name, setName] = useState('')
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [message, setMessage] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const meta = data.user?.user_metadata as { full_name?: string; name?: string } | undefined
      setName((n) => n || meta?.full_name || meta?.name || '')
    })
  }, [])

  const send = async () => {
    if (message.trim().length < 2) {
      setError('Write a few words first.')
      return
    }
    setError(null)
    setState('sending')
    try {
      await sendFeedback({ name: name.trim(), rating: rating || undefined, message: message.trim(), appVersion: VERSION })
      setState('sent')
    } catch (err) {
      setError((err as Error).message)
      setState('idle')
    }
  }

  if (state === 'sent') {
    return (
      <Page title="Feedback" subtitle="Help us improve Minutama.">
        <div className="glass rounded-panel p-10 text-center animate-fade-up">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-soft">
            <i className="ti ti-check text-[22px] text-green" />
          </div>
          <div className="font-display text-[18px] font-bold">Thank you!</div>
          <p className="mt-1 text-[13px] text-text-3">We read every message. If you left your email in your account, we may reply.</p>
          <button
            onClick={() => {
              setMessage('')
              setRating(0)
              setState('idle')
            }}
            className="mt-5 rounded-lg border border-border px-4 py-2 text-[12.5px] text-text-2 hover:text-text"
          >
            Send another
          </button>
        </div>
      </Page>
    )
  }

  return (
    <Page title="Feedback" subtitle="Help us improve Minutama — tell us what works and what gets in your way.">
      <div className="glass space-y-5 rounded-panel p-6">
        <div>
          <label className="mb-1.5 block text-[12px] font-medium text-text">How do you like Minutama?</label>
          <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setRating(n)}
                onMouseEnter={() => setHover(n)}
                aria-label={`${n} star${n > 1 ? 's' : ''}`}
                className="p-0.5 transition-transform hover:scale-110"
              >
                <i className={`ti ti-star${(hover || rating) >= n ? '-filled' : ''} text-[26px] ${(hover || rating) >= n ? 'text-amber' : 'text-text-4'}`} />
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-[12px] font-medium text-text">Your name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Anna"
            className="w-full rounded-xl border border-border bg-white/[.06] px-3 py-2.5 text-[13px] text-text placeholder:text-text-4 focus:border-accent focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-[12px] font-medium text-text">Message</label>
          <textarea
            value={message}
            onChange={(e) => {
              setMessage(e.target.value)
              setError(null)
            }}
            rows={6}
            placeholder="For example: the text is too fast, I can't keep up — or: everything works great, I love it!"
            className="w-full resize-y rounded-xl border border-border bg-white/[.06] px-3 py-2.5 text-[13px] leading-relaxed text-text placeholder:text-text-4 focus:border-accent focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {IDEAS.map((idea) => (
              <button
                key={idea}
                onClick={() => setMessage((m) => (m.trim() ? `${m.trim()}\n${idea}` : idea))}
                className="rounded-full border border-border px-2.5 py-1 text-[11.5px] text-text-3 hover:border-accent/50 hover:text-text"
              >
                {idea}
              </button>
            ))}
          </div>
          {error && <p className="mt-2 text-[12px] text-red">{error}</p>}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[11.5px] text-text-3">Goes straight to the Minutama team.</span>
          <button
            onClick={() => void send()}
            disabled={state === 'sending'}
            className="btn-accent flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-[13px] font-semibold disabled:opacity-60"
          >
            <i className={`ti ti-${state === 'sending' ? 'loader-2 animate-spin-slow' : 'send'} text-[14px]`} />
            {state === 'sending' ? 'Sending…' : 'Send feedback'}
          </button>
        </div>
      </div>
    </Page>
  )
}
