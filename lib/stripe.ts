import 'server-only'
import Stripe from 'stripe'
import type { createAdminClient } from './supabase/admin'

export const PLAN = {
  name: 'NAVA Memorial Family Follow-Up',
  monthlyCents: 12500,
  includedFamilies: 500,
  overageCents: 100,
  lookupKey: 'nava_followup_monthly_125',
} as const

let client: Stripe | null = null

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('Stripe is not connected.')
  client ??= new Stripe(key)
  return client
}

export function stripeIsLiveKey() {
  return (process.env.STRIPE_SECRET_KEY ?? '').startsWith('sk_live_') || (process.env.STRIPE_SECRET_KEY ?? '').startsWith('rk_live_')
}

export const WEBHOOK_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'invoice.paid',
  'invoice.payment_failed',
  'invoice.payment_action_required',
  'invoice.upcoming',
]

type SettingsStore = ReturnType<typeof createAdminClient>

export async function getPortalConfigId(stripe: Stripe, store: SettingsStore) {
  const { data } = await store.from('platform_settings').select('stripe_portal_config_id').single()
  const saved = data?.stripe_portal_config_id as string | null | undefined
  if (saved) {
    try {
      const existing = await stripe.billingPortal.configurations.retrieve(saved)
      if (existing.active) return existing.id
    } catch {}
  }
  const config = await stripe.billingPortal.configurations.create({
    business_profile: { headline: 'NAVA Memorial Family Follow-Up billing' },
    features: {
      payment_method_update: { enabled: true },
      customer_update: { enabled: true, allowed_updates: ['name', 'email', 'address', 'phone', 'tax_id'] },
      invoice_history: { enabled: true },
      subscription_cancel: {
        enabled: true,
        mode: 'at_period_end',
        proration_behavior: 'none',
        cancellation_reason: {
          enabled: true,
          options: ['too_expensive', 'missing_features', 'switched_service', 'unused', 'other'],
        },
      },
      subscription_update: { enabled: false },
    },
    metadata: { app: 'nava' },
  })
  await store.from('platform_settings').update({ stripe_portal_config_id: config.id }).not('id', 'is', null)
  return config.id
}

export async function ensureWebhookEndpoint(stripe: Stripe, store: SettingsStore, baseUrl: string | null) {
  if (process.env.STRIPE_WEBHOOK_SECRET || !baseUrl) return 'env'
  if (!baseUrl.startsWith('https://') || baseUrl.includes('localhost')) return 'skipped'
  const url = `${baseUrl.replace(/\/$/, '')}/api/stripe/webhook`
  const { data } = await store.from('platform_settings').select('stripe_webhook_url, stripe_webhook_secret').single()
  if (data?.stripe_webhook_url === url && data?.stripe_webhook_secret) return 'exists'
  const endpoint = await stripe.webhookEndpoints.create({
    url,
    enabled_events: WEBHOOK_EVENTS,
    description: 'NAVA Memorial subscription sync',
  })
  await store
    .from('platform_settings')
    .update({ stripe_webhook_url: url, stripe_webhook_secret: endpoint.secret })
    .not('id', 'is', null)
  return 'created'
}

export function invoiceSubscriptionId(invoice: Stripe.Invoice) {
  const sub = invoice.parent?.subscription_details?.subscription
  return typeof sub === 'string' ? sub : (sub?.id ?? null)
}

export async function getPlanPriceId(stripe: Stripe) {
  const existing = await stripe.prices.list({ lookup_keys: [PLAN.lookupKey], active: true, limit: 1 })
  if (existing.data[0]) return existing.data[0].id
  const price = await stripe.prices.create({
    currency: 'usd',
    unit_amount: PLAN.monthlyCents,
    recurring: { interval: 'month' },
    lookup_key: PLAN.lookupKey,
    product_data: { name: PLAN.name },
  })
  return price.id
}
