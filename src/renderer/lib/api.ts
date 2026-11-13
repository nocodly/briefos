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
}): Promise<string> {
  const form = new FormData()
  form.append('meetingId', input.meetingId)
  form.append('channel', input.channel)
  form.append('durationSec', String(Math.max(1, Math.min(60, Math.round(input.durationSec)))))
  if (input.prompt) form.append('prompt', input.prompt.slice(-400))
  if (input.language) form.append('language', input.language)
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
  actionItems: { text: string; owner?: string; due?: string }[]
  decisions: string[]
}

export function enhanceNotes(input: {
  meetingId: string
  templateId: string
  userNotes: string
  transcript: TranscriptLine[]
  language?: string
}): Promise<EnhancedNotes> {
  return call<EnhancedNotes>('enhance-notes', JSON.stringify(input), true)
}

// Mirrors supabase/functions/_shared/templates.ts (names only, for the picker).
export const TEMPLATE_OPTIONS: { id: string; name: string; pro: boolean }[] = [
  { id: 'general', name: 'General meeting', pro: false },
  { id: 'one-on-one', name: '1:1', pro: false },
  { id: 'standup', name: 'Standup', pro: false },
  { id: 'sales-call', name: 'Sales call', pro: true },
  { id: 'interview', name: 'Job interview', pro: true },
  { id: 'customer-discovery', name: 'Customer discovery', pro: true }
]

export interface ReplySuggestion {
  question: string | null
  answer?: string
}

/** Live "what do I say?" hint for the latest question from the other side. */
export function suggestReply(input: {
  meetingId: string
  transcript: { speaker: 'me' | 'them'; text: string }[]
  userNotes: string
}): Promise<ReplySuggestion> {
  return call<ReplySuggestion>('suggest-reply', JSON.stringify(input), true)
}
