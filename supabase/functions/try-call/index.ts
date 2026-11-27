import { ApiError, adminClient, json, requireEnv, serve } from '../_shared/http.ts'
import { ANNA_INSTRUCTIONS } from '../_shared/anna.ts'

// =============================================================================
// POST /try-call — "Try a call now" on minutama.com, no account needed.
//
//   { action: 'start' }
//     → { secret, model, token }   a 3-minute voice call with Anna (OpenAI
//                                   Realtime over WebRTC, from the browser)
//   { action: 'translate', token, text, target }
//     → { translation, terms: [{ term, explanation }] }
//                                   Anna's line in the visitor's language plus
//                                   one-line hints for technical terms
//
// Anonymous, so it is fenced in: a few calls per visitor (hashed IP) a day, a
// daily cap for the whole site, only from our website, and translations only
// with the short-lived token from 'start'. Nothing the visitor says is stored.
// =============================================================================

const MODEL = Deno.env.get('DEMO_MODEL') ?? 'gpt-realtime-mini'
const VOICE = Deno.env.get('DEMO_VOICE') ?? 'marin'
const TR_MODEL = Deno.env.get('TRANSLATE_MODEL') ?? 'gpt-4.1-mini'
const PER_IP_DAY = Number(Deno.env.get('TRY_CALL_PER_IP') ?? 3)
const SITE_DAY = Number(Deno.env.get('TRY_CALL_PER_DAY') ?? 200)
const TOKEN_MS = 6 * 60 * 1000
const MAX_TRANSLATIONS = 150

const ALLOWED_ORIGINS = ['https://minutama.com', 'https://www.minutama.com', 'http://localhost:3007', 'http://localhost:3000']

const enc = new TextEncoder()

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(requireEnv('SUPABASE_SERVICE_ROLE_KEY')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)))
  return btoa(String.fromCharCode(...sig)).replace(/[+/=]/g, (c) => (c === '+' ? '-' : c === '/' ? '_' : ''))
}

async function makeToken(): Promise<string> {
  const payload = `${Date.now() + TOKEN_MS}.${crypto.randomUUID()}`
  return `${payload}.${await hmac(payload)}`
}

async function checkToken(token: string): Promise<string> {
  const i = token.lastIndexOf('.')
  if (i < 0) throw new ApiError(401, 'bad_token', 'This test call has ended.')
  const payload = token.slice(0, i)
  if ((await hmac(payload)) !== token.slice(i + 1)) throw new ApiError(401, 'bad_token', 'This test call has ended.')
  if (Number(payload.split('.')[0]) < Date.now()) throw new ApiError(401, 'expired', 'This test call has ended.')
  return payload
}

// Per warm instance: how many translations each call used (best effort).
const used = new Map<string, number>()

function clientIp(req: Request): string {
  return (req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim()
}

serve(async (req) => {
  const origin = req.headers.get('origin') ?? ''
  if (!ALLOWED_ORIGINS.includes(origin)) throw new ApiError(403, 'origin', 'Not allowed.')

  let body: { action?: string; token?: string; text?: string; target?: string; context?: string }
  try {
    body = await req.json()
  } catch {
    throw new ApiError(400, 'bad_request', 'Expected JSON body.')
  }

  if (body.action === 'translate') {
    const payload = await checkToken(String(body.token ?? ''))
    const n = (used.get(payload) ?? 0) + 1
    if (n > MAX_TRANSLATIONS) throw new ApiError(429, 'too_many', 'This test call has ended.')
    used.set(payload, n)
    if (used.size > 5000) used.clear()
    const text = String(body.text ?? '').trim().slice(0, 400)
    const target = String(body.target ?? '').trim().slice(0, 30)
    if (!text || !target) throw new ApiError(400, 'bad_request', 'text and target are required.')
    return json(await translate(text, target))
  }

  if (body.action === 'ask') {
    const payload = await checkToken(String(body.token ?? ''))
    const n = (used.get(payload) ?? 0) + 1
    if (n > MAX_TRANSLATIONS) throw new ApiError(429, 'too_many', 'This test call has ended.')
    used.set(payload, n)
    const question = String(body.text ?? '').trim().slice(0, 500)
    const target = String(body.target ?? '').trim().slice(0, 30)
    if (!question || !target) throw new ApiError(400, 'bad_request', 'text and target are required.')
    return json({ answer: await askAi(question, String(body.context ?? '').slice(0, 1500), target) })
  }

  if (body.action !== 'start') throw new ApiError(400, 'bad_request', 'Unknown action.')

  // Limits: per visitor (hashed IP, nothing else kept) and for the whole site.
  const db = adminClient()
  const ipHash = (await hmac(`ip:${clientIp(req)}`)).slice(0, 32)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const [mine, all] = await Promise.all([
    db.from('web_try_calls').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('created_at', since),
    db.from('web_try_calls').select('id', { count: 'exact', head: true }).gte('created_at', since)
  ])
  if (mine.error || all.error) throw new Error(`try-call quota failed: ${(mine.error ?? all.error)?.message}`)
  if ((mine.count ?? 0) >= PER_IP_DAY) {
    throw new ApiError(429, 'try_quota', 'You’ve tried a few calls today. Download Minutama to keep going — it’s free.')
  }
  if ((all.count ?? 0) >= SITE_DAY) {
    throw new ApiError(429, 'site_quota', 'Test calls are busy right now. Download Minutama and try the test call in the app.')
  }

  const res = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${requireEnv('OPENAI_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      expires_after: { anchor: 'created_at', seconds: 120 },
      session: {
        type: 'realtime',
        model: MODEL,
        instructions:
          ANNA_INSTRUCTIONS +
          '\n- This call is short (about 3 minutes): ask 3–4 questions, at least two of them technical, then wrap up.',
        audio: {
          input: {
            // A browser on a laptop or headset: near-field mic. "High" eagerness
            // so Anna answers right after you finish — the demo feels fast.
            noise_reduction: { type: 'near_field' },
            turn_detection: { type: 'semantic_vad', eagerness: 'high', interrupt_response: false },
            // The visitor's own words, shown as "You" lines.
            transcription: { model: 'gpt-4o-mini-transcribe', language: 'en' }
          },
          output: { voice: VOICE }
        }
      }
    })
  })
  if (!res.ok) {
    console.error('[try-call] openai error', res.status, (await res.text()).slice(0, 300))
    throw new ApiError(502, 'try_failed', 'The test call is not available right now.')
  }
  const data = (await res.json()) as { value?: string }
  if (!data.value) throw new ApiError(502, 'try_failed', 'The test call is not available right now.')

  await db.from('web_try_calls').insert({ ip_hash: ipHash })
  console.log('[try-call] started')
  return json({ secret: data.value, model: MODEL, token: await makeToken(), maxSeconds: 180 })
})

async function translate(text: string, target: string): Promise<{ translation: string | null; terms: { term: string; explanation: string }[] }> {
  const res = await chat({
      model: TR_MODEL,
      temperature: 0,
      max_tokens: 400,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            `A client on a business call said the text below. Translate it into ${target}: natural and precise, keep ` +
            `names, numbers and technical terms. Also list ONLY real software / IT terms a non-developer may not ` +
            `know — e.g. Stripe, webhook, API, Docker, CI/CD, GitHub Actions, DNS, SSL, staging, CMS, SDK — with a plain ` +
            `explanation in ${target} in at most 12 words. NEVER list everyday words (website, menu, online menu, ` +
            `reservations, booking, payments, account, app, budget, deadline, design). Most sentences have no such ` +
            `term: then "terms" is []. Reply as JSON: ` +
            `{"translation":"...","terms":[{"term":"...","explanation":"..."}]}. If the text is already in ${target}, ` +
            `translation is "".`
        },
        { role: 'user', content: text }
      ]
  })
  if (!res.ok) {
    console.error('[try-call] translate error', res.status, (await res.text()).slice(0, 200))
    throw new ApiError(502, 'translate_failed', 'Translation failed.')
  }
  try {
    const out = JSON.parse(((await res.json()) as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content ?? '{}') as {
      translation?: string
      terms?: { term?: unknown; explanation?: unknown }[]
    }
    return {
      translation: out.translation ? String(out.translation).slice(0, 800) : null,
      terms: (out.terms ?? [])
        .map((t) => ({ term: String(t.term ?? '').slice(0, 60), explanation: String(t.explanation ?? '').slice(0, 200) }))
        .filter((t) => t.term && t.explanation)
        
        .slice(0, 2)
    }
  } catch {
    return { translation: null, terms: [] }
  }
}

// Ask AI in the demo: what the client wants + a short answer to say.
async function askAi(question: string, context: string, target: string): Promise<string> {
  const res = await chat({
      model: TR_MODEL,
      temperature: 0.3,
      max_tokens: 220,
      messages: [
        {
          role: 'system',
          content:
            `You help a freelance web developer during a live call with a client (Anna, café owner, wants a booking ` +
            `site with Stripe payments). The freelancer clicked a question the client asked. Reply in ${target}, very ` +
            `short: one sentence with what she wants to know (explain any tech term in plain words), then a new line ` +
            `starting with the ${target} word for "Say:" followed by a short natural answer IN ENGLISH (at most 20 words) the ` +
            `freelancer can say right now. No lists, no markdown.`
        },
        ...(context ? [{ role: 'user', content: `Call so far:
${context}` }] : []),
        { role: 'user', content: `Her question: ${question}` }
      ]
  })
  if (!res.ok) {
    console.error('[try-call] ask error', res.status, (await res.text()).slice(0, 200))
    throw new ApiError(502, 'ask_failed', 'Ask AI is not available right now.')
  }
  return (((await res.json()) as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content ?? '').trim().slice(0, 700)
}

// Chat completion with priority processing (steadier, faster for a live demo);
// falls back to the default tier if the account doesn't support it.
let usePriority = true
async function chat(body: Record<string, unknown>): Promise<Response> {
  const send = (priority: boolean) =>
    fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${requireEnv('OPENAI_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, ...(priority ? { service_tier: 'priority' } : {}) })
    })
  let res = await send(usePriority)
  if (usePriority && res.status === 400) {
    usePriority = false
    res = await send(false)
  }
  return res
}
