import { ApiError, adminClient, authenticate, json, requireEnv, serve } from '../_shared/http.ts'

// =============================================================================
// POST /suggest-reply   (application/json)
// {
//   meetingId:  string,                                   // from /meeting-start
//   transcript: { speaker: 'me'|'them', text: string }[], // recent lines, oldest first
//   userNotes?: string                                    // what the user typed so far
// }
// Response: { question: string, answer: string } | { question: null }
//
// Live "what do I say?" helper: if the other side just asked the user something,
// draft a short reply the user can say. Only the user sees it.
// =============================================================================

const MODEL = Deno.env.get('HINTS_MODEL') ?? 'gpt-4o-mini'
const MAX_LINES = 40
const MAX_CHARS = 8_000
const CAP = { free: 5, pro: 60 } as const

interface Line {
  speaker: 'me' | 'them'
  text: string
}

const SYSTEM = [
  'You help a person during a live call. "Me" is the person you help; "Them" is the other side.',
  'Look at the LAST lines from "Them". If they ask "Me" a question or request something that needs an answer,',
  'write a reply "Me" could say right now.',
  '',
  'Rules:',
  '- Use only facts from the transcript and the notes. If the answer is unknown, suggest an honest reply',
  '  (e.g. offer to check and follow up) — never invent numbers, prices, dates or promises.',
  '- 1–2 short sentences, natural spoken style, in the language "Them" used.',
  '- If there is no open question for "Me", return {"question": null}.',
  '',
  'Respond with JSON only: {"question": string | null, "answer": string}',
  '"question" = the question in a few words, in the original language.'
].join('\n')

serve(async (req) => {
  const auth = await authenticate(req)

  let body: { meetingId?: string; transcript?: Line[]; userNotes?: string }
  try {
    body = await req.json()
  } catch {
    throw new ApiError(400, 'bad_request', 'Expected JSON body.')
  }

  const meetingId = String(body.meetingId ?? '')
  if (!meetingId) throw new ApiError(400, 'bad_request', 'meetingId is required.')

  const lines = (Array.isArray(body.transcript) ? body.transcript : [])
    .filter((l) => l && typeof l.text === 'string' && l.text.trim())
    .slice(-MAX_LINES)
  if (!lines.some((l) => l.speaker === 'them')) return json({ question: null })

  const transcript = lines
    .map((l) => `${l.speaker === 'me' ? 'Me' : 'Them'}: ${l.text.trim()}`)
    .join('\n')
    .slice(-MAX_CHARS)
  const notes = String(body.userNotes ?? '').slice(0, 4_000)

  // Quota per meeting (also proves the meeting belongs to the caller).
  const db = adminClient()
  const { data: allowed, error } = await db.rpc('try_use_hint', {
    p_user: auth.userId,
    p_meeting: meetingId,
    p_cap: CAP[auth.limits.tier]
  })
  if (error) throw new Error(`try_use_hint failed: ${error.message}`)
  if (!allowed) {
    throw new ApiError(
      402,
      'hint_quota',
      auth.limits.tier === 'free'
        ? 'You used the 5 free reply hints for this meeting. Pro gives you up to 60 per meeting.'
        : 'Reply hint limit for this meeting reached.'
    )
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requireEnv('OPENAI_API_KEY')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.3,
      max_tokens: 200,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `MY NOTES:\n${notes || '(none)'}\n\nTRANSCRIPT (latest last):\n${transcript}` }
      ]
    })
  })
  if (!res.ok) {
    console.error('[suggest-reply] openai error', res.status, (await res.text()).slice(0, 300))
    throw new ApiError(502, 'ai_failed', 'Could not suggest a reply right now.')
  }
  const completion = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  let parsed: { question?: string | null; answer?: string } = {}
  try {
    parsed = JSON.parse(completion.choices?.[0]?.message?.content ?? '{}')
  } catch {
    return json({ question: null })
  }
  if (!parsed.question || !parsed.answer) return json({ question: null })
  return json({ question: String(parsed.question).slice(0, 200), answer: String(parsed.answer).slice(0, 600) })
})
