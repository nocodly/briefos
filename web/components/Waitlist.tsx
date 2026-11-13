'use client'

import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'

// Mac / mobile waitlist. Inserts into public.waitlist (insert-only RLS: the
// public key can add an email but never read the list).

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabase = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null

export function Waitlist({ platform = 'mac', compact = false }: { platform?: 'mac' | 'ios' | 'android'; compact?: boolean }) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase) {
      setState('error')
      return
    }
    setState('sending')
    const { error } = await supabase.from('waitlist').insert({ email: email.trim().toLowerCase(), platform })
    // 23505 = already on the list — that's a success for the visitor.
    if (error && error.code !== '23505') {
      console.error('[waitlist]', error.message)
      setState('error')
      return
    }
    setState('done')
  }

  if (state === 'done') {
    return (
      <p className="text-[14px] font-medium text-ink-2" role="status">
        ✓ You&apos;re on the list — we&apos;ll email you when the {platform === 'mac' ? 'Mac' : 'mobile'} app is ready.
      </p>
    )
  }

  return (
    <form onSubmit={submit} className={`flex w-full gap-2 ${compact ? 'max-w-sm' : 'max-w-md'}`}>
      <label htmlFor={`wl-${platform}`} className="sr-only">
        Email
      </label>
      <input
        id={`wl-${platform}`}
        type="email"
        required
        maxLength={200}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@company.com"
        className="min-w-0 flex-1 rounded-full border border-line bg-white px-4 py-2.5 text-[14px] outline-none focus:border-ink"
      />
      <button type="submit" disabled={state === 'sending'} className="btn-ghost !py-2.5 text-[14px] disabled:opacity-60">
        {state === 'sending' ? 'Joining…' : 'Notify me'}
      </button>
      {state === 'error' && (
        <span className="sr-only" role="alert">
          Something went wrong, please try again.
        </span>
      )}
    </form>
  )
}
