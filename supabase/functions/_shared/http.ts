import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno'
import { limitsFor, type PlanLimits } from './plans.ts'

// =============================================================================
// Shared helpers for user-facing Edge Functions: CORS, JSON responses, and
// authentication (Supabase JWT → user + plan limits).
// =============================================================================

export const corsHeaders = {
  // The desktop renderer runs from file:// (origin "null") or the Vite dev
  // server; auth is by bearer token, so a wildcard origin is safe here.
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

/** Error with a stable machine-readable code the app can switch on. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message)
  }
}

export function errorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    return json({ error: { code: err.code, message: err.message } }, err.status)
  }
  console.error('[fn] unexpected error:', err)
  return json({ error: { code: 'internal', message: 'Something went wrong. Please try again.' } }, 500)
}

let admin: SupabaseClient | null = null
export function adminClient(): SupabaseClient {
  if (!admin) {
    admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false }
    })
  }
  return admin
}

export interface AuthContext {
  userId: string
  plan: string
  limits: PlanLimits
}

/** Validate the caller's JWT and load their plan. Throws ApiError(401). */
export async function authenticate(req: Request): Promise<AuthContext> {
  const header = req.headers.get('Authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) throw new ApiError(401, 'unauthorized', 'Please sign in again.')

  const db = adminClient()
  const { data, error } = await db.auth.getUser(token)
  if (error || !data.user) throw new ApiError(401, 'unauthorized', 'Please sign in again.')

  const { data: profile, error: pErr } = await db
    .from('profiles')
    .select('plan')
    .eq('id', data.user.id)
    .single()
  if (pErr) throw new ApiError(500, 'profile_missing', 'Your profile could not be loaded.')

  const plan = (profile?.plan as string) ?? 'trial'
  return { userId: data.user.id, plan, limits: limitsFor(plan) }
}

/** Wrap a handler with CORS preflight, method check and error mapping. */
export function serve(handler: (req: Request) => Promise<Response>): void {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (req.method !== 'POST') return json({ error: { code: 'method', message: 'POST only' } }, 405)
    try {
      return await handler(req)
    } catch (err) {
      return errorResponse(err)
    }
  })
}

export function requireEnv(name: string): string {
  const v = Deno.env.get(name)
  if (!v) throw new ApiError(500, 'not_configured', `Server is missing ${name}.`)
  return v
}
