import { ApiError, adminClient, authenticate, json, requireEnv, serve } from '../_shared/http.ts'

// =============================================================================
// POST /live-session   { meetingId, languages?: string[], keywords?: string[] }
// → { secret, expiresAt }
//
// Short-lived client secret for OpenAI live transcription (gpt-live-transcribe)
// of the client's audio channel: words arrive ~0.3 s after they are spoken, so
// captions, translations and question cards are near-instant. The real API key
// never leaves the server. Seconds are still metered by /transcribe-chunk
// (countOnly) for the same audio.
// =============================================================================

const MODEL = Deno.env.get('LIVE_MODEL') ?? 'gpt-live-transcribe'
const MAX_MEETING_AGE_MS = 8 * 60 * 60 * 1000

serve(async (req) => {
  const auth = await authenticate(req)
  let body: { meetingId?: string; languages?: unknown; keywords?: unknown }
  try {
    body = await req.json()
  } catch {
    throw new ApiError(400, 'bad_request', 'Expected JSON body.')
  }
  const meetingId = String(body.meetingId ?? '')
  if (!meetingId) throw new ApiError(400, 'bad_request', 'meetingId is required.')

  // Only for the caller's own meeting that is still running.
  const { data: session, error } = await adminClient()
    .from('meeting_sessions')
    .select('id, started_at, enhanced_at')
    .eq('id', meetingId)
    .eq('user_id', auth.userId)
    .maybeSingle()
  if (error) throw new Error(`meeting lookup failed: ${error.message}`)
  if (!session) throw new ApiError(404, 'meeting_not_found', 'This meeting was not found.')
  if (session.enhanced_at || Date.now() - new Date(session.started_at).getTime() > MAX_MEETING_AGE_MS) {
    throw new ApiError(409, 'meeting_closed', 'This meeting is already finished.')
  }

  const languages = (Array.isArray(body.languages) ? body.languages : [])
    .map((l) => String(l).toLowerCase())
    .filter((l, i, a) => /^[a-z]{2}$/.test(l) && a.indexOf(l) === i)
    .slice(0, 3)
  const keywords = (Array.isArray(body.keywords) ? body.keywords : [])
    .map((k) => String(k).replace(/[<>\r\n]/g, ' ').trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 40)

  const transcription: Record<string, unknown> = { model: MODEL }
  if (languages.length) transcription.languages = languages
  if (keywords.length) transcription.keywords = keywords

  const res = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${requireEnv('OPENAI_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      expires_after: { anchor: 'created_at', seconds: 120 },
      session: {
        type: 'transcription',
        audio: {
          input: {
            format: { type: 'audio/pcm', rate: 24000 },
            transcription,
            turn_detection: null
          }
        }
      }
    })
  })
  if (!res.ok) {
    console.error('[live-session] openai error', res.status, (await res.text()).slice(0, 300))
    throw new ApiError(502, 'live_failed', 'Live captions are not available right now.')
  }
  const data = (await res.json()) as { value?: string; expires_at?: number }
  if (!data.value) throw new ApiError(502, 'live_failed', 'Live captions are not available right now.')
  return json({ secret: data.value, expiresAt: data.expires_at ?? null })
})
