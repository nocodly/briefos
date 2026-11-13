import Stripe from 'https://esm.sh/stripe@14?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno'

// =============================================================================
// Stripe webhook — the ONLY place that grants or removes a paid plan.
// Handles the full subscription lifecycle:
//   checkout.session.completed      → link Stripe customer to user, plan = pro
//   customer.subscription.updated   → sync plan from subscription status
//   customer.subscription.deleted   → plan = trial
//   invoice.payment_failed          → record status (Stripe retries; access
//                                     is removed when the sub is canceled)
// Required secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
//                   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Stripe events to enable: the four above.
// =============================================================================

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10' })
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// Subscription statuses that keep paid access. past_due keeps access while
// Stripe retries the card (grace period); anything else falls back to free.
const PAID_STATUSES = new Set<Stripe.Subscription.Status>(['active', 'trialing', 'past_due'])

function planFor(status: Stripe.Subscription.Status): 'pro' | 'trial' {
  return PAID_STATUSES.has(status) ? 'pro' : 'trial'
}

// Since API 2025-03-31 ("basil") current_period_end lives on subscription
// items, not on the subscription. Event payloads use the endpoint's API version
// (2026-04-22.dahlia), so read both locations and never throw on a missing one.
function periodEnd(sub: Stripe.Subscription): string | null {
  const raw = sub as unknown as {
    current_period_end?: number
    items?: { data?: { current_period_end?: number }[] }
  }
  const ts = raw.current_period_end ?? raw.items?.data?.[0]?.current_period_end
  return typeof ts === 'number' ? new Date(ts * 1000).toISOString() : null
}

async function updateBy(column: 'id' | 'stripe_customer_id', value: string, fields: Record<string, unknown>) {
  const { data, error } = await supabase
    .from('profiles')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq(column, value)
    .select('id')
  if (error) throw new Error(`supabase update failed: ${error.message}`)
  if (!data || data.length === 0) {
    console.warn(`[stripe-webhook] no profile matched ${column}=${value}`)
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.client_reference_id
  if (!userId) throw new Error('checkout session has no client_reference_id')

  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id
  const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id

  const fields: Record<string, unknown> = { plan: 'pro', stripe_customer_id: customerId ?? null }
  if (subId) {
    const sub = await stripe.subscriptions.retrieve(subId)
    fields.stripe_subscription_id = sub.id
    fields.subscription_status = sub.status
    fields.current_period_end = periodEnd(sub)
    fields.plan = planFor(sub.status)
  }
  await updateBy('id', userId, fields)
  console.log(`[stripe-webhook] checkout completed for user ${userId} → ${fields.plan}`)
}

async function handleSubscriptionChange(sub: Stripe.Subscription, deleted: boolean) {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
  const plan = deleted ? 'trial' : planFor(sub.status)
  await updateBy('stripe_customer_id', customerId, {
    plan,
    stripe_subscription_id: sub.id,
    subscription_status: deleted ? 'canceled' : sub.status,
    current_period_end: periodEnd(sub)
  })
  console.log(`[stripe-webhook] subscription ${sub.id} (${sub.status}) → ${plan}`)
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
  if (!customerId) return
  await updateBy('stripe_customer_id', customerId, { subscription_status: 'past_due' })
  console.log(`[stripe-webhook] payment failed for customer ${customerId}`)
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const sig = req.headers.get('stripe-signature')
  if (!sig) return new Response('Missing signature', { status: 400 })

  const body = await req.text()
  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret)
  } catch (err) {
    console.error('[stripe-webhook] signature verification failed:', err)
    return new Response('Invalid signature', { status: 400 })
  }

  console.log('[stripe-webhook] event:', event.type, event.id)

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session)
        break
      case 'customer.subscription.updated':
        await handleSubscriptionChange(event.data.object as Stripe.Subscription, false)
        break
      case 'customer.subscription.deleted':
        await handleSubscriptionChange(event.data.object as Stripe.Subscription, true)
        break
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice)
        break
      default:
        // Ignore other events.
        break
    }
  } catch (err) {
    // 500 makes Stripe retry the event later.
    console.error('[stripe-webhook] handler failed:', err)
    return new Response('Handler error', { status: 500 })
  }

  return new Response('ok', { status: 200 })
})
