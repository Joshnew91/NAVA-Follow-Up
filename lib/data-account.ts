import 'server-only'
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
}

export type PlatformFlags = {
  sms_live_enabled: boolean
  billing_live_enabled: boolean
  number_purchase_enabled: boolean
  app_base_url: string | null
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
      .select('status, stripe_customer_id, stripe_subscription_id, current_period_end')
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
