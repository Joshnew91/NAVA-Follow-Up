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
  draft: 'Draft',
  pending_approval: 'Needs approval',
  approved: 'Approved',
  sent: 'Sent (simulated)',
  cancelled: 'Cancelled',
  blocked: 'On hold',
}
