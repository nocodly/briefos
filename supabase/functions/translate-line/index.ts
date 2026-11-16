import { ApiError, adminClient, authenticate, json, requireEnv, serve } from '../_shared/http.ts'

// =============================================================================
// POST /translate-line   { meetingId, text, target: 'Ukrainian' | 'Spanish' | … }
// → { translation: string | null }   (null when the line is already in target)
//
// Live captions: every sentence the client says is translated into the user's
// language right away. Small, fast model; one sentence per call.
// =============================================================================

const MODEL = Deno.env.get('TRANSLATE_MODEL') ?? 'gpt-4o-mini'

const owned = new Map<string, string>() // meetingId → userId (per warm instance)

serve(async (req) => {
  const auth = await authenticate(req)
  let body: { meetingId?: string; text?: string; target?: string; context?: string }
  try {
    body = await req.json()
  } catch {
    throw new ApiError(400, 'bad_request', 'Expected JSON body.')
  }
  const meetingId = String(body.meetingId ?? '')
  const text = String(body.text ?? '').trim().slice(0, 600)
  const target = String(body.target ?? '').trim().slice(0, 30)
  if (!meetingId || !text || !target) throw new ApiError(400, 'bad_request', 'meetingId, text and target are required.')

  if (owned.get(meetingId) !== auth.userId) {
    const { data } = await adminClient()
      .from('meeting_sessions')
      .select('id')
      .eq('id', meetingId)
      .eq('user_id', auth.userId)
      .maybeSingle()
    if (!data) throw new ApiError(404, 'meeting_not_found', 'This meeting was not found.')
    owned.set(meetingId, auth.userId)
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${requireEnv('OPENAI_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      max_tokens: 300,
      messages: [
        {
          role: 'system',
          content:
            `Translate the line from a live business call into ${target}. Natural and precise; keep names, numbers ` +
            `and technical terms (you may keep the original term in brackets). Output ONLY the translation. ` +
            `If the line is already in ${target}, output exactly: -`
        },
        ...(body.context ? [{ role: 'user', content: `Previous line (context only): ${String(body.context).slice(0, 300)}` }] : []),
        { role: 'user', content: text }
      ]
    })
  })
  if (!res.ok) {
    console.error('[translate-line] openai error', res.status, (await res.text()).slice(0, 200))
    throw new ApiError(502, 'ai_failed', 'Translation failed.')
  }
  const out = ((await res.json()) as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content?.trim() ?? ''
  return json({ translation: !out || out === '-' ? null : out.slice(0, 800) })
})
