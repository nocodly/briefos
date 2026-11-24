import { supabase } from './supabaseClient'

// =============================================================================
// Minutama server API (Supabase Edge Functions). Every call carries the user's
// Supabase access token; the server checks plan + quotas. No AI provider keys
// ever live in the app.
// =============================================================================

const BASE = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message)
  }
  /** Quota / plan errors: retrying won't help, the user must upgrade. */
  get isPlanLimit(): boolean {
    return this.status === 402
  }
  /** Network or server hiccup: safe to retry. */
  get isRetryable(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500
  }
}

async function token(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const t = data.session?.access_token
  if (!t) throw new ApiError(401, 'unauthorized', 'Please sign in again.')
  return t
}

async function call<T>(fn: string, body: BodyInit, json: boolean): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await token()}`,
    apikey: ANON
  }
  if (json) headers['Content-Type'] = 'application/json'

  let res: Response
  try {
    res = await fetch(`${BASE}/${fn}`, { method: 'POST', headers, body })
  } catch {
    throw new ApiError(0, 'network', 'No connection to Minutama servers.')
  }

  const payload = (await res.json().catch(() => ({}))) as {
    error?: { code?: string; message?: string }
  } & T
  if (!res.ok) {
    throw new ApiError(
      res.status,
      payload.error?.code ?? 'http_' + res.status,
      payload.error?.message ?? `Request failed (${res.status}).`
    )
  }
  return payload as T
}

// ─── Endpoints ──────────────────────────────────────────────────────────────

export interface StartMeetingResult {
  meetingId: string
  tier: 'free' | 'pro'
  limits: {
    meetingsPerMonth: number | null
    maxMeetingMinutes: number
    historyDays: number | null
    templates: string[]
    proFeatures: boolean
  }
}

export function startMeeting(): Promise<StartMeetingResult> {
  return call<StartMeetingResult>('meeting-start', '{}', true)
}

export async function transcribeChunk(input: {
  meetingId: string
  channel: 'me' | 'them'
  blob: Blob
  durationSec: number
  prompt?: string
  language?: string
  /** The text came from live transcription: only meter the seconds. */
  countOnly?: boolean
}): Promise<string> {
  const form = new FormData()
  form.append('meetingId', input.meetingId)
  form.append('channel', input.channel)
  form.append('durationSec', String(Math.max(1, Math.min(60, Math.round(input.durationSec)))))
  if (input.prompt) form.append('prompt', input.prompt.slice(-400))
  if (input.language) form.append('language', input.language)
  if (input.countOnly) form.append('countOnly', '1')
  form.append('file', input.blob, `${input.channel}.webm`)
  const res = await call<{ text: string }>('transcribe-chunk', form, false)
  return res.text
}

export interface TranscriptLine {
  speaker: 'me' | 'them'
  startMs: number
  text: string
}

export interface EnhancedNotes {
  title: string
  notesMarkdown: string
  actionItems: { text: string; owner?: string; due?: string; dueDate?: string }[]
  decisions: string[]
}

export function enhanceNotes(input: {
  meetingId: string
  templateId: string
  userNotes: string
  transcript: TranscriptLine[]
  language?: string
  context?: string
  /** Language the client speaks — the follow-up email is written in it. */
  clientLanguage?: string
}): Promise<EnhancedNotes> {
  // The user's local date lets the AI turn "by Friday" into a real date.
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} (${d.toLocaleDateString('en-US', { weekday: 'long' })})`
  return call<EnhancedNotes>('enhance-notes', JSON.stringify({ ...input, today }), true)
}

// Mirrors supabase/functions/_shared/templates.ts (names only, for the picker).
export const TEMPLATE_OPTIONS: { id: string; name: string; pro: boolean }[] = [
  { id: 'client-call', name: 'Client call (brief, estimate, follow-up)', pro: false },
  { id: 'general', name: 'General meeting', pro: false },
  { id: 'one-on-one', name: '1:1', pro: false },
  { id: 'standup', name: 'Standup', pro: false },
  { id: 'sales-call', name: 'Sales call', pro: true },
  { id: 'interview', name: 'Job interview', pro: true },
  { id: 'customer-discovery', name: 'Customer discovery', pro: true }
]

export interface QuestionCardResult {
  question: string | null
  translation?: string | null
  term?: string | null
  termExplanation?: string | null
  answer?: string | null
  confidence?: number
  aiMs?: number
}

/** Live question card for the latest question from the client. */
export function suggestReply(input: {
  meetingId: string
  transcript: { speaker: 'me' | 'them'; text: string }[]
  userNotes: string
  nativeLanguage?: string
  context?: string
  answerHint?: boolean
}): Promise<QuestionCardResult> {
  return call<QuestionCardResult>('suggest-reply', JSON.stringify(input), true)
}

/**
 * "Ask AI" about a caption line: streams a short answer the user can use while
 * the call goes on. onText gets the answer so far. Shares the per-call quota
 * with question cards.
 */
export async function askAiStream(
  input: {
    meetingId: string
    line: string
    transcript: { speaker: 'me' | 'them'; text: string }[]
    messages?: { role: 'user' | 'assistant'; text: string }[]
    nativeLanguage?: string
    context?: string
  },
  onText: (soFar: string) => void,
  signal?: AbortSignal
): Promise<string> {
  let res: Response
  try {
    res = await fetch(`${BASE}/ask-ai`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await token()}`, apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new ApiError(0, 'network', 'No connection to Minutama servers.')
  }
  if (!res.ok || !res.body) {
    const payload = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } }
    throw new ApiError(res.status, payload.error?.code ?? 'ask_failed', payload.error?.message ?? 'AI could not answer right now.')
  }
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let text = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    text += dec.decode(value, { stream: true })
    if (text.trim()) onText(text.trim())
  }
  return text.trim()
}

/** Short-lived secret for the "Test call" with the AI client (OpenAI Realtime voice). */
export function demoCall(): Promise<{ secret: string; model: string }> {
  return call<{ secret: string; model: string }>('demo-call', '{}', true)
}

/** Stripe Customer Portal: cancel, switch plan, card, invoices. */
export function billingPortal(): Promise<{ url: string; login?: boolean }> {
  return call<{ url: string; login?: boolean }>('billing-portal', '{}', true)
}

/** Stripe Checkout with the price for the buyer's region (see functions/checkout). */
export function createCheckout(input: { kind: 'pro' | 'max' | 'topup'; country: string | null }): Promise<{ url: string }> {
  return call<{ url: string }>('checkout', JSON.stringify(input), true)
}

/** Short-lived secret for live transcription of the client's channel. */
export function liveSession(input: { meetingId: string; languages?: string[]; keywords?: string[] }): Promise<{ secret: string }> {
  return call<{ secret: string }>('live-session', JSON.stringify(input), true)
}

/** Translate one caption line into the user's language (null = already in it). */
export function translateLine(input: { meetingId: string; text: string; target: string; context?: string }): Promise<{ translation: string | null }> {
  return call<{ translation: string | null }>('translate-line', JSON.stringify(input), true)
}

/**
 * Streamed translation of a caption line: onText gets the translation so far
 * as it arrives (~0.5 s to the first words). Resolves to the full text, or
 * null when the line is already in the target language. Abort with `signal`.
 */
export async function translateLineStream(
  input: { meetingId: string; text: string; target: string; context?: string },
  onText: (soFar: string) => void,
  signal?: AbortSignal
): Promise<string | null> {
  const res = await fetch(`${BASE}/translate-line`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await token()}`, apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, stream: true }),
    signal
  })
  if (!res.ok || !res.body) throw new ApiError(res.status, 'translate_failed', 'Translation failed.')
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let text = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    text += dec.decode(value, { stream: true })
    const t = text.trim()
    if (t && t !== '-') onText(t)
  }
  const out = text.trim()
  return !out || out === '-' ? null : out
}
