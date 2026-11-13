import { ApiError, adminClient, authenticate, json, requireEnv, serve } from '../_shared/http.ts'

// =============================================================================
// POST /transcribe-chunk   (multipart/form-data)
//   meetingId   — id from /meeting-start
//   channel     — 'me' (microphone) | 'them' (system audio)
//   durationSec — chunk length reported by the client (1–60)
//   language    — optional ISO code hint ('uk', 'de', 'en'…)
//   prompt      — optional tail of the previous text for continuity
//   file        — audio chunk (webm/opus, ogg, wav, mp3, m4a)
// Response: { text }
//
// Audio is streamed straight to the transcription API and never stored.
// =============================================================================

const MAX_BYTES = 10 * 1024 * 1024
const MAX_CHUNK_SECONDS = 60
// Upper bound of the client's opus bitrate (64 kbps = 8000 B/s). Dividing the
// byte size by it gives a lower bound on real duration, so a client can't
// under-report seconds to dodge quotas.
const MAX_BYTES_PER_SECOND = 8000
const MODEL = Deno.env.get('TRANSCRIBE_MODEL') ?? 'gpt-4o-mini-transcribe'

serve(async (req) => {
  const auth = await authenticate(req)

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    throw new ApiError(400, 'bad_request', 'Expected multipart form data.')
  }

  const meetingId = String(form.get('meetingId') ?? '')
  const channel = String(form.get('channel') ?? '')
  const declared = Number(form.get('durationSec') ?? 0)
  const language = String(form.get('language') ?? '').slice(0, 5)
  const prompt = String(form.get('prompt') ?? '').slice(-500)
  const file = form.get('file')

  if (!meetingId) throw new ApiError(400, 'bad_request', 'meetingId is required.')
  if (channel !== 'me' && channel !== 'them') throw new ApiError(400, 'bad_request', 'channel must be me|them.')
  if (!(file instanceof File) || file.size === 0) throw new ApiError(400, 'bad_request', 'Audio file is required.')
  if (file.size > MAX_BYTES) throw new ApiError(413, 'too_large', 'Audio chunk is too large.')
  if (!Number.isFinite(declared) || declared <= 0 || declared > MAX_CHUNK_SECONDS) {
    throw new ApiError(400, 'bad_request', `durationSec must be between 1 and ${MAX_CHUNK_SECONDS}.`)
  }

  // Meter BOTH channels: each one is a separate paid transcription.
  const seconds = Math.ceil(Math.max(declared, file.size / MAX_BYTES_PER_SECOND))

  const { data: verdict, error } = await adminClient().rpc('try_add_seconds', {
    p_user: auth.userId,
    p_meeting: meetingId,
    p_seconds: seconds,
    // Two channels per meeting → double the per-meeting cap in channel-seconds.
    p_meeting_cap: auth.limits.maxMeetingMinutes * 60 * 2,
    p_month_cap: auth.limits.monthlyMinutes === null ? null : auth.limits.monthlyMinutes * 60 * 2
  })
  if (error) throw new Error(`try_add_seconds failed: ${error.message}`)

  switch (verdict) {
    case 'ok':
      break
    case 'not_found':
      throw new ApiError(404, 'meeting_not_found', 'This meeting was not found. Start a new one.')
    case 'meeting_limit':
      throw new ApiError(
        402,
        'meeting_length',
        `This meeting reached the ${auth.limits.maxMeetingMinutes}-minute limit of your plan.`
      )
    case 'month_limit':
      throw new ApiError(402, 'month_minutes', 'You reached the monthly recording limit of your plan.')
    default:
      throw new Error(`unexpected verdict ${verdict}`)
  }

  // Forward to OpenAI.
  const upstream = new FormData()
  upstream.append('file', file, file.name || `chunk.webm`)
  upstream.append('model', MODEL)
  upstream.append('response_format', 'json')
  if (language) upstream.append('language', language)
  if (prompt) upstream.append('prompt', prompt)

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${requireEnv('OPENAI_API_KEY')}` },
    body: upstream
  })
  if (!res.ok) {
    const detail = await res.text()
    console.error('[transcribe-chunk] openai error', res.status, detail.slice(0, 500))
    throw new ApiError(502, 'transcription_failed', 'Transcription failed for this part. It will be retried.')
  }
  const body = (await res.json()) as { text?: string }

  return json({ text: (body.text ?? '').trim() })
})
