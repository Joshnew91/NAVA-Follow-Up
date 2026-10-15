export const SECTIONS = ['Overview', 'Inbox', 'Families', 'Schedule', 'Templates', 'Reports', 'Settings'] as const
export type Section = (typeof SECTIONS)[number]

export function parseSection(value: string | string[] | undefined): Section {
  const raw = Array.isArray(value) ? value[0] : value
  return (SECTIONS as readonly string[]).includes(raw ?? '') ? (raw as Section) : 'Inbox'
}

export type Role = 'admin' | 'staff'
export type FamilyStatus = 'active' | 'paused' | 'opted_out' | 'completed'
export type ScheduledStatus =
  | 'scheduled'
  | 'sent'
  | 'skipped'
  | 'failed'
  | 'cancelled'
  | 'opted_out'
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'blocked'
export type ConsentMethod = 'written_form' | 'verbal_in_person' | 'verbal_phone' | 'web_form' | 'keyword_reply'

export type FuneralHome = {
  id: string
  name: string
  notification_email: string | null
  timezone: string
  texting_enabled: boolean
  messaging_paused: boolean
  messaging_paused_at: string | null
  pause_on_reply: boolean
  skip_holidays: boolean
}

export type HomeContext = {
  userId: string
  userEmail: string
  role: Role
  home: FuneralHome
  homes: { id: string; name: string; role: Role }[]
}

export type ActionResult = { ok: boolean; message: string } | null

export const CONSENT_METHOD_LABELS: Record<ConsentMethod, string> = {
  written_form: 'Signed written form',
  verbal_in_person: 'Verbal, in person',
  verbal_phone: 'Verbal, by phone',
  web_form: 'Online form',
  keyword_reply: 'Text keyword reply',
}

export const STAFF_CONSENT_METHODS: ConsentMethod[] = ['written_form', 'verbal_in_person', 'verbal_phone', 'web_form']
