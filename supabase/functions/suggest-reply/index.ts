import { ApiError, adminClient, authenticate, json, requireEnv, serve } from '../_shared/http.ts'

// =============================================================================
// POST /suggest-reply   (application/json)
// {
//   meetingId:  string,                                   // from /meeting-start
//   transcript: { speaker: 'me'|'them', text: string }[], // recent lines, oldest first
//   userNotes?: string,                                   // what the user typed so far
//   nativeLanguage?: string,     // e.g. "Ukrainian" — translate the card into it
//   context?: string,            // job post / proposal / stack the user pasted
//   answerHint?: boolean         // also suggest points to mention (opt-in)
// }
// Response (question card):
// { question, translation?, term?, termExplanation?, confidence, answer? }
// | { question: null }
//
// Live question cards: when the client ("Them") asks something, show the exact
// question, its translation into the user's language and a one-line
// explanation of a hard term. The user answers in their own words; a short
// "what to mention" hint is only added when the user turned it on.
// =============================================================================

const MODEL = Deno.env.get('HINTS_MODEL') ?? 'gpt-4o-mini'
const MAX_LINES = 30
const MAX_CHARS = 6_000
const CAP = { free: 20, pro: 200, max: 400 } as const
const MIN_CONFIDENCE = 0.55

interface Line {
  speaker: 'me' | 'them'
  text: string
}

function systemPrompt(native: string | null, answerHint: boolean): string {
  return [
    'You help a freelancer during a live client call. "Me" is the freelancer; "Them" is the client.',
    'Look ONLY at the LAST "Them" line(s). Decide whether the client just asked "Me" a question or asked',
    'for something that needs an answer (a request, "tell me about…", "can you…").',
    '',
    'Rules:',
    '- "question": copy the client’s question with their EXACT words (fix only obvious transcription',
    '  typos). Never paraphrase or shorten the meaning.',
    native
      ? `- "translation": translate that question into ${native}. Natural, precise, keep technical terms` +
        ' (you may add the original term in brackets). If the question is already in ' +
        `${native}, return null.`
      : '- "translation": null.',
    '- "term" / "termExplanation": if the question contains one technical or business term a non-native',
    `  speaker may not know (e.g. "SOW", "net 30", "cold start", "API gateway"), name it and explain it in one short line${
      native ? ` in ${native}` : ''
    }. Otherwise both null. Use the background below to pick the right meaning.`,
    answerHint
      ? `- "answer": 1–2 short bullet-like points the freelancer could mention${
          native ? `, in ${native}` : ''
        }, ONLY from the transcript, notes and background. Never invent prices, dates or promises; if unknown,` +
        ' suggest asking a clarifying question.'
      : '- Do NOT write an answer. Return "answer": null.',
    '- "confidence": 0–1, how sure you are this is a real question to "Me" and the words are right.',
    '- If there is no open question from the client, return {"question": null}.',
    '',
    'JSON only: {"question": string|null, "translation": string|null, "term": string|null,',
    ' "termExplanation": string|null, "answer": string|null, "confidence": number}'
  ].join('\n')
}

serve(async (req) => {
  const auth = await authenticate(req)

  let body: {
    meetingId?: string
    transcript?: Line[]
    userNotes?: string
    nativeLanguage?: string
    context?: string
    answerHint?: boolean
  }
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
  const notes = String(body.userNotes ?? '').slice(0, 3_000)
  const context = String(body.context ?? '').slice(0, 4_000)
  const native = String(body.nativeLanguage ?? '').trim().slice(0, 40) || null
  // Old app versions did not send answerHint and expect an answer.
  const answerHint = body.answerHint === undefined ? true : Boolean(body.answerHint)

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
        ? `You used the ${CAP.free} free question cards for this call. Pro gives you up to ${CAP.pro} per call.`
        : 'Question card limit for this call reached.'
    )
  }

  const t0 = Date.now()
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requireEnv('OPENAI_API_KEY')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.1,
      max_tokens: 300,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt(native, answerHint) },
        {
          role: 'user',
          content:
            `BACKGROUND (job post, proposal, stack — may be empty):\n${context || '(none)'}\n\n` +
            `MY NOTES:\n${notes || '(none)'}\n\nTRANSCRIPT (latest last):\n${transcript}`
        }
      ]
    })
  })
  if (!res.ok) {
    console.error('[suggest-reply] openai error', res.status, (await res.text()).slice(0, 300))
    throw new ApiError(502, 'ai_failed', 'Could not read the question right now.')
  }
  const completion = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  let p: {
    question?: string | null
    translation?: string | null
    term?: string | null
    termExplanation?: string | null
    answer?: string | null
    confidence?: number
  } = {}
  try {
    p = JSON.parse(completion.choices?.[0]?.message?.content ?? '{}')
  } catch {
    return json({ question: null })
  }
  const confidence = typeof p.confidence === 'number' ? p.confidence : 0.7
  console.log('[suggest-reply] ai ms', Date.now() - t0, 'confidence', confidence)
  // A wrong card is worse than a missing one.
  if (!p.question || confidence < MIN_CONFIDENCE) return json({ question: null })

  const str = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null)
  return json({
    question: String(p.question).slice(0, 300),
    translation: str(p.translation, 400),
    term: str(p.term, 60),
    termExplanation: p.term ? str(p.termExplanation, 240) : null,
    answer: answerHint ? str(p.answer, 500) : null,
    confidence,
    aiMs: Date.now() - t0
  })
})
