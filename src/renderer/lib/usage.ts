import { supabase } from './supabaseClient'

// =============================================================================
// Read-only view of the user's plan + this month's usage. The numbers come
// from the server tables (profiles, usage) via RLS — the server is the one that
// enforces them; this is only for display.
// Keep FREE_MEETINGS_PER_MONTH in sync with supabase/functions/_shared/plans.ts.
// =============================================================================

export const FREE_MEETINGS_PER_MONTH = 10

export interface UsageInfo {
  tier: 'free' | 'pro'
  meetingsUsed: number
  /** null = unlimited (Pro). */
  meetingsLimit: number | null
}

function monthStart(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10)
}

export async function getUsage(): Promise<UsageInfo | null> {
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: profile }, { data: usage }] = await Promise.all([
    supabase.from('profiles').select('plan').eq('id', user.id).maybeSingle(),
    supabase.from('usage').select('meetings').eq('user_id', user.id).eq('period', monthStart()).maybeSingle()
  ])

  const plan = (profile?.plan as string | undefined) ?? 'trial'
  const tier = plan === 'pro' || plan === 'enterprise' ? 'pro' : 'free'
  return {
    tier,
    meetingsUsed: (usage?.meetings as number | undefined) ?? 0,
    meetingsLimit: tier === 'pro' ? null : FREE_MEETINGS_PER_MONTH
  }
}
