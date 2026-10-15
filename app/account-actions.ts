'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPlatformFlags } from '@/lib/data-account'
import { getHomeContext } from '@/lib/session'
import { syncSubscription } from '@/lib/jobs'
import { getPlanPriceId, getPortalConfigId, getStripe, PLAN, stripeIsLiveKey } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { ActionResult } from '@/lib/types'

function str(formData: FormData, key: string, max = 200) {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function fail(error: { code?: string; message?: string } | null): ActionResult {
  if (error?.code === 'P0001' && error.message) return { ok: false, message: error.message }
  if (error?.code === '42501') return { ok: false, message: "You don't have permission to do that." }
  console.error('[nava] account action error', error)
  return { ok: false, message: 'Something went wrong. Please try again.' }
}

async function requireAdmin() {
  const ctx = await getHomeContext()
  if (ctx.role !== 'admin') return null
  return ctx
}

async function origin() {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const proto = h.get('x-forwarded-proto') ?? 'https'
  return `${proto}://${host}`
}

async function billingBlockedReason(): Promise<string | null> {
  if (!process.env.STRIPE_SECRET_KEY) return 'Billing is not connected yet.'
  if (stripeIsLiveKey()) {
    const flags = await getPlatformFlags()
    if (!flags.billing_live_enabled) return 'Live billing is waiting for NAVA approval. No charges have been made.'
  }
  return null
}

export async function startSubscription(): Promise<ActionResult> {
  const ctx = await requireAdmin()
  if (!ctx) return { ok: false, message: 'Only administrators can manage billing.' }
  const blocked = await billingBlockedReason()
  if (blocked) return { ok: false, message: blocked }

  const admin = createAdminClient()
  const stripe = getStripe()
  const { data: sub } = await admin
    .from('subscriptions')
    .select('stripe_customer_id, status')
    .eq('funeral_home_id', ctx.home.id)
    .maybeSingle()
  if (sub && ['active', 'trialing', 'past_due'].includes(sub.status)) {
    return { ok: false, message: 'This funeral home already has a subscription.' }
  }

  let customerId = sub?.stripe_customer_id ?? null
  if (!customerId) {
    const customer = await stripe.customers.create(
      { name: ctx.home.name, email: ctx.home.notification_email ?? ctx.userEmail, metadata: { funeral_home_id: ctx.home.id } },
      { idempotencyKey: `customer:${ctx.home.id}` },
    )
    customerId = customer.id
    await admin
      .from('subscriptions')
      .upsert({ funeral_home_id: ctx.home.id, stripe_customer_id: customerId }, { onConflict: 'funeral_home_id' })
  }

  const base = await origin()
  const session = await stripe.checkout.sessions.create(
    {
      mode: 'subscription',
      ui_mode: 'hosted_page',
      customer: customerId,
      line_items: [{ price: await getPlanPriceId(stripe), quantity: 1 }],
      subscription_data: { metadata: { funeral_home_id: ctx.home.id } },
      metadata: { funeral_home_id: ctx.home.id },
      success_url: `${base}/?section=Billing&checkout=success`,
      cancel_url: `${base}/?section=Billing`,
    },
    { idempotencyKey: `checkout:${ctx.home.id}:${new Date().toISOString().slice(0, 13)}` },
  )
  if (!session.url) return { ok: false, message: 'Could not start checkout.' }
  redirect(session.url)
}

const PORTAL_FLOWS = ['overview', 'payment_method_update'] as const

async function audit(homeId: string, actorEmail: string, action: string, summary: string, details: Record<string, unknown> = {}) {
  const { error } = await createAdminClient().rpc('nava_audit_write', {
    p_home: homeId,
    p_action: action,
    p_entity: 'subscription',
    p_entity_id: homeId,
    p_summary: summary,
    p_details: { actor_email: actorEmail, ...details },
  })
  if (error) console.error('[nava] billing audit failed', error)
}

async function homeSubscription(homeId: string) {
  const { data } = await createAdminClient()
    .from('subscriptions')
    .select('stripe_customer_id, stripe_subscription_id, status, cancel_at_period_end')
    .eq('funeral_home_id', homeId)
    .maybeSingle()
  return data as {
    stripe_customer_id: string | null
    stripe_subscription_id: string | null
    status: string
    cancel_at_period_end: boolean
  } | null
}

export async function openBillingPortal(formData?: FormData): Promise<ActionResult> {
  const ctx = await requireAdmin()
  if (!ctx) return { ok: false, message: 'Only administrators can manage billing.' }
  if (!process.env.STRIPE_SECRET_KEY) return { ok: false, message: 'Billing is not connected yet.' }
  const requested = String(formData?.get('flow') ?? 'overview')
  const flow = (PORTAL_FLOWS as readonly string[]).includes(requested) ? requested : 'overview'
  const sub = await homeSubscription(ctx.home.id)
  if (!sub?.stripe_customer_id) return { ok: false, message: 'Start a subscription first.' }

  const stripe = getStripe()
  const returnUrl = `${await origin()}/?section=Billing`
  let url: string
  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      configuration: await getPortalConfigId(stripe, createAdminClient()),
      return_url: returnUrl,
      ...(flow === 'payment_method_update'
        ? { flow_data: { type: 'payment_method_update', after_completion: { type: 'redirect', redirect: { return_url: returnUrl } } } }
        : {}),
    })
    url = portal.url
  } catch (error) {
    console.error('[nava] portal session failed', error)
    return { ok: false, message: 'Could not open the billing portal. Please try again.' }
  }
  await audit(ctx.home.id, ctx.userEmail, 'billing_portal_opened', `Opened Stripe billing portal (${flow.replace(/_/g, ' ')}).`)
  redirect(url)
}

export async function cancelSubscription(formData: FormData): Promise<ActionResult> {
  const ctx = await requireAdmin()
  if (!ctx) return { ok: false, message: 'Only administrators can cancel the subscription.' }
  if (str(formData, 'confirm', 20).toUpperCase() !== 'CANCEL') {
    return { ok: false, message: 'Type CANCEL to confirm.' }
  }
  if (!process.env.STRIPE_SECRET_KEY) return { ok: false, message: 'Billing is not connected yet.' }
  const sub = await homeSubscription(ctx.home.id)
  if (!sub?.stripe_subscription_id || !['active', 'trialing', 'past_due', 'unpaid'].includes(sub.status)) {
    return { ok: false, message: 'There is no active subscription to cancel.' }
  }
  if (sub.cancel_at_period_end) return { ok: true, message: 'Cancellation is already scheduled.' }

  const stripe = getStripe()
  const reason = str(formData, 'reason', 500)
  const updated = await stripe.subscriptions.update(
    sub.stripe_subscription_id,
    {
      cancel_at_period_end: true,
      ...(reason ? { cancellation_details: { comment: reason } } : {}),
    },
    { idempotencyKey: `cancel:${sub.stripe_subscription_id}:${new Date().toISOString().slice(0, 13)}` },
  )
  await syncSubscription(createAdminClient(), updated)
  const endsOn = updated.items.data[0]?.current_period_end
  await audit(ctx.home.id, ctx.userEmail, 'subscription_cancel_scheduled', 'Scheduled cancellation at the end of the billing period.', {
    ends_at: endsOn ? new Date(endsOn * 1000).toISOString() : null,
    reason: reason || null,
  })
  revalidatePath('/')
  return { ok: true, message: 'Cancellation scheduled. Service stays active until the end of the paid period.' }
}

export async function reactivateSubscription(): Promise<ActionResult> {
  const ctx = await requireAdmin()
  if (!ctx) return { ok: false, message: 'Only administrators can reactivate the subscription.' }
  if (!process.env.STRIPE_SECRET_KEY) return { ok: false, message: 'Billing is not connected yet.' }
  const sub = await homeSubscription(ctx.home.id)

  if (sub?.stripe_subscription_id && sub.cancel_at_period_end && ['active', 'trialing', 'past_due', 'unpaid'].includes(sub.status)) {
    const updated = await getStripe().subscriptions.update(
      sub.stripe_subscription_id,
      { cancel_at_period_end: false },
      { idempotencyKey: `reactivate:${sub.stripe_subscription_id}:${new Date().toISOString().slice(0, 13)}` },
    )
    await syncSubscription(createAdminClient(), updated)
    await audit(ctx.home.id, ctx.userEmail, 'subscription_reactivated', 'Removed the scheduled cancellation.')
    revalidatePath('/')
    return { ok: true, message: 'Your subscription will continue. No new charge was made today.' }
  }

  if (!sub?.stripe_subscription_id || ['canceled', 'incomplete_expired'].includes(sub.status)) {
    await audit(ctx.home.id, ctx.userEmail, 'subscription_restart_started', 'Started checkout to restart the subscription.')
    return startSubscription()
  }

  return { ok: false, message: 'This subscription is already active.' }
}

export async function updateSpendingLimit(formData: FormData): Promise<ActionResult> {
  const ctx = await requireAdmin()
  if (!ctx) return { ok: false, message: 'Only administrators can change the spending limit.' }
  const raw = str(formData, 'limit', 10)
  const dollars = raw === '' ? null : Number(raw)
  if (dollars !== null && (!Number.isInteger(dollars) || dollars < 0 || dollars > 100000)) {
    return { ok: false, message: 'Enter a whole dollar amount between 0 and 100,000, or leave blank for no limit.' }
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_spending_limit', {
    p_home: ctx.home.id,
    p_cents: dollars === null ? null : dollars * PLAN.overageCents,
  })
  if (error) return fail(error)
  revalidatePath('/')
  return { ok: true, message: dollars === null ? 'No spending limit set.' : `Limit set to $${dollars} per year for extra families.` }
}

const PROFILE_FIELDS = [
  'legal_business_name',
  'ein',
  'business_type',
  'street',
  'city',
  'state',
  'postal_code',
  'website',
  'contact_name',
  'contact_email',
  'contact_phone',
  'preferred_area_code',
] as const

export async function saveTextingProfile(formData: FormData): Promise<ActionResult> {
  const ctx = await requireAdmin()
  if (!ctx) return { ok: false, message: 'Only administrators can manage texting registration.' }
  const submit = formData.get('intent') === 'submit'
  const profile: Record<string, string> = {}
  for (const key of PROFILE_FIELDS) profile[key] = str(formData, key, 200)

  if (profile.ein && !/^\d{2}-?\d{7}$/.test(profile.ein)) return { ok: false, message: 'Enter the EIN as 9 digits, e.g. 12-3456789.' }
  if (profile.preferred_area_code && !/^\d{3}$/.test(profile.preferred_area_code)) {
    return { ok: false, message: 'Area code must be 3 digits.' }
  }
  if (profile.state && !/^[A-Za-z]{2}$/.test(profile.state)) return { ok: false, message: 'Use the 2-letter state code.' }
  profile.state = profile.state.toUpperCase()
  if (submit) {
    const missing = ['legal_business_name', 'ein', 'street', 'city', 'state', 'postal_code', 'contact_name', 'contact_email', 'contact_phone']
      .filter((k) => !profile[k])
    if (missing.length) return { ok: false, message: 'Fill in every required field before submitting.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('save_messaging_profile', { p_home: ctx.home.id, p: profile, p_submit: submit })
  if (error) return fail(error)
  revalidatePath('/')
  return { ok: true, message: submit ? 'Submitted. NAVA will review it and email you with updates.' : 'Saved as draft.' }
}
