import 'server-only'
import Stripe from 'stripe'

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
