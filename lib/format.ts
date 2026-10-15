import type { FamilyStatus, ScheduledStatus } from './types'

export function formatDateTime(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso))
}

export function formatDate(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(iso),
  )
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') }
}

export function toZonedInputs(iso: string, timeZone: string) {
  const p = zonedParts(new Date(iso), timeZone)
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` }
}

export function zonedInputsToIso(date: string, time: string, timeZone: string) {
  const guess = new Date(`${date}T${time}:00Z`)
  if (Number.isNaN(guess.getTime())) return null
  const p = zonedParts(guess, timeZone)
  const asZoned = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute)
  return new Date(guess.getTime() - (asZoned - guess.getTime())).toISOString()
}

export function normalizePhone(input: string) {
  const digits = input.replace(/\D/g, '')
  if (input.trim().startsWith('+')) return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

export function formatPhone(e164: string) {
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/)
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164
}

export function familyStatusLabel(status: FamilyStatus, pausedReason: string | null) {
  if (status === 'opted_out') return 'Opted out'
  if (status === 'completed') return 'Completed'
  if (status === 'paused') return pausedReason === 'Family replied' ? 'New reply · Paused' : 'Paused'
  return 'Active'
}

export const SCHEDULED_STATUS_LABELS: Record<ScheduledStatus, string> = {
  scheduled: 'Scheduled',
  sent: 'Sent',
  skipped: 'Skipped',
  failed: 'Failed',
  cancelled: 'Canceled',
  opted_out: 'Opted out',
  draft: 'Draft',
  pending_approval: 'Scheduled',
  approved: 'Scheduled',
  blocked: 'Paused',
}

export type DisplayStatus = 'Scheduled' | 'Sent' | 'Delivered' | 'Failed' | 'Paused' | 'Canceled' | 'Opted out' | 'Skipped'

export function displayStatus(
  status: ScheduledStatus,
  opts: { familyStatus?: FamilyStatus | null; homePaused?: boolean; deliveryStatus?: string | null },
): DisplayStatus {
  if (status === 'sent') return opts.deliveryStatus === 'delivered' ? 'Delivered' : 'Sent'
  if (status === 'scheduled') {
    if (opts.familyStatus === 'opted_out') return 'Opted out'
    if (opts.homePaused || opts.familyStatus === 'paused' || opts.familyStatus === 'completed') return 'Paused'
    return 'Scheduled'
  }
  return SCHEDULED_STATUS_LABELS[status] as DisplayStatus
}

export function renderPreview(body: string, values: { contact: string; deceased: string; home: string }) {
  return body
    .replaceAll('{contact_name}', values.contact)
    .replaceAll('{first_name}', values.contact.split(' ')[0] ?? '')
    .replaceAll('{funeral_home}', values.home)
    .replaceAll('{deceased_name}', values.deceased || 'your loved one')
}
