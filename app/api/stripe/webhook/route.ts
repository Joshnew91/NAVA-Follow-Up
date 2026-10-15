import type { NextRequest } from 'next/server'
import type Stripe from 'stripe'
import { syncSubscription } from '@/lib/jobs'
import { getStripe, invoiceSubscriptionId } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>

const STALE_PROCESSING_MS = 2 * 60 * 1000

async function webhookSecret(admin: Admin) {
  if (process.env.STRIPE_WEBHOOK_SECRET) return process.env.STRIPE_WEBHOOK_SECRET
  const { data } = await admin.from('platform_settings').select('stripe_webhook_secret').single()
  return (data?.stripe_webhook_secret as string | null) ?? null
}

async function claimEvent(admin: Admin, event: Stripe.Event): Promise<boolean> {
  const { error } = await admin.from('stripe_events').insert({ id: event.id, type: event.type })
  if (!error) return true
  if (error.code !== '23505') throw error
  const { data } = await admin.from('stripe_events').select('status, received_at').eq('id', event.id).single()
  if (!data || data.status === 'processed') return false
  const stale = Date.now() - new Date(data.received_at as string).getTime() > STALE_PROCESSING_MS
  if (data.status === 'processing' && !stale) return false
  const { data: reclaimed } = await admin
    .from('stripe_events')
    .update({ status: 'processing', received_at: new Date().toISOString(), error: null })
    .eq('id', event.id)
    .eq('status', data.status)
    .select('id')
  return Boolean(reclaimed?.length)
}

async function syncById(admin: Admin, stripe: Stripe, subscriptionId: string | null) {
  if (!subscriptionId) return null
  return syncSubscription(admin, await stripe.subscriptions.retrieve(subscriptionId))
}

async function homeForCustomer(admin: Admin, customer: Stripe.Invoice['customer']) {
  const id = typeof customer === 'string' ? customer : customer?.id
  if (!id) return null
  const { data } = await admin.from('subscriptions').select('funeral_home_id').eq('stripe_customer_id', id).maybeSingle()
  return (data?.funeral_home_id as string | undefined) ?? null
}

async function homeName(admin: Admin, homeId: string) {
  const { data } = await admin.from('funeral_homes').select('name').eq('id', homeId).single()
  return (data?.name as string | undefined) ?? 'your funeral home'
}

async function queueEmail(admin: Admin, homeId: string, kind: string, payload: Record<string, unknown>, dedupe: string) {
  const { error } = await admin.rpc('nava_queue_home_email', {
    p_home: homeId,
    p_kind: kind,
    p_payload: { home_name: await homeName(admin, homeId), ...payload },
    p_dedupe: dedupe,
  })
  if (error) console.error('[nava] queue billing email failed', kind, error)
}

const toDate = (unix: number | null | undefined) =>
  unix ? new Date(unix * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : null

async function handle(admin: Admin, stripe: Stripe, event: Stripe.Event): Promise<string | null> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object
      const sub = typeof session.subscription === 'string' ? session.subscription : (session.subscription?.id ?? null)
      return syncById(admin, stripe, sub)
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed': {
      const homeId = await syncById(admin, stripe, event.data.object.id)
      const prev = (event.data as { previous_attributes?: Partial<Stripe.Subscription> }).previous_attributes
      const sub = event.data.object
      if (homeId && event.type === 'customer.subscription.updated' && prev && 'cancel_at_period_end' in prev) {
        const ending = Boolean(sub.cancel_at_period_end || sub.cancel_at)
        await queueEmail(
          admin,
          homeId,
          ending ? 'subscription_canceling' : 'subscription_reactivated',
          { ends_on: toDate(sub.items.data[0]?.current_period_end) },
          `${ending ? 'cancel' : 'resume'}:${event.id}`,
        )
      }
      if (homeId && event.type === 'customer.subscription.deleted') {
        await queueEmail(admin, homeId, 'subscription_ended', {}, `ended:${sub.id}`)
      }
      return homeId
    }
    case 'invoice.paid': {
      const invoice = event.data.object
      const homeId = (await syncById(admin, stripe, invoiceSubscriptionId(invoice))) ?? (await homeForCustomer(admin, invoice.customer))
      if (homeId && invoice.amount_paid > 0) {
        await queueEmail(
          admin,
          homeId,
          'payment_receipt',
          {
            amount_cents: invoice.amount_paid,
            invoice_number: invoice.number,
            invoice_url: invoice.hosted_invoice_url,
            paid_on: toDate(invoice.status_transitions?.paid_at ?? invoice.created),
          },
          `receipt:${invoice.id}`,
        )
      }
      return homeId
    }
    case 'invoice.payment_failed':
    case 'invoice.payment_action_required': {
      const invoice = event.data.object
      const homeId = (await syncById(admin, stripe, invoiceSubscriptionId(invoice))) ?? (await homeForCustomer(admin, invoice.customer))
      if (homeId) {
        const { data } = await admin.from('platform_settings').select('grace_period_days').single()
        await queueEmail(
          admin,
          homeId,
          event.type === 'invoice.payment_failed' ? 'payment_failed' : 'payment_action_required',
          {
            amount_cents: invoice.amount_due,
            invoice_url: invoice.hosted_invoice_url,
            next_attempt: toDate(invoice.next_payment_attempt),
            grace_days: (data?.grace_period_days as number | undefined) ?? 7,
          },
          `${event.type === 'invoice.payment_failed' ? 'payfail' : 'payaction'}:${invoice.id}:${invoice.attempt_count}`,
        )
      }
      return homeId
    }
    case 'invoice.upcoming': {
      const invoice = event.data.object
      const homeId = await homeForCustomer(admin, invoice.customer)
      if (homeId) {
        await queueEmail(
          admin,
          homeId,
          'payment_reminder',
          { amount_cents: invoice.amount_due, due_on: toDate(invoice.next_payment_attempt ?? invoice.period_end) },
          `upcoming:${invoiceSubscriptionId(invoice) ?? homeId}:${invoice.period_end}`,
        )
      }
      return homeId
    }
    default:
      return null
  }
}

export async function POST(request: NextRequest) {
  const admin = createAdminClient()
  const secret = await webhookSecret(admin)
  if (!secret || !process.env.STRIPE_SECRET_KEY) return new Response('Webhook not configured', { status: 503 })

  const stripe = getStripe()
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(await request.text(), request.headers.get('stripe-signature') ?? '', secret)
  } catch {
    return new Response('Invalid signature', { status: 400 })
  }

  if (!(await claimEvent(admin, event))) return Response.json({ received: true, duplicate: true })

  try {
    const homeId = await handle(admin, stripe, event)
    await admin
      .from('stripe_events')
      .update({ status: 'processed', processed_at: new Date().toISOString(), funeral_home_id: homeId })
      .eq('id', event.id)
    return Response.json({ received: true })
  } catch (error) {
    console.error('[nava] stripe webhook failed', event.type, error)
    await admin
      .from('stripe_events')
      .update({ status: 'failed', error: String(error instanceof Error ? error.message : error).slice(0, 500) })
      .eq('id', event.id)
    return new Response('Processing failed', { status: 500 })
  }
}
