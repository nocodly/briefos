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

// gpt-4.1-mini follows the section/JSON rules far better than 4o-mini (which
// sometimes returned an empty brief with only the email); once per call, cheap.
const MODEL = Deno.env.get('NOTES_MODEL') ?? 'gpt-4.1-mini'
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

/** "2026-11-20 (Friday)" → the next 21 days with weekdays, so "by Friday" maps to a real date. */
function upcomingDays(today?: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(today ?? '')
  if (!m) return null
  const start = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const days: string[] = []
  for (let i = 0; i <= 21; i++) {
    const d = new Date(start + i * 86_400_000)
    const wd = d.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
    days.push(`${d.toISOString().slice(0, 10)} ${wd}${i === 0 ? ' (TODAY)' : i === 1 ? ' (tomorrow)' : ''}`)
  }
  return days.join('\n')
}

function systemPrompt(sections: string[], language?: string, extra?: string, today?: string, clientLanguage?: string): string {
  const days = upcomingDays(today)
  // The follow-up email is its own JSON field (the model kept dropping it as a
  // markdown section); the server appends it to the notes.
  const email = sections.includes('Follow-up email')
  const mdSections = sections.filter((x) => x !== 'Follow-up email')
  return [
    ...(extra ? [extra, ''] : []),
    'You turn a person\'s rough meeting notes plus the meeting transcript into clean, useful notes.',
    '',
    'Rules:',
    '- The user\'s own notes show what THEY found important. Keep every point they wrote, expand it with',
    '  facts from the transcript, and never contradict it. Add other important points from the transcript.',
    '- "Me" is the user (microphone). "Them" is everyone else on the call (system audio).',
    '- Be concise and concrete: names, numbers, dates, commitments. No filler, no generic advice.',
    '- Never invent facts that are not in the notes or transcript. If something is unclear, omit it.',
    language
      ? `- LANGUAGE: write EVERYTHING (title, headings, bullets, action items, decisions) in ${language}` +
        (clientLanguage && clientLanguage !== language
          ? `, EXCEPT the follow-up email to the client, which is written in ${clientLanguage}.`
          : '.')
      : '- LANGUAGE: first detect the main language of the TRANSCRIPT (and the user’s notes). Write EVERYTHING —' +
        ' title, section headings, bullets, action items, decisions — in that language. Never default to English' +
        ' unless the conversation was in English. If several languages were spoken, use the one spoken most.',
    `- Use these sections as markdown "##" headings, in this order: ${mdSections.join(', ')}.`,
    '- The section headings MUST be translated into the output language too — e.g. for Ukrainian write',
    '  "## Підсумок", "## Ключові моменти", "## Рішення", "## Задачі", never "## Summary" or "## Action items".',
    '- If a section has no real content, OMIT the heading entirely. Never write "None", "N/A" or "None noted".',
    `- "notesMarkdown" is REQUIRED and never empty: the FIRST section (${mdSections[0]}) is always there,` +
    '  2–4 sentences on what the call was about — even for a short, vague or small-talk call.',
    '- Use short bullet points under each heading.',
    '',
    'Respond with JSON only:',
    '{ "title": string (max 8 words),',
    '  "notesMarkdown": string,',
    '  "actionItems": [{ "text": string, "owner": "me" | "them" | a name, "due": string (optional, as said),',
    '                    "dueDate": "YYYY-MM-DD" (optional) }],',
    email
      ? '  "decisions": [string],\n' +
        '  "followUpHeading": string (the words "Follow-up email" in the notes language),\n' +
        '  "followUpEmail": string (REQUIRED, never empty: plain text, 4–8 short lines, see the follow-up email rules) }'
      : '  "decisions": [string] }',
    '',
    days
      ? '"dueDate": the calendar date of the deadline when it is clear. Pick it ONLY from this calendar ' +
        '(a weekday name means the NEXT such day after today, e.g. said on a Friday "by Friday" = the Friday ' +
        'one week later; "end of the week" = the coming Friday). Omit dueDate when no deadline was said or it ' +
        `is vague ("soon", "later").\nCALENDAR:\n${days}`
      : 'Omit "dueDate".'
  ].join('\n')
}

/** Appends the follow-up email as a quoted block (the app shows it with a Copy button). */
function withEmail(md: string, heading: unknown, email: unknown): string {
  const text = typeof email === 'string' ? email.trim() : ''
  if (!text) return md
  const title = typeof heading === 'string' && heading.trim() ? heading.trim().slice(0, 60) : 'Follow-up email'
  const quoted = text
    .split('\n')
    .map((l) => `> ${l.replace(/^>\s?/, '')}`.trimEnd())
    .join('\n')
  return `${md.trimEnd()}\n\n## ${title}\n${quoted}\n`
}

function parseResult(raw: string): EnhancedNotes {
  let parsed: Partial<EnhancedNotes> & { followUpEmail?: unknown; followUpHeading?: unknown }
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new ApiError(502, 'ai_bad_output', 'AI returned an invalid response. Please try again.')
  }
  return {
    title: String(parsed.title ?? 'Meeting notes').slice(0, 120),
    notesMarkdown: withEmail(String(parsed.notesMarkdown ?? ''), parsed.followUpHeading, parsed.followUpEmail),
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
    context?: string
    /** User's local date, e.g. "2026-11-20 (Friday)", to resolve "by Friday". */
    today?: string
    /** Language the client speaks, e.g. "English" — the follow-up email is written in it. */
    clientLanguage?: string
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
  const context = String(body.context ?? '').slice(0, 6_000)

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

  const ask = (extra?: string) =>
    fetch('https://api.openai.com/v1/chat/completions', {
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
        { role: 'system', content: systemPrompt(
            template.sections,
            body.language,
            template.instructions,
            String(body.today ?? '').slice(0, 40) || undefined,
            String(body.clientLanguage ?? '').slice(0, 30) || undefined
          ) },
        {
          role: 'user',
          content:
            (context
              ? 'BACKGROUND from the user (job post, proposal, stack). Use it to understand terms; what was ' +
                `agreed must come from the transcript:\n${context}\n\n`
              : '') + `MY NOTES:\n${userNotes || '(none)'}\n\nTRANSCRIPT:\n${transcriptText || '(none)'}`
        },
        ...(extra ? [{ role: 'user', content: extra }] : [])
      ]
    })
  })

  const run = async (extra?: string) => {
    const res = await ask(extra)
    if (!res.ok) {
      console.error('[enhance-notes] openai error', res.status, (await res.text()).slice(0, 500))
      throw new ApiError(502, 'ai_failed', 'Could not generate notes right now. Please try again.')
    }
    const completion = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    return { raw: completion.choices?.[0]?.message?.content ?? '', result: parseResult(completion.choices?.[0]?.message?.content ?? '') }
  }

  let { result } = await run()
  // Guard: a brief with no sections (only the appended email) is a failed answer.
  if (!/^##\s/m.test(result.notesMarkdown.split(/\n##\s[^\n]*\n>/)[0])) {
    console.warn('[enhance-notes] empty brief, retrying', meetingId)
    result = (await run('Your notesMarkdown was empty. Write the notes sections now (at least the first one), then the email.')).result
  }

  await db.from('meeting_sessions').update({ enhanced_at: new Date().toISOString() }).eq('id', meetingId)

  console.log('[enhance-notes] done', meetingId)
  return json(result)
})
