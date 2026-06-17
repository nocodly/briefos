import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  }
})

export type PlanType = 'trial' | 'byok' | 'pro' | 'enterprise'

export interface Profile {
  id: string
  email: string
  plan: PlanType
  license_key: string | null
  meetings_this_month: number
  created_at: string
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  if (error) {
    console.error('[supabase] getProfile error', error.message)
    return null
  }
  return data as Profile
}

export async function updateProfile(userId: string, fields: Partial<Pick<Profile, 'plan' | 'license_key'>>): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', userId)
  if (error) throw new Error(error.message)
}

export async function incrementMeetingCount(userId: string): Promise<void> {
  const { error } = await supabase.rpc('increment_meetings', { user_id: userId })
  if (error) throw new Error(error.message)
}

export const TRIAL_LIMIT = 10

// Stripe Payment Link for Pro plan — set in .env as VITE_STRIPE_PRO_LINK
// Format: https://buy.stripe.com/xxxxx
// client_reference_id (user ID) is appended dynamically before opening
export const STRIPE_PRO_LINK = import.meta.env.VITE_STRIPE_PRO_LINK as string | undefined
