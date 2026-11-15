import { supabase } from './supabaseClient'

// =============================================================================
// Read-only view of the user's plan + this month's usage. The numbers come
// from the server tables (profiles, usage) via RLS — the server is the one that
// enforces them; this is only for display.
// Keep in sync with supabase/functions/_shared/plans.ts.
// =============================================================================

export const FREE_MEETINGS_PER_MONTH = 10
export const INCLUDED_HOURS = { pro: 25, max: 100 } as const
export const TOPUP_HOURS = 10

export type Tier = 'free' | 'pro' | 'max'

export interface UsageInfo {
  tier: Tier
  meetingsUsed: number
  /** null = no meeting-count limit (Pro / Max). */
  meetingsLimit: number | null
  /** Hours of calls recorded this month (Pro / Max). */
  hoursUsed: number
  /** Included + topped-up hours this month (null on Free). */
  hoursLimit: number | null
  /** Extra hours bought this month. */
  bonusHours: number
}

function monthStart(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10)
}

export function tierOf(plan: string | null | undefined): Tier {
  if (plan === 'max' || plan === 'enterprise') return 'max'
  return plan === 'pro' ? 'pro' : 'free'
}

export async function getUsage(): Promise<UsageInfo | null> {
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: profile }, { data: usage }] = await Promise.all([
    supabase.from('profiles').select('plan').eq('id', user.id).maybeSingle(),
    supabase
      .from('usage')
      .select('meetings, seconds, bonus_seconds')
      .eq('user_id', user.id)
      .eq('period', monthStart())
      .maybeSingle()
  ])

  const tier = tierOf(profile?.plan as string | undefined)
  // usage.seconds counts both audio channels (mic + computer) → ÷ 2 per hour.
  const hoursUsed = ((usage?.seconds as number | undefined) ?? 0) / 7200
  const bonusHours = ((usage?.bonus_seconds as number | undefined) ?? 0) / 7200
  return {
    tier,
    meetingsUsed: (usage?.meetings as number | undefined) ?? 0,
    meetingsLimit: tier === 'free' ? FREE_MEETINGS_PER_MONTH : null,
    hoursUsed,
    hoursLimit: tier === 'free' ? null : INCLUDED_HOURS[tier] + bonusHours,
    bonusHours
  }
}
