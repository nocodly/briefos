import Stripe from 'https://esm.sh/stripe@14?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10' })
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret)
  } catch (err) {
    console.error('[stripe-webhook] signature verification failed:', err)
    return new Response(`Webhook Error: ${err}`, { status: 400 })
  }

  console.log('[stripe-webhook] event:', event.type)

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const userId = session.client_reference_id

    if (!userId) {
      console.error('[stripe-webhook] no client_reference_id in session')
      return new Response('Missing user ID', { status: 400 })
    }

    const { error } = await supabase
      .from('profiles')
      .update({ plan: 'pro', updated_at: new Date().toISOString() })
      .eq('id', userId)

    if (error) {
      console.error('[stripe-webhook] supabase update failed:', error.message)
      return new Response('DB error', { status: 500 })
    }

    console.log(`[stripe-webhook] activated pro for user ${userId}`)
  }

  if (event.type === 'customer.subscription.deleted') {
    // Downgrade to trial when subscription is cancelled
    const sub = event.data.object as Stripe.Subscription
    const customerId = sub.customer as string

    // Find user by stripe_customer_id if you store it, otherwise skip
    // For MVP: manual downgrade via Supabase dashboard
    console.log('[stripe-webhook] subscription cancelled for customer', customerId)
  }

  return new Response('ok', { status: 200 })
})
