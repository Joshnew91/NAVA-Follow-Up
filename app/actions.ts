'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { normalizePhone, zonedInputsToIso } from '@/lib/format'
import { getHomeContext, getMemberships, getUser, HOME_COOKIE } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { STAFF_CONSENT_METHODS, type ActionResult, type ConsentMethod } from '@/lib/types'

type DbError = { code?: string; message?: string } | null

function str(formData: FormData, key: string, max = 2000) {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function id(formData: FormData, key = 'id') {
  const value = str(formData, key, 64)
  return UUID.test(value) ? value : null
}

function fail(error: DbError): ActionResult {
  if (!error) return { ok: false, message: 'Something went wrong. Please try again.' }
  // P0001 is raised by our own database safeguards, whose messages are written for staff.
  if (error.code === 'P0001' && error.message) return { ok: false, message: error.message }
  if (error.code === '23505') return { ok: false, message: 'That record already exists.' }
  if (error.code === '23514' || error.code === '22P02') return { ok: false, message: 'Some values are not valid.' }
  if (error.code === '42501') return { ok: false, message: "You don't have permission to do that." }
  console.error('[nava] database error', error)
  return { ok: false, message: 'Something went wrong. Please try again.' }
}

function done(message: string): ActionResult {
  revalidatePath('/')
  return { ok: true, message }
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  ;(await cookies()).delete(HOME_COOKIE)
  redirect('/auth/login')
}

export async function switchHome(formData: FormData) {
  const homeId = id(formData, 'homeId')
  const memberships = await getMemberships()
  if (homeId && memberships.some((m) => m.funeral_home_id === homeId)) {
    ;(await cookies()).set(HOME_COOKIE, homeId, { httpOnly: true, sameSite: 'lax', secure: true, path: '/' })
  }
  redirect('/?section=Overview')
}

export async function createFuneralHome(formData: FormData): Promise<ActionResult> {
  if (!(await getUser())) redirect('/auth/login')
  const name = str(formData, 'name', 120)
  const email = str(formData, 'notificationEmail', 254).toLowerCase()
  if (!name) return { ok: false, message: 'Enter the funeral home name.' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_funeral_home', {
    p_name: name,
    p_notification_email: email || null,
  })
  if (error) return fail(error)
  ;(await cookies()).set(HOME_COOKIE, data as string, { httpOnly: true, sameSite: 'lax', secure: true, path: '/' })
  redirect('/?section=Overview')
}

export async function sendReply(formData: FormData): Promise<ActionResult> {
  const familyId = id(formData, 'familyId')
  const body = str(formData, 'body', 640)
  if (!familyId || !body) return { ok: false, message: 'Write a message first.' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('send_family_message', { p_family: familyId, p_body: body })
  if (error) return fail(error)
  return done(
    data === 'pending_approval'
      ? 'Sent to an administrator for approval.'
      : 'Saved as a simulated message. Texting is off, so nothing was sent.',
  )
}

const REPLY_RESULTS: Record<string, string> = {
  opted_out: 'STOP received. The family is opted out and all pending messages are cancelled.',
  resubscribed: 'START received. The family is subscribed again.',
  paused: 'Reply recorded. The conversation is paused and admins are queued for an email notice.',
  received: 'Reply recorded.',
}

export async function simulateReply(formData: FormData): Promise<ActionResult> {
  const familyId = id(formData, 'familyId')
  const body = str(formData, 'body', 1600)
  if (!familyId || !body) return { ok: false, message: 'Type the reply to simulate.' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('simulate_family_reply', { p_family: familyId, p_body: body })
  if (error) return fail(error)
  return done(REPLY_RESULTS[data as string] ?? 'Reply recorded.')
}

export async function setFamilyPaused(formData: FormData): Promise<ActionResult> {
  const familyId = id(formData, 'familyId')
  const pause = str(formData, 'pause') === 'true'
  if (!familyId) return fail(null)

  const ctx = await getHomeContext()
  const supabase = await createClient()
  const { error } = await supabase
    .from('families')
    .update(pause ? { status: 'paused', paused_reason: 'Paused by staff' } : { status: 'active' })
    .eq('id', familyId)
    .eq('funeral_home_id', ctx.home.id)
  if (error) return fail(error)
  return done(pause ? 'Conversation paused. No messages will go out.' : 'Conversation resumed.')
}

function parseConsent(formData: FormData) {
  const method = str(formData, 'consentMethod') as ConsentMethod
  const language = str(formData, 'consentLanguage', 1000)
  const evidence = str(formData, 'evidenceNote', 1000)
  if (!STAFF_CONSENT_METHODS.includes(method)) return { error: 'Choose how consent was collected.' } as const
  if (!language) return { error: 'Record the consent wording the family agreed to.' } as const
  return { method, language, evidence: evidence || null } as const
}

export async function addFamily(formData: FormData): Promise<ActionResult> {
  const ctx = await getHomeContext()
  const contactName = str(formData, 'contactName', 120)
  const phone = normalizePhone(str(formData, 'phone', 30))
  const serviceDate = str(formData, 'serviceDate', 10)
  const hasConsent = formData.get('consentGiven') === 'on'

  if (!contactName) return { ok: false, message: 'Enter the family contact name.' }
  if (!phone) return { ok: false, message: 'Enter a valid mobile number, such as (512) 555-0123.' }
  if (serviceDate && !/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) return { ok: false, message: 'Check the service date.' }

  const consent = hasConsent ? parseConsent(formData) : null
  if (consent && 'error' in consent) return { ok: false, message: consent.error! }

  const supabase = await createClient()
  const { data: family, error } = await supabase
    .from('families')
    .insert({
      funeral_home_id: ctx.home.id,
      contact_name: contactName,
      relationship: str(formData, 'relationship', 60) || null,
      deceased_name: str(formData, 'deceasedName', 120) || null,
      phone_e164: phone,
      service_date: serviceDate || null,
      created_by: ctx.userId,
    })
    .select('id')
    .single()
  if (error) {
    if (error.code === '23505') return { ok: false, message: 'A family with this phone number already exists.' }
    return fail(error)
  }

  if (consent && !('error' in consent)) {
    const { error: consentError } = await supabase.from('sms_consents').insert({
      funeral_home_id: ctx.home.id,
      family_id: family.id,
      consent_given: true,
      method: consent.method,
      consent_language: consent.language,
      evidence_note: consent.evidence,
      recorded_by: ctx.userId,
    })
    if (consentError) return fail(consentError)
  }

  return done(hasConsent ? 'Family added with documented consent.' : 'Family added. Record consent before scheduling.')
}

export async function recordConsent(formData: FormData): Promise<ActionResult> {
  const ctx = await getHomeContext()
  const familyId = id(formData, 'familyId')
  const given = str(formData, 'consentGiven') === 'true'
  const consent = parseConsent(formData)
  if (!familyId) return fail(null)
  if ('error' in consent) return { ok: false, message: consent.error! }

  const supabase = await createClient()
  const { error } = await supabase.from('sms_consents').insert({
    funeral_home_id: ctx.home.id,
    family_id: familyId,
    consent_given: given,
    method: consent.method,
    consent_language: consent.language,
    evidence_note: consent.evidence,
    recorded_by: ctx.userId,
  })
  if (error) return fail(error)
  return done(given ? 'Consent recorded.' : 'Consent withdrawn. Pending messages were cancelled.')
}

export async function scheduleFollowups(formData: FormData): Promise<ActionResult> {
  const familyId = id(formData, 'familyId')
  if (!familyId) return fail(null)
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('schedule_family_followups', { p_family: familyId })
  if (error) return fail(error)
  const count = Number(data ?? 0)
  return done(count === 0 ? 'All follow-ups are already scheduled.' : `${count} follow-up message${count === 1 ? '' : 's'} scheduled.`)
}

export async function updateScheduled(formData: FormData): Promise<ActionResult> {
  const ctx = await getHomeContext()
  const messageId = id(formData)
  const body = str(formData, 'body', 640)
  const scheduledFor = zonedInputsToIso(str(formData, 'date', 10), str(formData, 'time', 5), ctx.home.timezone)
  if (!messageId) return fail(null)
  if (!body) return { ok: false, message: 'The message cannot be empty.' }
  if (!scheduledFor) return { ok: false, message: 'Check the date and time.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('scheduled_messages')
    .update({ body, scheduled_for: scheduledFor })
    .eq('id', messageId)
    .eq('funeral_home_id', ctx.home.id)
  if (error) return fail(error)
  return done('Changes saved.')
}

async function setScheduledStatus(formData: FormData, status: 'approved' | 'cancelled', message: string) {
  const ctx = await getHomeContext()
  const messageId = id(formData)
  if (!messageId) return fail(null)
  const supabase = await createClient()
  const { error } = await supabase
    .from('scheduled_messages')
    .update({ status })
    .eq('id', messageId)
    .eq('funeral_home_id', ctx.home.id)
  if (error) return fail(error)
  return done(message)
}

export async function approveScheduled(formData: FormData): Promise<ActionResult> {
  return setScheduledStatus(formData, 'approved', 'Approved.')
}

export async function cancelScheduled(formData: FormData): Promise<ActionResult> {
  return setScheduledStatus(formData, 'cancelled', 'Cancelled.')
}

export async function sendScheduledNow(formData: FormData): Promise<ActionResult> {
  const messageId = id(formData)
  if (!messageId) return fail(null)
  const supabase = await createClient()
  const { error } = await supabase.rpc('send_scheduled_message', { p_id: messageId })
  if (error) return fail(error)
  return done('Recorded as a simulated send. Texting is off, so nothing left the app.')
}

export async function updateTemplate(formData: FormData): Promise<ActionResult> {
  const ctx = await getHomeContext()
  const templateId = id(formData)
  const title = str(formData, 'title', 80)
  const body = str(formData, 'body', 640)
  const offsetDays = Number.parseInt(str(formData, 'offsetDays', 4), 10)
  if (!templateId) return fail(null)
  if (!title || !body) return { ok: false, message: 'Title and message are required.' }
  if (!Number.isInteger(offsetDays) || offsetDays < 0 || offsetDays > 730)
    return { ok: false, message: 'Days after service must be between 0 and 730.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('message_templates')
    .update({ title, body, offset_days: offsetDays, is_active: formData.get('isActive') === 'on' })
    .eq('id', templateId)
    .eq('funeral_home_id', ctx.home.id)
  if (error) return fail(error)
  return done('Template saved. Already-scheduled messages keep their current wording.')
}

export async function updateSettings(formData: FormData): Promise<ActionResult> {
  const ctx = await getHomeContext()
  const name = str(formData, 'name', 120)
  const email = str(formData, 'notificationEmail', 254).toLowerCase()
  if (!name) return { ok: false, message: 'Enter the funeral home name.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('funeral_homes')
    .update({ name, notification_email: email || null, require_approval: formData.get('requireApproval') === 'on' })
    .eq('id', ctx.home.id)
  if (error) return fail(error)
  return done('Settings saved.')
}

export async function inviteMember(formData: FormData): Promise<ActionResult> {
  const ctx = await getHomeContext()
  const email = str(formData, 'email', 254).toLowerCase()
  const role = str(formData, 'role') === 'admin' ? 'admin' : 'staff'
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, message: 'Enter a valid email address.' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('invite_member', { p_home: ctx.home.id, p_email: email, p_role: role })
  if (error) return fail(error)
  return done(
    data === 'added'
      ? `${email} already had an account and was added.`
      : `Invitation saved. ${email} joins automatically after signing up and confirming their email.`,
  )
}

export async function updateMemberRole(formData: FormData): Promise<ActionResult> {
  const ctx = await getHomeContext()
  const userId = id(formData, 'userId')
  const role = str(formData, 'role') === 'admin' ? 'admin' : 'staff'
  if (!userId) return fail(null)
  const supabase = await createClient()
  const { error } = await supabase
    .from('memberships')
    .update({ role })
    .eq('funeral_home_id', ctx.home.id)
    .eq('user_id', userId)
  if (error) return fail(error)
  return done('Role updated.')
}

export async function removeMember(formData: FormData): Promise<ActionResult> {
  const ctx = await getHomeContext()
  const userId = id(formData, 'userId')
  if (!userId) return fail(null)
  const supabase = await createClient()
  const { error } = await supabase.from('memberships').delete().eq('funeral_home_id', ctx.home.id).eq('user_id', userId)
  if (error) return fail(error)
  return done('Removed from this funeral home.')
}

export async function cancelInvitation(formData: FormData): Promise<ActionResult> {
  const ctx = await getHomeContext()
  const invitationId = id(formData)
  if (!invitationId) return fail(null)
  const supabase = await createClient()
  const { error } = await supabase.from('invitations').delete().eq('id', invitationId).eq('funeral_home_id', ctx.home.id)
  if (error) return fail(error)
  return done('Invitation cancelled.')
}

export async function loadSampleData(): Promise<ActionResult> {
  const ctx = await getHomeContext()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('load_sample_data', { p_home: ctx.home.id })
  if (error) return fail(error)
  const count = Number(data ?? 0)
  return done(count === 0 ? 'Sample families are already loaded.' : `Added ${count} fictional sample families.`)
}
