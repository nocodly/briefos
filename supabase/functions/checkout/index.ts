import Stripe from 'https://esm.sh/stripe@14?target=deno'
import { ApiError, adminClient, authenticate, json, requireEnv, serve } from '../_shared/http.ts'
import { TIER_PRICE_IDS, TIER_PRICES, tierForCountry, type PlanKind } from '../_shared/regions.ts'

// =============================================================================
// POST /checkout   { kind: 'pro' | 'max' | 'topup', country?: string, quote?: true }
// → { url } (Stripe Checkout) or, with quote, { tier, prices } only.
//
// Regional pricing: the app sends the visitor country it got from
// minutama.com/api/region (Cloudflare). The price is picked here from that
// country's purchasing-power tier. The Stripe webhook grants the plan as usual.
// =============================================================================

const NO_VAT = 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet. / No VAT charged (small business, § 19 UStG).'
const SUBMIT_TEXT =
  'No VAT is charged (small business under § 19 UStG). By paying you agree to the Terms at minutama.com/terms. ' +
  'You can withdraw within 14 days for a full refund: write to hello@minutama.com. Cancel anytime at minutama.com/account.'

serve(async (req) => {
  const auth = await authenticate(req)
  let body: { kind?: string; country?: string; quote?: boolean }
  try {
    body = await req.json()
  } catch {
    throw new ApiError(400, 'bad_request', 'Expected JSON body.')
  }
  const country = /^[A-Za-z]{2}$/.test(String(body.country ?? '')) ? String(body.country).toUpperCase() : null
  const tier = tierForCountry(country)
  if (body.quote) return json({ country, tier, prices: TIER_PRICES[tier] })

  const kind = String(body.kind ?? '') as PlanKind
  if (!['pro', 'max', 'topup'].includes(kind)) throw new ApiError(400, 'bad_request', 'Unknown plan.')

  const db = adminClient()
  const { data: profile } = await db.from('profiles').select('stripe_customer_id').eq('id', auth.userId).maybeSingle()
  const { data: user } = await db.auth.admin.getUserById(auth.userId)
  const customer = (profile?.stripe_customer_id as string | null) ?? undefined

  const stripe = new Stripe(requireEnv('STRIPE_SECRET_KEY'), { apiVersion: '2024-04-10' })
  const metadata = { app: 'minutama', minutama_plan: kind, region_tier: String(tier), country: country ?? '' }
  const common = {
    line_items: [{ price: TIER_PRICE_IDS[tier][kind], quantity: 1 }],
    client_reference_id: auth.userId,
    metadata,
    custom_text: { submit: { message: SUBMIT_TEXT } },
    cancel_url: 'https://minutama.com/#pricing',
    ...(customer ? { customer } : { customer_email: user?.user?.email ?? undefined })
  }

  try {
    const session =
      kind === 'topup'
        ? await stripe.checkout.sessions.create({
            ...common,
            mode: 'payment',
            success_url: 'https://minutama.com/welcome-pro?topup=1',
            allow_promotion_codes: true,
            invoice_creation: { enabled: true, invoice_data: { footer: NO_VAT, metadata } },
            ...(customer ? {} : { customer_creation: 'always' as const })
          })
        : await stripe.checkout.sessions.create({
            ...common,
            mode: 'subscription',
            success_url: 'https://minutama.com/welcome-pro',
            allow_promotion_codes: true,
            subscription_data: { metadata }
          })
    console.log('[checkout]', auth.userId, kind, 'tier', tier, country)
    return json({ url: session.url, tier, prices: TIER_PRICES[tier] })
  } catch (err) {
    console.error('[checkout] stripe error', (err as Error).message)
    throw new ApiError(502, 'checkout_failed', 'Could not open checkout. Please try again.')
  }
})
