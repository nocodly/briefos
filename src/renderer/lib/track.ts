import { supabase } from './supabaseClient'

// =============================================================================
// Product usage events → /track (see supabase/functions/track). Funnel steps,
// question-card latency and errors only — never meeting content. Events are
// batched and sent every few seconds; failures are dropped silently.
// =============================================================================

type EventName =
  | 'app_open'
  | 'signup'
  | 'meeting_started'
  | 'meeting_finished'
  | 'notes_ready'
  | 'card_shown'
  | 'checkout_opened'
  | 'portal_opened'
  | 'agent_task'
  | 'error'

const BASE = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/track`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string
const VERSION = (import.meta.env.VITE_APP_VERSION as string) || ''

let queue: { name: EventName; props: Record<string, unknown>; at: number }[] = []
let timer: ReturnType<typeof setTimeout> | null = null
let errorsSent = 0

export function track(name: EventName, props: Record<string, unknown> = {}): void {
  queue.push({ name, props, at: Date.now() })
  if (queue.length >= 20) void flush()
  else if (!timer) timer = setTimeout(() => void flush(), 5_000)
}

async function flush(): Promise<void> {
  if (timer) clearTimeout(timer)
  timer = null
  if (queue.length === 0) return
  const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }))
  const token = data.session?.access_token
  if (!token) return // keep events until the user is signed in
  const events = queue.splice(0, 50)
  try {
    await fetch(BASE, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ events, appVersion: VERSION })
    })
  } catch {
    /* offline — drop */
  }
  if (queue.length) timer = setTimeout(() => void flush(), 5_000)
}

/** Report uncaught errors (message + where, capped per session). */
export function installErrorTracking(where: string): void {
  const report = (message: string) => {
    if (errorsSent >= 20) return
    errorsSent++
    track('error', { where, message: message.slice(0, 300) })
  }
  window.addEventListener('error', (e) => report(String(e.message || e.error)))
  window.addEventListener('unhandledrejection', (e) => report(String((e.reason as Error)?.message ?? e.reason)))
}
