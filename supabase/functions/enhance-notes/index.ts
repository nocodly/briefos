import { ApiError, adminClient, authenticate, json, requireEnv, serve } from '../_shared/http.ts'
import { TEMPLATES } from '../_shared/templates.ts'

// =============================================================================
// POST /enhance-notes   (application/json)
// {
//   meetingId:  string,                       // from /meeting-start
//   templateId: string,                       // see _shared/templates.ts
//   userNotes:  string,                       // what the user typed (markdown)
//   transcript: { speaker: 'me'|'them', startMs: number, text: string }[],
//   language?:  string                        // output language; default = meeting language
// }
// Response:
// {
//   title, notesMarkdown,
//   actionItems: { text, owner?: 'me'|'them'|string, due?: string }[],
//   decisions: string[]
// }
// The user's own notes are the backbone; the transcript fills in details.
// =============================================================================

const MODEL = Deno.env.get('NOTES_MODEL') ?? 'gpt-4o-mini'
const MAX_TRANSCRIPT_CHARS = 180_000 // ~4h of speech; keeps cost bounded
const MAX_NOTES_CHARS = 20_000

interface Segment {
  speaker: 'me' | 'them'
  startMs: number
  text: string
}

interface EnhancedNotes {
  title: string
  notesMarkdown: string
  actionItems: { text: string; owner?: string; due?: string }[]
  decisions: string[]
}

function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const mm = String(Math.floor(s / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

function systemPrompt(sections: string[], language?: string): string {
  return [
    'You turn a person\'s rough meeting notes plus the meeting transcript into clean, useful notes.',
    '',
    'Rules:',
    '- The user\'s own notes show what THEY found important. Keep every point they wrote, expand it with',
    '  facts from the transcript, and never contradict it. Add other important points from the transcript.',
    '- "Me" is the user (microphone). "Them" is everyone else on the call (system audio).',
    '- Be concise and concrete: names, numbers, dates, commitments. No filler, no generic advice.',
    '- Never invent facts that are not in the notes or transcript. If something is unclear, omit it.',
    `- Output language: ${language ? language : 'the main language spoken in the transcript'}.`,
    `- Use these sections as markdown "##" headings, in this order, skipping empty ones: ${sections.join(', ')}.`,
    '- Use short bullet points under each heading.',
    '',
    'Respond with JSON only:',
    '{ "title": string (max 8 words),',
    '  "notesMarkdown": string,',
    '  "actionItems": [{ "text": string, "owner": "me" | "them" | a name, "due": string (optional) }],',
    '  "decisions": [string] }'
  ].join('\n')
}

function parseResult(raw: string): EnhancedNotes {
  let parsed: Partial<EnhancedNotes>
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new ApiError(502, 'ai_bad_output', 'AI returned an invalid response. Please try again.')
  }
  return {
    title: String(parsed.title ?? 'Meeting notes').slice(0, 120),
    notesMarkdown: String(parsed.notesMarkdown ?? ''),
    actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems.slice(0, 50) : [],
    decisions: Array.isArray(parsed.decisions) ? parsed.decisions.map(String).slice(0, 50) : []
  }
}

serve(async (req) => {
  const auth = await authenticate(req)

  let body: {
    meetingId?: string
    templateId?: string
    userNotes?: string
    transcript?: Segment[]
    language?: string
  }
  try {
    body = await req.json()
  } catch {
    throw new ApiError(400, 'bad_request', 'Expected JSON body.')
  }

  const meetingId = String(body.meetingId ?? '')
  const templateId = String(body.templateId ?? 'general')
  const userNotes = String(body.userNotes ?? '').slice(0, MAX_NOTES_CHARS)
  const transcript = Array.isArray(body.transcript) ? body.transcript : []

  if (!meetingId) throw new ApiError(400, 'bad_request', 'meetingId is required.')

  const template = TEMPLATES[templateId]
  if (!template) throw new ApiError(400, 'bad_request', `Unknown template "${templateId}".`)
  if (!auth.limits.templates.includes(templateId)) {
    throw new ApiError(402, 'template_locked', `The "${template.name}" template is available on Pro.`)
  }

  // The meeting must belong to the caller (also stops reuse of foreign ids).
  const db = adminClient()
  const { data: session, error: sErr } = await db
    .from('meeting_sessions')
    .select('id')
    .eq('id', meetingId)
    .eq('user_id', auth.userId)
    .maybeSingle()
  if (sErr) throw new Error(`meeting lookup failed: ${sErr.message}`)
  if (!session) throw new ApiError(404, 'meeting_not_found', 'This meeting was not found.')

  const transcriptText = transcript
    .filter((s) => s && typeof s.text === 'string' && s.text.trim())
    .map((s) => `[${clock(Number(s.startMs) || 0)}] ${s.speaker === 'me' ? 'Me' : 'Them'}: ${s.text.trim()}`)
    .join('\n')
    .slice(0, MAX_TRANSCRIPT_CHARS)

  if (!transcriptText && !userNotes.trim()) {
    throw new ApiError(400, 'empty_meeting', 'Nothing to enhance yet — no notes and no transcript.')
  }

  console.log('[enhance-notes] user', auth.userId, 'template', templateId, 'chars', transcriptText.length)

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requireEnv('OPENAI_API_KEY')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt(template.sections, body.language) },
        {
          role: 'user',
          content: `MY NOTES:\n${userNotes || '(none)'}\n\nTRANSCRIPT:\n${transcriptText || '(none)'}`
        }
      ]
    })
  })
  if (!res.ok) {
    console.error('[enhance-notes] openai error', res.status, (await res.text()).slice(0, 500))
    throw new ApiError(502, 'ai_failed', 'Could not generate notes right now. Please try again.')
  }
  const completion = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const result = parseResult(completion.choices?.[0]?.message?.content ?? '')

  await db.from('meeting_sessions').update({ enhanced_at: new Date().toISOString() }).eq('id', meetingId)

  console.log('[enhance-notes] done', meetingId)
  return json(result)
})
