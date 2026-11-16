import Stripe from 'https://esm.sh/stripe@14?target=deno'
import { ApiError, adminClient, authenticate, json, requireEnv, serve } from '../_shared/http.ts'

// =============================================================================
// POST /billing-portal   → { url }
// Opens the Stripe Customer Portal (Minutama configuration) for the caller:
// cancel, switch Pro ↔ Pro Max, update card, download invoices.
// Users without a Stripe customer get the hosted login page instead.
// =============================================================================

const PORTAL_CONFIG = Deno.env.get('STRIPE_PORTAL_CONFIG') ?? 'bpc_1UcOR6FryyNxk6Pn6TxG41OA'
const LOGIN_URL = 'https://billing.stripe.com/p/login/aFaaEX7V59w4baj1wG5Vu00'

serve(async (req) => {
  const auth = await authenticate(req)
  const { data: profile, error } = await adminClient()
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', auth.userId)
    .maybeSingle()
  if (error) throw new Error(`profile lookup failed: ${error.message}`)

  const customer = profile?.stripe_customer_id as string | null | undefined
  if (!customer) return json({ url: LOGIN_URL, login: true })

  const stripe = new Stripe(requireEnv('STRIPE_SECRET_KEY'), { apiVersion: '2024-04-10' })
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer,
      configuration: PORTAL_CONFIG,
      return_url: 'https://minutama.com/account'
    })
    return json({ url: session.url })
  } catch (err) {
    console.error('[billing-portal] stripe error', (err as Error).message)
    throw new ApiError(502, 'portal_failed', 'Could not open subscription settings. Please try again.')
  }
})
