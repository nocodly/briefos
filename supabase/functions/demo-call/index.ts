import { ApiError, adminClient, authenticate, json, requireEnv, serve } from '../_shared/http.ts'

// =============================================================================
// POST /demo-call   {} → { secret, model }
//
// "Test call": a short practice call with an AI client ("Anna", a friendly
// coffee-shop owner) so a new user sees live captions, translation, question
// cards and Ask AI work before a real call. The app connects to OpenAI
// Realtime (speech-to-speech) over WebRTC with this short-lived secret; Anna's
// voice plays through the speakers and Minutama records it like a real client.
// Limited per user per day; the real API key never leaves the server.
// =============================================================================

const MODEL = Deno.env.get('DEMO_MODEL') ?? 'gpt-realtime-mini'
const VOICE = Deno.env.get('DEMO_VOICE') ?? 'marin'
const PER_DAY = 5

const INSTRUCTIONS = [
  'You are Anna Weber, the friendly owner of a small coffee shop in Berlin. You are on a video call with a',
  'freelance web developer you might hire. This is a practice call: the freelancer is testing an app that',
  'shows live captions and translations, so speak natural, clear English at a calm, steady pace.',
  '',
  'Your project: a website for the coffee shop with an online menu, table reservations and opening hours.',
  'Budget around two thousand dollars. You would like it live in the first week of December.',
  '',
  'How to talk:',
  '- Start the call yourself: greet them warmly, introduce yourself in one sentence, say what you need.',
  '- Keep every turn short: 1–3 sentences. Ask ONE question at a time, then wait for the answer.',
  '- Over the call, ask about: their experience with similar sites, how long it would take, how they work',
  '  (fixed price or hourly), whether they can handle online payments with Stripe, and ask them to send',
  '  a fixed price estimate by Friday.',
  '- React naturally to what they say. If they answer in another language or are hard to understand,',
  '  stay patient and continue in simple English.',
  '- Use a few real-world terms naturally (for example "fixed price", "deadline", "mobile-friendly").',
  '- After about 6–8 questions, or if they say goodbye, thank them, confirm the estimate by Friday and say',
  '  goodbye. Never mention that you are an AI unless asked.'
].join('\n')

serve(async (req) => {
  const auth = await authenticate(req)
  const db = adminClient()

  // A few test calls a day is plenty (each is a few cents of voice AI).
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count, error } = await db
    .from('app_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', auth.userId)
    .eq('name', 'demo_call')
    .gte('created_at', since)
  if (error) throw new Error(`demo quota failed: ${error.message}`)
  if ((count ?? 0) >= PER_DAY) {
    throw new ApiError(429, 'demo_quota', `You've made ${PER_DAY} test calls today. Try again tomorrow — or start a real call.`)
  }

  const res = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${requireEnv('OPENAI_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      expires_after: { anchor: 'created_at', seconds: 120 },
      session: {
        type: 'realtime',
        model: MODEL,
        instructions: INSTRUCTIONS,
        audio: {
          // Anna is not cut off by her own voice coming back through speakers:
          // a firmer voice threshold, and she finishes her sentence even if
          // the mic picks something up.
          input: {
            turn_detection: {
              type: 'server_vad',
              threshold: 0.65,
              prefix_padding_ms: 300,
              silence_duration_ms: 800,
              interrupt_response: false
            }
          },
          output: { voice: VOICE }
        }
      }
    })
  })
  if (!res.ok) {
    console.error('[demo-call] openai error', res.status, (await res.text()).slice(0, 300))
    throw new ApiError(502, 'demo_failed', 'The test call is not available right now.')
  }
  const data = (await res.json()) as { value?: string }
  if (!data.value) throw new ApiError(502, 'demo_failed', 'The test call is not available right now.')

  await db.from('app_events').insert({ user_id: auth.userId, name: 'demo_call', props: {} })
  console.log('[demo-call]', auth.userId)
  return json({ secret: data.value, model: MODEL })
})
