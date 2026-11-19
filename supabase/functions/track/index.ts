import { ApiError, adminClient, authenticate, json, serve } from '../_shared/http.ts'

// =============================================================================
// POST /track   { events: { name, props?, at? }[], appVersion?: string }
// Product usage events from the desktop app: funnel steps, question-card
// latency, errors. Never meeting content — the app sends only the fields below.
// =============================================================================

const ALLOWED = new Set([
  'app_open',
  'signup',
  'meeting_started',
  'meeting_finished',
  'notes_ready',
  'card_shown',
  'ask_ai',
  'checkout_opened',
  'portal_opened',
  'agent_task',
  'error'
])
const MAX_EVENTS = 50
const MAX_PROPS_CHARS = 1_500

serve(async (req) => {
  const auth = await authenticate(req)
  let body: { events?: { name?: string; props?: Record<string, unknown>; at?: number }[]; appVersion?: string }
  try {
    body = await req.json()
  } catch {
    throw new ApiError(400, 'bad_request', 'Expected JSON body.')
  }
  const version = String(body.appVersion ?? '').slice(0, 20) || null
  const now = Date.now()
  const rows = (Array.isArray(body.events) ? body.events : [])
    .slice(0, MAX_EVENTS)
    .filter((e) => e && ALLOWED.has(String(e.name)))
    .map((e) => {
      let props = e.props && typeof e.props === 'object' ? e.props : {}
      if (JSON.stringify(props).length > MAX_PROPS_CHARS) props = { truncated: true }
      // Client clocks drift; accept the client time only if it is within a day.
      const at = typeof e.at === 'number' && Math.abs(now - e.at) < 86_400_000 ? e.at : now
      return {
        user_id: auth.userId,
        name: String(e.name),
        props,
        app_version: version,
        created_at: new Date(at).toISOString()
      }
    })
  if (rows.length === 0) return json({ ok: true, stored: 0 })
  const { error } = await adminClient().from('app_events').insert(rows)
  if (error) throw new Error(`app_events insert failed: ${error.message}`)
  return json({ ok: true, stored: rows.length })
})
