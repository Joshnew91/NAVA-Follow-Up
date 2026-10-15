import 'server-only'
import { getStripe } from './stripe'
import { createClient } from './supabase/server'

export type Usage = {
  year_start: string
  year_end: string
  enrolled: number
  included: number
  extra: number
  extra_cents: number
  overage_cents: number
  spending_limit_cents: number | null
  status: string
}

export type SubscriptionRow = {
  status: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  canceled_at: string | null
  past_due_since: string | null
  service_suspended_at: string | null
}

export type PlatformFlags = {
  sms_live_enabled: boolean
  billing_live_enabled: boolean
  number_purchase_enabled: boolean
  app_base_url: string | null
  grace_period_days: number
}

export type MessagingProfile = {
  legal_business_name: string | null
  ein: string | null
  business_type: string | null
  street: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  website: string | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  preferred_area_code: string | null
  status: string
  status_note: string | null
  phone_number_e164: string | null
  number_status: string
  submitted_at: string | null
  approved_at: string | null
}

export type AuditRow = {
  id: number
  actor_email: string | null
  action: string
  entity: string
  summary: string
  created_at: string
}

export type MonthlyReport = {
  id: string
  period_start: string
  metrics: Record<string, number>
}

const NO_FLAGS: PlatformFlags = {
  sms_live_enabled: false,
  billing_live_enabled: false,
  number_purchase_enabled: false,
  app_base_url: null,
  grace_period_days: 7,
}

export async function getPlatformFlags(): Promise<PlatformFlags> {
  const supabase = await createClient()
  const { data } = await supabase.rpc('nava_platform_flags')
  return ((data as PlatformFlags[] | null)?.[0] as PlatformFlags) ?? NO_FLAGS
}

export async function getBilling(homeId: string) {
  const supabase = await createClient()
  const [usage, sub, flags] = await Promise.all([
    supabase.rpc('nava_usage', { p_home: homeId }),
    supabase
      .from('subscriptions')
      .select(
        'status, stripe_customer_id, stripe_subscription_id, current_period_end, cancel_at_period_end, canceled_at, past_due_since, service_suspended_at',
      )
      .eq('funeral_home_id', homeId)
      .maybeSingle(),
    getPlatformFlags(),
  ])
  return {
    usage: ((usage.data as Usage[] | null)?.[0] ?? null) as Usage | null,
    subscription: (sub.data ?? null) as SubscriptionRow | null,
    flags,
  }
}

export type InvoiceSummary = {
  id: string
  number: string | null
  created: number
  total: number
  status: string | null
  hostedUrl: string | null
  pdfUrl: string | null
}

export type StripeDetails = {
  nextAmountCents: number | null
  nextDate: number | null
  card: { brand: string; last4: string; expMonth: number; expYear: number } | null
  billingName: string | null
  billingEmail: string | null
  invoices: InvoiceSummary[]
  error: boolean
}

// The customer/subscription IDs come from a row the caller already read through RLS,
// so one funeral home can never request another's Stripe data.
export async function getStripeDetails(sub: SubscriptionRow | null): Promise<StripeDetails | null> {
  if (!sub?.stripe_customer_id || !process.env.STRIPE_SECRET_KEY) return null
  const stripe = getStripe()
  const empty: StripeDetails = {
    nextAmountCents: null,
    nextDate: null,
    card: null,
    billingName: null,
    billingEmail: null,
    invoices: [],
    error: false,
  }
  try {
    const live = sub.stripe_subscription_id && ['active', 'trialing', 'past_due', 'unpaid'].includes(sub.status)
    const [customer, invoices, preview] = await Promise.all([
      stripe.customers.retrieve(sub.stripe_customer_id, { expand: ['invoice_settings.default_payment_method'] }),
      stripe.invoices.list({ customer: sub.stripe_customer_id, limit: 12 }),
      live && !sub.cancel_at_period_end
        ? stripe.invoices
            .createPreview({ customer: sub.stripe_customer_id, subscription: sub.stripe_subscription_id! })
            .catch(() => null)
        : Promise.resolve(null),
    ])
    if (customer.deleted) return empty

    let pm = customer.invoice_settings?.default_payment_method
    if (!pm || typeof pm === 'string') {
      if (live) {
        const s = await stripe.subscriptions.retrieve(sub.stripe_subscription_id!, { expand: ['default_payment_method'] })
        pm = s.default_payment_method
      }
    }
    const card = pm && typeof pm !== 'string' && pm.card ? pm.card : null

    return {
      nextAmountCents: preview?.amount_due ?? null,
      nextDate: preview?.next_payment_attempt ?? preview?.period_end ?? null,
      card: card ? { brand: card.brand, last4: card.last4, expMonth: card.exp_month, expYear: card.exp_year } : null,
      billingName: customer.name ?? null,
      billingEmail: customer.email ?? null,
      invoices: invoices.data
        .filter((i) => i.status !== 'draft')
        .map((i) => ({
          id: i.id!,
          number: i.number,
          created: i.created,
          total: i.total,
          status: i.status,
          hostedUrl: i.hosted_invoice_url ?? null,
          pdfUrl: i.invoice_pdf ?? null,
        })),
      error: false,
    }
  } catch (error) {
    console.error('[nava] stripe details failed', error)
    return { ...empty, error: true }
  }
}

export async function getMessagingProfile(homeId: string) {
  const supabase = await createClient()
  const { data } = await supabase.from('messaging_profiles').select('*').eq('funeral_home_id', homeId).maybeSingle()
  return (data ?? null) as MessagingProfile | null
}

export async function getActivity(homeId: string) {
  const supabase = await createClient()
  const [audit, reports] = await Promise.all([
    supabase
      .from('audit_log')
      .select('id, actor_email, action, entity, summary, created_at')
      .eq('funeral_home_id', homeId)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('monthly_reports')
      .select('id, period_start, metrics')
      .eq('funeral_home_id', homeId)
      .order('period_start', { ascending: false })
      .limit(12),
  ])
  return { audit: (audit.data ?? []) as AuditRow[], reports: (reports.data ?? []) as MonthlyReport[] }
}
