import { ApiError, authenticate, json, requireEnv, serve } from '../_shared/http.ts'

// =============================================================================
// POST /period-report   (application/json)
// { label: string, from: string, to: string, meetings: MeetingContext[] }
// Response: the period report JSON (see SYSTEM below).
//
// Cross-meeting report for a date range. The app sends the compact meeting
// summaries it keeps locally; the server only runs the AI step. Pro / Pro Max.
// =============================================================================

const MODEL = Deno.env.get('PERIOD_MODEL') ?? 'gpt-4o-mini'
const MAX_INPUT_CHARS = 150_000
const MAX_MEETINGS = 200

const SYSTEM = `You are analyzing multiple meeting summaries from a specific time period.
Return ONLY valid JSON — no markdown, no preamble.

Cross-reference the meetings to find:
- Strategic themes that appeared in multiple meetings
- All decisions made across the entire period
- Action items that are still open
- Questions that appeared in multiple meetings but were never resolved
- Patterns in how the person and their contacts communicate and decide

Return EXACTLY this schema:
{
  "executiveSummary": "3-5 sentences summarizing what this entire period was about",
  "mainThemes": ["theme"],
  "allDecisions": [{ "decision": "text", "meeting": "meeting title", "date": "YYYY-MM-DD" }],
  "openActions": [{ "person": "name", "task": "text", "deadline": "date or null",
    "priority": "high|medium|low", "sourceMeeting": "meeting title", "sourceDate": "YYYY-MM-DD" }],
  "recurringQuestions": [{ "question": "text", "appearedIn": ["meeting title 1", "meeting title 2"] }],
  "topTopics": [{ "topic": "name", "count": 3 }],
  "speakerStats": [],
  "aiInsights": [{ "type": "pattern|warning|opportunity", "text": "Specific insight with evidence" }],
  "keywords": ["top 15 recurring terms"]
}

Rules:
- recurringQuestions: ONLY questions that appeared in 2 or more meetings.
- Every openActions item MUST name its sourceMeeting.
- topTopics count = number of meetings the topic appeared in, sorted descending.
- Ground every insight in the summaries; never speculate or invent facts.
- Write everything in the language most of the meetings were held in.
- If a field has no data, use [] — never null.`

interface MeetingContext {
  title?: string
  date?: string
  durationMinutes?: number
  notes?: string
  tldr?: string
  decisions?: unknown
  actionItems?: unknown
  openQuestions?: unknown
  keywords?: unknown
}

serve(async (req) => {
  const auth = await authenticate(req)
  if (!auth.limits.proFeatures) {
    throw new ApiError(402, 'pro_required', 'Period Reports are part of Pro. Upgrade in Settings → Plan.')
  }

  let body: { label?: string; from?: string; to?: string; meetings?: MeetingContext[] }
  try {
    body = await req.json()
  } catch {
    throw new ApiError(400, 'bad_request', 'Expected JSON body.')
  }
  const meetings = (Array.isArray(body.meetings) ? body.meetings : []).slice(0, MAX_MEETINGS)
  if (meetings.length === 0) throw new ApiError(400, 'no_meetings', 'No meetings in this period yet.')

  const userContent = [
    `Period: ${String(body.label ?? '').slice(0, 80)}`,
    `Date range: ${String(body.from ?? '').slice(0, 40)} to ${String(body.to ?? '').slice(0, 40)}`,
    `Total meetings: ${meetings.length}`,
    '',
    JSON.stringify(meetings)
  ]
    .join('\n')
    .slice(0, MAX_INPUT_CHARS)

  console.log('[period-report] user', auth.userId, 'meetings', meetings.length, 'chars', userContent.length)

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${requireEnv('OPENAI_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: userContent }
      ]
    })
  })
  if (!res.ok) {
    console.error('[period-report] openai error', res.status, (await res.text()).slice(0, 300))
    throw new ApiError(502, 'ai_failed', 'Could not build the report right now. Please try again.')
  }
  const completion = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  try {
    return json(JSON.parse(completion.choices?.[0]?.message?.content ?? '{}'))
  } catch {
    throw new ApiError(502, 'ai_bad_output', 'AI returned an invalid response. Please try again.')
  }
})
