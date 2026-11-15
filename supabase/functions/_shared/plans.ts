// =============================================================================
// Plan limits — single source of truth for the server. The desktop app shows
// these numbers but never enforces them; the server does.
// Legacy plan names map onto the two public tiers: trial/byok → free.
// =============================================================================

export type Tier = 'free' | 'pro' | 'max'

export interface PlanLimits {
  tier: Tier
  /** Meetings that can be started per calendar month (null = unlimited). */
  meetingsPerMonth: number | null
  /** Max recorded minutes in one meeting. */
  maxMeetingMinutes: number
  /** Included recording minutes per month (null = no hours limit). Top-ups add to it. */
  monthlyMinutes: number | null
  /** Notes older than this are hidden in the app (null = forever). */
  historyDays: number | null
  /** Note templates available. */
  templates: readonly string[]
  /** Cross-meeting AI chat, period reports, follow-up emails, exports. */
  proFeatures: boolean
}

export const FREE_TEMPLATES = ['general', 'one-on-one', 'standup'] as const
export const ALL_TEMPLATES = [...FREE_TEMPLATES, 'sales-call', 'interview', 'customer-discovery'] as const

export const LIMITS: Record<Tier, PlanLimits> = {
  free: {
    tier: 'free',
    meetingsPerMonth: 10,
    maxMeetingMinutes: 60,
    monthlyMinutes: null,
    historyDays: 30,
    templates: FREE_TEMPLATES,
    proFeatures: false
  },
  pro: {
    tier: 'pro',
    meetingsPerMonth: null,
    maxMeetingMinutes: 240,
    monthlyMinutes: 25 * 60,
    historyDays: null,
    templates: ALL_TEMPLATES,
    proFeatures: true
  },
  max: {
    tier: 'max',
    meetingsPerMonth: null,
    maxMeetingMinutes: 300,
    monthlyMinutes: 100 * 60,
    historyDays: null,
    templates: ALL_TEMPLATES,
    proFeatures: true
  }
}

export function tierFor(plan: string | null | undefined): Tier {
  if (plan === 'max' || plan === 'enterprise') return 'max'
  return plan === 'pro' ? 'pro' : 'free'
}

/** Hours sold in one top-up pack. */
export const TOPUP_HOURS = 10

export function limitsFor(plan: string | null | undefined): PlanLimits {
  return LIMITS[tierFor(plan)]
}
