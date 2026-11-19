import { ApiError, adminClient, authenticate, corsHeaders, requireEnv, serve } from '../_shared/http.ts'

// =============================================================================
// POST /ask-ai   (application/json) → text/plain stream of the answer
// {
//   meetingId:  string,
//   line:       string,                                   // the caption line the user picked
//   transcript: { speaker: 'me'|'them', text: string }[], // recent lines, oldest first
//   messages?:  { role: 'user'|'assistant', text: string }[], // follow-ups in this mini chat
//   nativeLanguage?: string,     // answer language (e.g. "Ukrainian")
//   context?: string             // about me + about this call
// }
//
// "Ask AI" from the live capsule: the user hovers a line the client said and
// gets a short answer they can use while the call goes on. Shares the per-call
// quota with question cards (try_use_hint), which also proves meeting ownership.
// =============================================================================

const MODEL = Deno.env.get('ASK_MODEL') ?? 'gpt-4.1-mini'
const CAP = { free: 20, pro: 200, max: 400 } as const

interface Line {
  speaker: 'me' | 'them'
  text: string
}

serve(async (req) => {
  const auth = await authenticate(req)
  let body: {
    meetingId?: string
    line?: string
    transcript?: Line[]
    messages?: { role?: string; text?: string }[]
    nativeLanguage?: string
    context?: string
  }
  try {
    body = await req.json()
  } catch {
    throw new ApiError(400, 'bad_request', 'Expected JSON body.')
  }
  const meetingId = String(body.meetingId ?? '')
  const line = String(body.line ?? '').trim().slice(0, 800)
  if (!meetingId || !line) throw new ApiError(400, 'bad_request', 'meetingId and line are required.')

  const transcript = (Array.isArray(body.transcript) ? body.transcript : [])
    .filter((l) => l && typeof l.text === 'string' && l.text.trim())
    .slice(-30)
    .map((l) => `${l.speaker === 'me' ? 'Me' : 'Them'}: ${l.text.trim()}`)
    .join('\n')
    .slice(-6000)
  const followUps = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => m && typeof m.text === 'string' && m.text.trim())
    .slice(-8)
    .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.text).slice(0, 1500) }))
  const native = String(body.nativeLanguage ?? '').trim().slice(0, 40) || null
  const context = String(body.context ?? '').slice(0, 4000)

  const { data: allowed, error } = await adminClient().rpc('try_use_hint', {
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
        ? `You used the ${CAP.free} free AI answers for this call. Pro gives you up to ${CAP.pro} per call.`
        : 'AI answer limit for this call reached.'
    )
  }

  const system = [
    'You help a freelancer ("Me") during a live call with a client ("Them"). The call is still going on,',
    'so the freelancer reads your answer at a glance while talking.',
    'The freelancer picked one line from the call and wants help with it: what it means, and what to answer.',
    '',
    'Answer format:',
    native
      ? `- Explain in ${native}. Anything the freelancer could SAY to the client stays in the language of the call.`
      : '- Use the language of the call.',
    '- Start with the answer itself. No greetings, no repeating the question.',
    '- At most 4 short lines or bullets. Plain text, no markdown headings.',
    '- If the client asked something: give 1–2 short phrases the freelancer could say, in quotes.',
    '- Use ONLY facts from the transcript and the background. Never invent prices, dates or promises;',
    '  if something is unknown, suggest a clarifying question instead.',
    '- For a technical or business term, explain it in one simple line.'
  ].join('\n')

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${requireEnv('OPENAI_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.3,
      max_tokens: 350,
      stream: true,
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content:
            `BACKGROUND:\n${context || '(none)'}\n\nTRANSCRIPT (latest last):\n${transcript || '(none)'}\n\n` +
            `THE LINE I PICKED:\n${line}\n\nHelp me with this line.`
        },
        ...followUps
      ]
    })
  })
  if (!res.ok || !res.body) {
    console.error('[ask-ai] openai error', res.status, (await res.text()).slice(0, 200))
    throw new ApiError(502, 'ai_failed', 'AI could not answer right now.')
  }
  console.log('[ask-ai]', auth.userId, 'follow-ups', followUps.length)

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
        for (const l of lines) {
          if (!l.startsWith('data: ') || l.includes('[DONE]')) continue
          try {
            out += JSON.parse(l.slice(6)).choices?.[0]?.delta?.content ?? ''
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
