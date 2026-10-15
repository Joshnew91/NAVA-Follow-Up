'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { normalizePhone, zonedInputsToIso } from '@/lib/format'
import { getHomeContext, getMemberships, getUser, HOME_COOKIE } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import type { ActionResult } from '@/lib/types'

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
      ? 'Saved.'
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
  return done(pause ? 'Paused. No messages will go out to this family until resumed.' : 'Resumed. Follow-ups continue on schedule.')
}

export async function stopFamily(formData: FormData): Promise<ActionResult> {
  const familyId = id(formData, 'familyId')
  if (!familyId) return fail(null)
  const ctx = await getHomeContext()
  const supabase = await createClient()
  const { error } = await supabase
    .from('families')
    .update({ status: 'completed' })
    .eq('id', familyId)
    .eq('funeral_home_id', ctx.home.id)
  if (error) return fail(error)
  return done('Follow-ups stopped for this family. Remaining messages will not send.')
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

function sameName(a: string | null, b: string) {
  return (a ?? '').trim().toLowerCase().replace(/\s+/g, ' ') === b.trim().toLowerCase().replace(/\s+/g, ' ')
}

export async function addFamily(formData: FormData): Promise<ActionResult> {
  const ctx = await getHomeContext()
  const deceasedName = str(formData, 'deceasedName', 120)
  const contactName = str(formData, 'contactName', 120)
  const phone = normalizePhone(str(formData, 'phone', 30))
  const serviceDate = str(formData, 'serviceDate', 10)
  const signedOn = str(formData, 'authorizationSignedOn', 10)
  const allowDuplicate = formData.get('allowDuplicate') === 'on'

  if (!deceasedName) return { ok: false, message: 'Enter the name of the deceased.' }
  if (!contactName) return { ok: false, message: 'Enter the family contact name.' }
  if (!phone) return { ok: false, message: 'Enter a valid mobile number, such as (512) 555-0123.' }
  if (!DATE.test(serviceDate)) return { ok: false, message: 'Enter the service date.' }
  if (signedOn && !DATE.test(signedOn)) return { ok: false, message: 'Check the authorization signed date.' }


  const supabase = await createClient()
  const { data: existing } = await supabase
    .from('families')
    .select('contact_name, deceased_name, phone_e164')
    .eq('funeral_home_id', ctx.home.id)
    .or(`phone_e164.eq.${phone},deceased_name.ilike.${deceasedName.replace(/[%,()*]/g, '')}`)
    .limit(10)

  const samePhone = existing?.find((f) => f.phone_e164 === phone)
  if (samePhone) {
    return {
      ok: false,
      message: `This number is already enrolled for ${samePhone.contact_name}${samePhone.deceased_name ? ` (in memory of ${samePhone.deceased_name})` : ''}.`,
    }
  }
  const likely = existing?.find((f) => sameName(f.deceased_name, deceasedName) && sameName(f.contact_name, contactName))
  if (likely && !allowDuplicate) {
    return {
      ok: false,
      message: `${contactName} is already enrolled in memory of ${deceasedName} with a different number. Check "This is a different family" to add anyway.`,
    }
  }

  const { data: family, error } = await supabase
    .from('families')
    .insert({
      funeral_home_id: ctx.home.id,
      contact_name: contactName,
      relationship: str(formData, 'relationship', 60) || null,
      deceased_name: deceasedName,
      phone_e164: phone,
      service_date: serviceDate,
      authorization_signed_on: signedOn || null,
    })
    .select('id, status')
    .single()
  if (error) {
    if (error.code === '23505') return { ok: false, message: 'A family with this phone number already exists.' }
    return fail(error)
  }

  if (family.status === 'opted_out') {
    return done('Family added, but this number previously replied STOP. No messages will be sent unless the family texts START.')
  }
  const { count } = await supabase
    .from('scheduled_messages')
    .select('id', { count: 'exact', head: true })
    .eq('family_id', family.id)
    .eq('status', 'scheduled')
  return done(`Family added. ${count ?? 0} follow-up message${count === 1 ? '' : 's'} scheduled automatically.`)
}

export async function withdrawAuthorization(formData: FormData): Promise<ActionResult> {
  const ctx = await getHomeContext()
  const familyId = id(formData, 'familyId')
  const note = str(formData, 'note', 1000)
  if (!familyId) return fail(null)

  const supabase = await createClient()
  const { error } = await supabase.from('sms_consents').insert({
    funeral_home_id: ctx.home.id,
    family_id: familyId,
    consent_given: false,
    method: 'written_form',
    consent_language: 'Family withdrew SMS authorization.',
    evidence_note: note || null,
    recorded_by: ctx.userId,
  })
  if (error) return fail(error)
  return done('Authorization withdrawn. The number is opted out and remaining messages were canceled.')
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

async function setScheduledStatus(formData: FormData, status: 'scheduled' | 'skipped' | 'cancelled', message: string) {
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

export async function skipScheduled(formData: FormData): Promise<ActionResult> {
  return setScheduledStatus(formData, 'skipped', 'Skipped. The rest of the follow-ups continue as planned.')
}

export async function restoreScheduled(formData: FormData): Promise<ActionResult> {
  return setScheduledStatus(formData, 'scheduled', 'Back on the schedule.')
}

export async function cancelScheduled(formData: FormData): Promise<ActionResult> {
  return setScheduledStatus(formData, 'cancelled', 'Canceled.')
}

export async function setHomePaused(formData: FormData): Promise<ActionResult> {
  const ctx = await getHomeContext()
  const pause = str(formData, 'pause') === 'true'
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_home_messaging_paused', { p_home: ctx.home.id, p_paused: pause })
  if (error) return fail(error)
  return done(pause ? 'All automated messages are paused.' : 'Automated messages resumed. Anything overdue goes out at the next allowed time.')
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
    .update({
      name,
      notification_email: email || null,
      pause_on_reply: formData.get('pauseOnReply') === 'on',
      skip_holidays: formData.get('skipHolidays') === 'on',
    })
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
