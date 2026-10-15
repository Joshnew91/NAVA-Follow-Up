'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { getPlatformFlags } from '@/lib/data-account'
import { checkNavaAdmin } from '@/lib/nava-session'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { addNumberToService, createMessagingService, purchaseNumber, searchLocalNumbers, twilioConfigured } from '@/lib/twilio'
import type { ActionResult } from '@/lib/types'

const REG_STATUSES = ['submitted', 'pending_carrier', 'approved', 'rejected'] as const

function fail(error: { code?: string; message?: string } | null): ActionResult {
  if (error?.code === 'P0001' && error.message) return { ok: false, message: error.message }
  if (error?.code === '42501') return { ok: false, message: 'Not permitted.' }
  console.error('[nava] admin action error', error)
  return { ok: false, message: 'Something went wrong. Please try again.' }
}

async function guard() {
  const r = await checkNavaAdmin()
  return r.ok ? r.admin : null
}

async function origin() {
  const h = await headers()
  return `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`
}

export async function setRegistrationStatus(formData: FormData): Promise<ActionResult> {
  if (!(await guard())) return { ok: false, message: 'Not permitted.' }
  const home = String(formData.get('home') ?? '')
  const status = String(formData.get('status') ?? '') as (typeof REG_STATUSES)[number]
  const note = String(formData.get('note') ?? '').trim().slice(0, 500)
  if (!REG_STATUSES.includes(status)) return { ok: false, message: 'Choose a status.' }
  if (status === 'rejected' && !note) return { ok: false, message: 'Add a note explaining what needs to change.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('nava_admin_set_registration', { p_home: home, p_status: status, p_note: note || null })
  if (error) return fail(error)
  revalidatePath('/nava')
  return { ok: true, message: 'Updated. The funeral home was emailed.' }
}

export async function setHomeTexting(formData: FormData): Promise<ActionResult> {
  if (!(await guard())) return { ok: false, message: 'Not permitted.' }
  const home = String(formData.get('home') ?? '')
  const enabled = formData.get('enabled') === 'true'
  const supabase = await createClient()
  const { error } = await supabase.rpc('nava_admin_set_home_texting', { p_home: home, p_enabled: enabled })
  if (error) return fail(error)
  revalidatePath('/nava')
  return { ok: true, message: enabled ? 'Texting enabled for this home.' : 'Texting disabled for this home.' }
}

export async function updatePlatformSwitches(formData: FormData): Promise<ActionResult> {
  if (!(await guard())) return { ok: false, message: 'Not permitted.' }
  const confirm = String(formData.get('confirm') ?? '').trim()
  const sms = formData.get('sms') === 'on'
  const billing = formData.get('billing') === 'on'
  const numbers = formData.get('numbers') === 'on'
  const current = await getPlatformFlags()
  const turningOn = (sms && !current.sms_live_enabled) || (billing && !current.billing_live_enabled) || (numbers && !current.number_purchase_enabled)
  if (turningOn && confirm !== 'APPROVE') {
    return { ok: false, message: 'Type APPROVE to turn on a live switch. This can send real texts, charge cards or buy numbers.' }
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc('nava_admin_update_platform', {
    p_sms: sms,
    p_billing: billing,
    p_numbers: numbers,
    p_url: await origin(),
  })
  if (error) return fail(error)
  revalidatePath('/nava')
  return { ok: true, message: 'Platform switches saved and logged.' }
}

export async function searchNumbers(formData: FormData): Promise<ActionResult & { numbers?: string[] }> {
  if (!(await guard())) return { ok: false, message: 'Not permitted.' }
  if (!twilioConfigured()) return { ok: false, message: 'Twilio is not connected yet. Add the Twilio keys first.' }
  const area = String(formData.get('area') ?? '').trim()
  const numbers = (await searchLocalNumbers(/^\d{3}$/.test(area) ? area : null)).map((n) => n.phone_number)
  return { ok: true, message: numbers.length ? `Found ${numbers.length} numbers.` : 'No numbers found for that area code.', numbers }
}

export async function buyNumber(formData: FormData): Promise<ActionResult> {
  const admin = await guard()
  if (!admin) return { ok: false, message: 'Not permitted.' }
  const flags = await getPlatformFlags()
  if (!flags.number_purchase_enabled) return { ok: false, message: 'Number purchases are switched off. Turn on "Allow buying numbers" first.' }
  if (!twilioConfigured()) return { ok: false, message: 'Twilio is not connected yet.' }
  const home = String(formData.get('home') ?? '')
  const phone = String(formData.get('phone') ?? '')
  if (!/^\+1\d{10}$/.test(phone)) return { ok: false, message: 'Pick a number first.' }

  const db = createAdminClient()
  const { data: profile } = await db
    .from('messaging_profiles')
    .select('status, phone_number_e164, twilio_messaging_service_sid, legal_business_name')
    .eq('funeral_home_id', home)
    .maybeSingle()
  if (profile?.status !== 'approved') return { ok: false, message: 'Approve the registration before assigning a number.' }
  if (profile.phone_number_e164) return { ok: false, message: 'This home already has a number.' }

  const base = await origin()
  const name = `NAVA ${profile.legal_business_name ?? home}`.slice(0, 60)
  const bought = await purchaseNumber(phone, base, name)
  const serviceSid = profile.twilio_messaging_service_sid ?? (await createMessagingService(name, base)).sid
  await addNumberToService(serviceSid, bought.sid)

  await db
    .from('messaging_profiles')
    .update({
      phone_number_e164: bought.phone_number,
      twilio_number_sid: bought.sid,
      twilio_messaging_service_sid: serviceSid,
      number_status: 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('funeral_home_id', home)
  await db.from('audit_log').insert({
    funeral_home_id: home,
    actor_id: admin.userId,
    actor_email: admin.email,
    action: 'number.purchased',
    entity: 'messaging_profile',
    entity_id: home,
    summary: `NAVA assigned texting number ${bought.phone_number}`,
  })
  revalidatePath('/nava')
  return { ok: true, message: `Purchased ${bought.phone_number}.` }
}
