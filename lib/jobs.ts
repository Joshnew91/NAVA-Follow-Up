import 'server-only'
import type Stripe from 'stripe'
import { renderEmail, sendEmail } from './email'
import { getStripe, stripeIsLiveKey } from './stripe'
import { createAdminClient } from './supabase/admin'
import { sendSms, twilioConfigured } from './twilio'

type Admin = ReturnType<typeof createAdminClient>
type PlatformSettings = {
  sms_live_enabled: boolean
  billing_live_enabled: boolean
  number_purchase_enabled: boolean
  app_base_url: string | null
}

async function settings(admin: Admin): Promise<PlatformSettings> {
  const { data } = await admin
    .from('platform_settings')
    .select('sms_live_enabled, billing_live_enabled, number_purchase_enabled, app_base_url')
    .single()
  return (data as PlatformSettings) ?? { sms_live_enabled: false, billing_live_enabled: false, number_purchase_enabled: false, app_base_url: null }
}

async function sendQueuedTexts(admin: Admin, s: PlatformSettings) {
  const { data: queued } = await admin
    .from('messages')
    .select('id, funeral_home_id, family_id, scheduled_message_id, body, families(phone_e164)')
    .eq('delivery_status', 'queued')
    .eq('direction', 'outbound')
    .order('created_at')
    .limit(50)
  let sent = 0
  for (const row of (queued ?? []) as unknown as {
    id: string
    funeral_home_id: string
    family_id: string
    scheduled_message_id: string | null
    body: string
    families: { phone_e164: string } | null
  }[]) {
    const { data: live } = await admin.rpc('nava_live_sms', { p_home: row.funeral_home_id })
    if (!s.sms_live_enabled || !live || !twilioConfigured() || !row.families) {
      await admin.from('messages').update({ delivery_status: 'simulated' }).eq('id', row.id).eq('delivery_status', 'queued')
      continue
    }
    const { data: claimed } = await admin
      .from('messages')
      .update({ delivery_status: 'sent' })
      .eq('id', row.id)
      .eq('delivery_status', 'queued')
      .select('id')
    if (!claimed?.length) continue
    const { data: profile } = await admin
      .from('messaging_profiles')
      .select('phone_number_e164, twilio_messaging_service_sid')
      .eq('funeral_home_id', row.funeral_home_id)
      .single()
    try {
      const result = await sendSms({
        from: profile!.phone_number_e164!,
        to: row.families.phone_e164,
        body: row.body,
        messagingServiceSid: profile?.twilio_messaging_service_sid,
        statusCallback: s.app_base_url ? `${s.app_base_url}/api/twilio/status` : undefined,
      })
      await admin.from('messages').update({ provider_message_id: result.sid }).eq('id', row.id)
      sent++
    } catch (error) {
      await admin.from('messages').update({ delivery_status: 'failed' }).eq('id', row.id)
      await admin.from('system_alerts').insert({
        funeral_home_id: row.funeral_home_id,
        family_id: row.family_id,
        scheduled_message_id: row.scheduled_message_id,
        kind: 'delivery_failed',
        message: `Text could not be sent: ${error instanceof Error ? error.message : 'unknown error'}`.slice(0, 500),
      })
    }
  }
  return sent
}

async function sendReplyAlerts(admin: Admin, baseUrl: string | null) {
  const { data } = await admin
    .from('reply_notifications')
    .select('id, recipient_email, family_id, messages(body), families(contact_name, deceased_name), funeral_homes(name)')
    .eq('status', 'pending')
    .order('created_at')
    .limit(50)
  let count = 0
  for (const n of (data ?? []) as unknown as {
    id: string
    recipient_email: string
    family_id: string
    messages: { body: string } | null
    families: { contact_name: string; deceased_name: string } | null
    funeral_homes: { name: string } | null
  }[]) {
    const email = renderEmail('reply', {
      contact_name: n.families?.contact_name,
      deceased_name: n.families?.deceased_name,
      body: n.messages?.body,
      home_name: n.funeral_homes?.name,
      family_id: n.family_id,
    })
    const result = await sendEmail(n.recipient_email, email, baseUrl)
    if (result.status === 'failed') {
      console.error('[nava] reply alert failed', result.error)
      continue
    }
    await admin
      .from('reply_notifications')
      .update({ status: result.status === 'sent' ? 'sent' : 'skipped', sent_at: new Date().toISOString() })
      .eq('id', n.id)
    count++
  }
  return count
}

async function sendOutbox(admin: Admin, baseUrl: string | null) {
  const { data } = await admin
    .from('email_outbox')
    .select('id, kind, to_email, payload, attempts')
    .eq('status', 'pending')
    .order('created_at')
    .limit(50)
  let count = 0
  for (const row of (data ?? []) as { id: string; kind: string; to_email: string; payload: Record<string, unknown>; attempts: number }[]) {
    const result = await sendEmail(row.to_email, renderEmail(row.kind, row.payload), baseUrl)
    const attempts = row.attempts + 1
    await admin
      .from('email_outbox')
      .update({
        status: result.status === 'failed' ? (attempts >= 3 ? 'failed' : 'pending') : result.status,
        attempts,
        last_error: result.error ?? null,
        sent_at: result.status === 'failed' ? null : new Date().toISOString(),
      })
      .eq('id', row.id)
    if (result.status !== 'failed') count++
  }
  return count
}

async function pushOverageCharges(admin: Admin, s: PlatformSettings) {
  if (!process.env.STRIPE_SECRET_KEY) return 0
  const live = stripeIsLiveKey()
  if (live && !s.billing_live_enabled) return 0
  const { data } = await admin
    .from('family_enrollments')
    .select('id, funeral_home_id, amount_cents, subscriptions:funeral_home_id(stripe_customer_id, stripe_subscription_id)')
    .eq('charge_status', 'pending')
    .limit(100)
  const stripe = getStripe()
  let count = 0
  for (const row of (data ?? []) as unknown as {
    id: string
    funeral_home_id: string
    amount_cents: number
    subscriptions: { stripe_customer_id: string | null; stripe_subscription_id: string | null } | null
  }[]) {
    const sub = row.subscriptions
    if (!sub?.stripe_customer_id || !sub.stripe_subscription_id) continue
    try {
      const item = await stripe.invoiceItems.create(
        {
          customer: sub.stripe_customer_id,
          subscription: sub.stripe_subscription_id,
          amount: row.amount_cents,
          currency: 'usd',
          description: 'Additional family enrollment (beyond 500 included)',
        },
        { idempotencyKey: `enrollment-${row.id}` },
      )
      await admin
        .from('family_enrollments')
        .update({ charge_status: live ? 'invoiced' : 'test_recorded', stripe_invoice_item_id: item.id })
        .eq('id', row.id)
      count++
    } catch (error) {
      console.error('[nava] overage charge failed', error)
    }
  }
  return count
}

export async function syncSubscription(admin: Admin, sub: Stripe.Subscription) {
  const homeId = sub.metadata?.funeral_home_id
  if (!homeId) return
  const periodEnd = sub.items.data[0]?.current_period_end
  const { data: existing } = await admin
    .from('subscriptions')
    .select('stripe_subscription_id')
    .eq('funeral_home_id', homeId)
    .single()
  const isNew = existing?.stripe_subscription_id !== sub.id
  await admin
    .from('subscriptions')
    .update({
      stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
      stripe_subscription_id: sub.id,
      status: sub.status,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      ...(isNew ? { allowance_year_start: new Date(sub.start_date * 1000).toISOString().slice(0, 10) } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('funeral_home_id', homeId)
}

async function refreshSubscriptions(admin: Admin) {
  if (!process.env.STRIPE_SECRET_KEY) return 0
  const { data } = await admin.from('subscriptions').select('stripe_subscription_id').not('stripe_subscription_id', 'is', null)
  const stripe = getStripe()
  let count = 0
  for (const row of data ?? []) {
    try {
      await syncSubscription(admin, await stripe.subscriptions.retrieve(row.stripe_subscription_id as string))
      count++
    } catch (error) {
      console.error('[nava] subscription sync failed', error)
    }
  }
  return count
}

export async function runDispatch() {
  const admin = createAdminClient()
  const s = await settings(admin)
  const [texts, replies, emails, charges] = [
    await sendQueuedTexts(admin, s),
    await sendReplyAlerts(admin, s.app_base_url),
    await sendOutbox(admin, s.app_base_url),
    await pushOverageCharges(admin, s),
  ]
  return { texts, replies, emails, charges }
}

export async function runDaily() {
  const admin = createAdminClient()
  const subscriptions = await refreshSubscriptions(admin)
  return { subscriptions, ...(await runDispatch()) }
}
