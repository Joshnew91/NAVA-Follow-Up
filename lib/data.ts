import 'server-only'
import { createClient } from './supabase/server'
import type { ConsentMethod, FamilyStatus, Role, ScheduledStatus } from './types'

export type FamilyRow = {
  id: string
  contact_name: string
  relationship: string | null
  deceased_name: string | null
  phone_e164: string
  service_date: string | null
  status: FamilyStatus
  paused_reason: string | null
  is_sample: boolean
  updated_at: string
  created_at: string
  created_by: string | null
  authorization_signed_on: string | null
}

export type ConsentRow = {
  family_id: string
  consent_given: boolean
  method: ConsentMethod
  consent_language: string
  evidence_note: string | null
  source: string
  recorded_at: string
}

export type MessageRow = {
  id: string
  family_id: string
  direction: 'inbound' | 'outbound'
  body: string
  delivery_status: string
  is_opt_out: boolean
  created_at: string
}

export type ScheduledRow = {
  id: string
  family_id: string
  body: string
  scheduled_for: string
  status: ScheduledStatus
  blocked_reason: string | null
  sent_at: string | null
  attempts: number
  last_error: string | null
  edited_at: string | null
  families: { contact_name: string; status: FamilyStatus } | null
  message_templates: { title: string; position: number } | null
  delivery_status?: string | null
}

export type AlertRow = {
  id: string
  family_id: string | null
  kind: string
  message: string
  created_at: string
}

export type TemplateRow = {
  id: string
  position: number
  title: string
  offset_days: number
  body: string
  is_active: boolean
  updated_at: string
}

const FAMILY_COLUMNS =
  'id, contact_name, relationship, deceased_name, phone_e164, service_date, status, paused_reason, is_sample, updated_at, created_at, created_by, authorization_signed_on'

async function count(table: string, homeId: string, apply?: (q: any) => any) {
  const supabase = await createClient()
  let query = supabase.from(table).select('id', { count: 'exact', head: true }).eq('funeral_home_id', homeId)
  if (apply) query = apply(query)
  const { count } = await query
  return count ?? 0
}

export async function getOverview(homeId: string) {
  const supabase = await createClient()
  const weekAhead = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const [active, paused, optedOut, nextWeek, failed, alerts, replies] = await Promise.all([
    count('families', homeId, (q) => q.eq('status', 'active')),
    count('families', homeId, (q) => q.eq('status', 'paused')),
    count('families', homeId, (q) => q.eq('status', 'opted_out')),
    count('scheduled_messages', homeId, (q) => q.eq('status', 'scheduled').lte('scheduled_for', weekAhead)),
    count('scheduled_messages', homeId, (q) => q.eq('status', 'failed')),
    supabase
      .from('system_alerts')
      .select('id, family_id, kind, message, created_at')
      .eq('funeral_home_id', homeId)
      .is('resolved_at', null)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('messages')
      .select('id, family_id, body, is_opt_out, created_at, families(contact_name)')
      .eq('funeral_home_id', homeId)
      .eq('direction', 'inbound')
      .order('created_at', { ascending: false })
      .limit(5),
  ])
  return {
    active,
    paused,
    optedOut,
    nextWeek,
    failed,
    alerts: (alerts.data ?? []) as AlertRow[],
    recentReplies: (replies.data ?? []) as unknown as (Pick<MessageRow, 'id' | 'family_id' | 'body' | 'is_opt_out' | 'created_at'> & {
      families: { contact_name: string } | null
    })[],
  }
}

export async function getFamilies(homeId: string) {
  const supabase = await createClient()
  const [families, consents, scheduled, members] = await Promise.all([
    supabase.from('families').select(FAMILY_COLUMNS).eq('funeral_home_id', homeId).order('created_at', { ascending: false }),
    supabase
      .from('sms_consents')
      .select('family_id, consent_given, method, consent_language, evidence_note, source, recorded_at')
      .eq('funeral_home_id', homeId)
      .order('recorded_at', { ascending: false }),
    supabase.from('scheduled_messages').select('family_id, status').eq('funeral_home_id', homeId).eq('status', 'scheduled'),
    supabase.from('memberships').select('user_id').eq('funeral_home_id', homeId),
  ])

  const memberIds = (members.data ?? []).map((m) => m.user_id as string)
  const { data: profiles } = memberIds.length
    ? await supabase.from('profiles').select('id, full_name, email').in('id', memberIds)
    : { data: [] }
  const nameById = new Map((profiles ?? []).map((p) => [p.id as string, (p.full_name || p.email) as string]))

  const latestConsent = new Map<string, ConsentRow>()
  for (const row of (consents.data ?? []) as ConsentRow[]) {
    if (!latestConsent.has(row.family_id)) latestConsent.set(row.family_id, row)
  }
  const openCounts = new Map<string, number>()
  for (const row of scheduled.data ?? []) openCounts.set(row.family_id, (openCounts.get(row.family_id) ?? 0) + 1)

  return ((families.data ?? []) as FamilyRow[]).map((family) => ({
    ...family,
    consent: latestConsent.get(family.id) ?? null,
    openScheduled: openCounts.get(family.id) ?? 0,
    enrolledBy: family.created_by ? (nameById.get(family.created_by) ?? 'Former team member') : null,
  }))
}

export async function getInbox(homeId: string, selectedId?: string) {
  const supabase = await createClient()
  const [families, recent] = await Promise.all([
    supabase.from('families').select(FAMILY_COLUMNS).eq('funeral_home_id', homeId).order('updated_at', { ascending: false }),
    supabase
      .from('messages')
      .select('family_id, direction, body, created_at')
      .eq('funeral_home_id', homeId)
      .order('created_at', { ascending: false })
      .limit(500),
  ])

  const lastMessage = new Map<string, { direction: string; body: string; created_at: string }>()
  for (const row of recent.data ?? []) if (!lastMessage.has(row.family_id)) lastMessage.set(row.family_id, row)

  const list = ((families.data ?? []) as FamilyRow[])
    .map((f) => ({ ...f, last: lastMessage.get(f.id) ?? null }))
    .sort((a, b) => (b.last?.created_at ?? b.updated_at).localeCompare(a.last?.created_at ?? a.updated_at))

  const selected = list.find((f) => f.id === selectedId) ?? list[0] ?? null
  let messages: MessageRow[] = []
  let hasConsent = false
  if (selected) {
    const [thread, consent] = await Promise.all([
      supabase
        .from('messages')
        .select('id, family_id, direction, body, delivery_status, is_opt_out, created_at')
        .eq('funeral_home_id', homeId)
        .eq('family_id', selected.id)
        .order('created_at'),
      supabase.rpc('has_active_consent', { p_family: selected.id }),
    ])
    messages = (thread.data ?? []) as MessageRow[]
    hasConsent = Boolean(consent.data)
  }
  return { list, selected, messages, hasConsent }
}

export async function getSchedule(homeId: string) {
  const supabase = await createClient()
  const columns =
    'id, family_id, body, scheduled_for, status, blocked_reason, sent_at, attempts, last_error, edited_at, families(contact_name, status), message_templates(title, position)'
  const [open, closed] = await Promise.all([
    supabase
      .from('scheduled_messages')
      .select(columns)
      .eq('funeral_home_id', homeId)
      .in('status', ['scheduled', 'failed', 'skipped'])
      .order('scheduled_for'),
    supabase
      .from('scheduled_messages')
      .select(columns)
      .eq('funeral_home_id', homeId)
      .in('status', ['sent', 'cancelled', 'opted_out'])
      .order('updated_at', { ascending: false })
      .limit(20),
  ])

  const closedRows = (closed.data ?? []) as unknown as ScheduledRow[]
  const sentIds = closedRows.filter((r) => r.status === 'sent').map((r) => r.id)
  if (sentIds.length) {
    const { data: deliveries } = await supabase
      .from('messages')
      .select('scheduled_message_id, delivery_status')
      .eq('funeral_home_id', homeId)
      .in('scheduled_message_id', sentIds)
    const byId = new Map((deliveries ?? []).map((d) => [d.scheduled_message_id as string, d.delivery_status as string]))
    for (const row of closedRows) row.delivery_status = byId.get(row.id) ?? null
  }
  return { open: (open.data ?? []) as unknown as ScheduledRow[], closed: closedRows }
}

export async function getTemplates(homeId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('message_templates')
    .select('id, position, title, offset_days, body, is_active, updated_at')
    .eq('funeral_home_id', homeId)
    .order('position')
  return (data ?? []) as TemplateRow[]
}

export async function getReports(homeId: string) {
  const [outbound, inbound, optOuts, sentScheduled, cancelled, families, consented] = await Promise.all([
    count('messages', homeId, (q) => q.eq('direction', 'outbound')),
    count('messages', homeId, (q) => q.eq('direction', 'inbound')),
    count('messages', homeId, (q) => q.eq('is_opt_out', true)),
    count('scheduled_messages', homeId, (q) => q.eq('status', 'sent')),
    count('scheduled_messages', homeId, (q) => q.eq('status', 'cancelled')),
    count('families', homeId),
    count('sms_consents', homeId, (q) => q.eq('consent_given', true)),
  ])
  return { outbound, inbound, optOuts, sentScheduled, cancelled, families, consented }
}

export async function getSettings(homeId: string) {
  const supabase = await createClient()
  const [members, invitations, notifications] = await Promise.all([
    supabase.from('memberships').select('user_id, role, created_at').eq('funeral_home_id', homeId).order('created_at'),
    supabase
      .from('invitations')
      .select('id, email, role, created_at')
      .eq('funeral_home_id', homeId)
      .is('accepted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('reply_notifications')
      .select('id, recipient_email, status, created_at, families(contact_name)')
      .eq('funeral_home_id', homeId)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const memberRows = (members.data ?? []) as { user_id: string; role: Role; created_at: string }[]
  const { data: profiles } = memberRows.length
    ? await supabase.from('profiles').select('id, full_name, email').in('id', memberRows.map((m) => m.user_id))
    : { data: [] }
  const profileById = new Map((profiles ?? []).map((p) => [p.id as string, p]))

  return {
    members: memberRows.map((m) => ({
      ...m,
      full_name: (profileById.get(m.user_id)?.full_name as string | null) ?? null,
      email: (profileById.get(m.user_id)?.email as string | null) ?? null,
    })),
    invitations: (invitations.data ?? []) as { id: string; email: string; role: Role; created_at: string }[],
    // Admin-only via RLS; staff receive an empty list.
    notifications: (notifications.data ?? []) as unknown as {
      id: string
      recipient_email: string
      status: string
      created_at: string
      families: { contact_name: string } | null
    }[],
  }
}
