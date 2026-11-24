import { ApiError, adminClient, authenticate, corsHeaders, json, requireEnv, serve } from '../_shared/http.ts'

// =============================================================================
// POST /translate-line   { meetingId, text, target, context?, stream? }
// → { translation: string | null }            (default)
// → text/plain stream of the translation       (stream: true; "-" = no translation needed)
//
// Live captions: the client's words are translated into the user's language
// while they are still speaking. Streaming + a fast model: the first words of
// the translation arrive ~0.5 s after the request.
// =============================================================================

const MODEL = Deno.env.get('TRANSLATE_MODEL') ?? 'gpt-4.1-mini'

// Warm-instance caches: skip the auth + ownership round-trips on every line.
const owned = new Map<string, string>() // meetingId → userId
let usePriority = (Deno.env.get('TRANSLATE_PRIORITY') ?? 'on') !== 'off'
const tokens = new Map<string, { userId: string; until: number }>()

async function userIdFor(req: Request): Promise<string> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '')
  const hit = tokens.get(token)
  if (hit && hit.until > Date.now()) return hit.userId
  const auth = await authenticate(req)
  tokens.set(token, { userId: auth.userId, until: Date.now() + 5 * 60_000 })
  if (tokens.size > 5000) tokens.clear()
  return auth.userId
}

serve(async (req) => {
  const userId = await userIdFor(req)
  let body: { meetingId?: string; text?: string; target?: string; context?: string; stream?: boolean }
  try {
    body = await req.json()
  } catch {
    throw new ApiError(400, 'bad_request', 'Expected JSON body.')
  }
  const meetingId = String(body.meetingId ?? '')
  const text = String(body.text ?? '').trim().slice(0, 800)
  const target = String(body.target ?? '').trim().slice(0, 30)
  if (!meetingId || !text || !target) throw new ApiError(400, 'bad_request', 'meetingId, text and target are required.')

  if (owned.get(meetingId) !== userId) {
    const { data } = await adminClient()
      .from('meeting_sessions')
      .select('id')
      .eq('id', meetingId)
      .eq('user_id', userId)
      .maybeSingle()
    if (!data) throw new ApiError(404, 'meeting_not_found', 'This meeting was not found.')
    owned.set(meetingId, userId)
  }

  // Priority processing: lower, steadier latency for the live translation (a
  // sentence costs fractions of a cent either way). Falls back to the default
  // tier if the account or model doesn't support it.
  const call = (priority: boolean) =>
    fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${requireEnv('OPENAI_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      max_tokens: 400,
      ...(priority ? { service_tier: 'priority' } : {}),
      stream: Boolean(body.stream),
      messages: [
        {
          role: 'system',
          content:
            `Translate what the client says on a live business call into ${target}. The text may stop mid-sentence: ` +
            `translate exactly what is there, don't complete it. Natural and precise; keep names, numbers and ` +
            `technical terms. Output ONLY the translation. If the text is already in ${target}, output exactly: -`
        },
        ...(body.context ? [{ role: 'user', content: `Previous line (context only): ${String(body.context).slice(0, 300)}` }] : []),
        { role: 'user', content: text }
      ]
    })
  })
  const t0 = Date.now()
  let res = await call(usePriority)
  if (usePriority && res.status === 400) {
    console.warn('[translate-line] priority tier refused, using default:', (await res.text()).slice(0, 160))
    usePriority = false
    res = await call(false)
  }
  console.log('[translate-line] openai headers in', Date.now() - t0, 'ms', usePriority ? '(priority)' : '')
  if (!res.ok || !res.body) {
    console.error('[translate-line] openai error', res.status, (await res.text()).slice(0, 200))
    throw new ApiError(502, 'ai_failed', 'Translation failed.')
  }

  if (!body.stream) {
    const out = ((await res.json()) as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content?.trim() ?? ''
    return json({ translation: !out || out === '-' ? null : out.slice(0, 1000) })
  }

  // Forward only the text deltas as a plain-text stream.
  const upstream = res.body.getReader()
  const enc = new TextEncoder()
  const dec = new TextDecoder()
  let buf = ''
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      for (;;) {
        const { value, done } = await upstream.read()
        if (done) {
          controller.close()
          return
        }
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        let out = ''
        for (const line of lines) {
          if (!line.startsWith('data: ') || line.includes('[DONE]')) continue
          try {
            out += JSON.parse(line.slice(6)).choices?.[0]?.delta?.content ?? ''
          } catch {
            /* partial line */
          }
        }
        if (out) {
          controller.enqueue(enc.encode(out))
          return
        }
      }
    },
    cancel() {
      void upstream.cancel()
    }
  })
  return new Response(stream, {
    headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
  })
})
