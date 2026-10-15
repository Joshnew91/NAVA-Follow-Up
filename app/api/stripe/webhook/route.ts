import type { NextRequest } from 'next/server'
import { syncSubscription } from '@/lib/jobs'
import { getStripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) return new Response('Webhook not configured', { status: 503 })

  const stripe = getStripe()
  let event
  try {
    event = stripe.webhooks.constructEvent(await request.text(), request.headers.get('stripe-signature') ?? '', secret)
  } catch {
    return new Response('Invalid signature', { status: 400 })
  }

  const admin = createAdminClient()
  if (event.type.startsWith('customer.subscription.')) {
    await syncSubscription(admin, event.data.object as import('stripe').Stripe.Subscription)
  } else if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    if (typeof session.subscription === 'string') {
      await syncSubscription(admin, await stripe.subscriptions.retrieve(session.subscription))
    }
  } else if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object
    const customer = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
    if (customer) {
      const { data } = await admin
        .from('subscriptions')
        .select('funeral_home_id, funeral_homes(name, notification_email)')
        .eq('stripe_customer_id', customer)
        .single()
      const home = (data?.funeral_homes ?? null) as unknown as { name: string; notification_email: string | null } | null
      if (data && home?.notification_email) {
        await admin.from('email_outbox').upsert(
          {
            funeral_home_id: data.funeral_home_id,
            kind: 'payment_failed',
            to_email: home.notification_email,
            payload: { home_name: home.name },
            dedupe_key: `payfail:${invoice.id}`,
          },
          { onConflict: 'dedupe_key', ignoreDuplicates: true },
        )
      }
    }
  }
  return Response.json({ received: true })
}
