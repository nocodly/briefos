import { create } from 'zustand'
import { supabase } from './supabaseClient'
import { track } from './track'

// =============================================================================
// Billing in the app. Prices follow the user's region (purchasing-power tiers,
// see supabase/functions/_shared/regions.ts): the country comes from
// minutama.com/api/region (Cloudflare), the checkout session is created by the
// server with that region's price. Payment Links are only a fallback.
// =============================================================================

const LINKS = {
  pro: import.meta.env.VITE_STRIPE_PRO_LINK as string | undefined,
  max: import.meta.env.VITE_STRIPE_MAX_LINK as string | undefined,
  topup: import.meta.env.VITE_STRIPE_TOPUP_LINK as string | undefined
}

export type Checkout = keyof typeof LINKS

interface Region {
  country: string | null
  tier: number
  prices: Record<Checkout, number> // US cents
}

const DEFAULT_REGION: Region = { country: null, tier: 1, prices: { pro: 1900, max: 3900, topup: 600 } }

const useRegion = create<Region>(() => DEFAULT_REGION)
let regionPromise: Promise<Region> | null = null

function loadRegion(): Promise<Region> {
  if (!regionPromise) {
    regionPromise = fetch('https://minutama.com/api/region', { cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<Region>) : DEFAULT_REGION))
      .then((r) => {
        const region = r && r.prices ? r : DEFAULT_REGION
        useRegion.setState(region)
        return region
      })
      .catch(() => {
        regionPromise = null
        return DEFAULT_REGION
      })
  }
  return regionPromise
}

const usd = (cents: number) => '$' + (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2))

/** Formatted prices for the user's region: { pro: '$7/mo', max: '$15/mo', topup: '$3' }. */
export function usePrices(): Record<Checkout, string> {
  const prices = useRegion((s) => s.prices)
  void loadRegion()
  return { pro: `${usd(prices.pro)}/mo`, max: `${usd(prices.max)}/mo`, topup: usd(prices.topup) }
}

/** Open Stripe checkout for the signed-in user. Throws a readable error. */
export async function openCheckout(kind: Checkout): Promise<void> {
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Please sign in again.')
  const region = await loadRegion()
  track('checkout_opened', { kind, tier: region.tier, country: region.country })
  try {
    const { createCheckout } = await import('./api')
    const { url } = await createCheckout({ kind, country: region.country })
    window.open(url, '_blank')
    return
  } catch (err) {
    console.warn('[billing] regional checkout failed, using the standard link', (err as Error).message)
  }
  const link = LINKS[kind]
  if (!link) throw new Error('Payments are not available right now. Please try again later.')
  const url = new URL(link)
  // The webhook links the payment to this account by client_reference_id.
  url.searchParams.set('client_reference_id', user.id)
  if (user.email) url.searchParams.set('prefilled_email', user.email)
  window.open(url.toString(), '_blank')
}

/** Open "Manage subscription" (Stripe Customer Portal) in the browser. */
export async function openBillingPortal(): Promise<void> {
  const { billingPortal } = await import('./api')
  const { url } = await billingPortal()
  track('portal_opened')
  window.open(url, '_blank')
}
