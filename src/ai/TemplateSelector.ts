// =============================================================================
// TemplateSelector — keyword heuristic to auto-detect meeting type so the right
// prompt template is used. Returns a type that maps to a prompts/*.md file
// (see PROMPT_FILES in SummaryEngine). Falls back to 'default' when unsure.
// =============================================================================

const SIGNALS: Record<string, string[]> = {
  standup: ['yesterday', 'today', 'blocker', 'blocked', 'standup', 'daily', 'progress', 'sprint'],
  sales: ['pricing', 'budget', 'proposal', 'contract', 'demo', 'trial', 'discount', 'close', 'deal'],
  onboarding: ['welcome', 'onboard', 'getting started', 'setup', 'introduce', 'first time'],
  review: ['review', 'retrospective', 'retro', 'what went well', 'improve', 'feedback']
}

export type MeetingType = keyof typeof SIGNALS | 'default'

/**
 * Pick the best-matching meeting type from transcript text. Requires at least
 * 2 keyword hits to override 'default' (avoids spurious matches).
 */
export function detectMeetingType(transcript: string): MeetingType {
  const text = transcript.toLowerCase()
  let best: MeetingType = 'default'
  let bestScore = 0

  for (const [type, keywords] of Object.entries(SIGNALS)) {
    const score = keywords.filter((kw) => text.includes(kw)).length
    if (score > bestScore) {
      bestScore = score
      best = type as MeetingType
    }
  }

  return bestScore >= 2 ? best : 'default'
}
