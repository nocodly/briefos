import { supabase } from './supabaseClient'

// Stripe Payment Links (public URLs, baked in at build time from .env).
const LINKS = {
  pro: import.meta.env.VITE_STRIPE_PRO_LINK as string | undefined,
  max: import.meta.env.VITE_STRIPE_MAX_LINK as string | undefined,
  topup: import.meta.env.VITE_STRIPE_TOPUP_LINK as string | undefined
}

export type Checkout = keyof typeof LINKS

export const PRICES: Record<Checkout, string> = { pro: '$19/mo', max: '$39/mo', topup: '$6' }

/** Open Stripe checkout for the signed-in user. Throws a readable error. */
export async function openCheckout(kind: Checkout): Promise<void> {
  const {
    data: { user }
  } = await supabase.auth.getUser()
  const link = LINKS[kind]
  if (!link || !user) throw new Error('Payments are not available right now. Please try again later.')
  const url = new URL(link)
  // The webhook links the payment to this account by client_reference_id.
  url.searchParams.set('client_reference_id', user.id)
  if (user.email) url.searchParams.set('prefilled_email', user.email)
  window.open(url.toString(), '_blank')
}
