import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'

const API = 'https://api.twilio.com/2010-04-01'
const MESSAGING_API = 'https://messaging.twilio.com/v1'

export function twilioConfigured() {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)
}

function auth() {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !token) throw new Error('Twilio is not connected. Add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.')
  return { sid, header: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}` }
}

async function call<T>(url: string, method: 'GET' | 'POST' | 'DELETE', params?: Record<string, string>): Promise<T> {
  const { header } = auth()
  const res = await fetch(url, {
    method,
    headers: { Authorization: header, ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body: params ? new URLSearchParams(params) : undefined,
    cache: 'no-store',
  })
  const data = (await res.json().catch(() => ({}))) as T & { message?: string; code?: number }
  if (!res.ok) throw new Error(`Twilio ${res.status}${data.code ? ` (${data.code})` : ''}: ${data.message ?? 'request failed'}`)
  return data
}

export async function sendSms(opts: { from: string; to: string; body: string; statusCallback?: string; messagingServiceSid?: string | null }) {
  const { sid } = auth()
  const params: Record<string, string> = { To: opts.to, Body: opts.body }
  if (opts.messagingServiceSid) params.MessagingServiceSid = opts.messagingServiceSid
  else params.From = opts.from
  if (opts.statusCallback) params.StatusCallback = opts.statusCallback
  return call<{ sid: string; status: string }>(`${API}/Accounts/${sid}/Messages.json`, 'POST', params)
}

export async function searchLocalNumbers(areaCode: string | null, limit = 5) {
  const { sid } = auth()
  const qs = new URLSearchParams({ SmsEnabled: 'true', PageSize: String(limit) })
  if (areaCode) qs.set('AreaCode', areaCode)
  const data = await call<{ available_phone_numbers: { phone_number: string; locality: string; region: string }[] }>(
    `${API}/Accounts/${sid}/AvailablePhoneNumbers/US/Local.json?${qs}`,
    'GET',
  )
  return data.available_phone_numbers
}

export async function purchaseNumber(phoneNumber: string, baseUrl: string, friendlyName: string) {
  const { sid } = auth()
  return call<{ sid: string; phone_number: string }>(`${API}/Accounts/${sid}/IncomingPhoneNumbers.json`, 'POST', {
    PhoneNumber: phoneNumber,
    FriendlyName: friendlyName.slice(0, 64),
    SmsUrl: `${baseUrl}/api/twilio/inbound`,
    SmsMethod: 'POST',
  })
}

export async function createMessagingService(friendlyName: string, baseUrl: string) {
  return call<{ sid: string }>(`${MESSAGING_API}/Services`, 'POST', {
    FriendlyName: friendlyName.slice(0, 64),
    InboundRequestUrl: `${baseUrl}/api/twilio/inbound`,
    StatusCallback: `${baseUrl}/api/twilio/status`,
  })
}

export async function addNumberToService(serviceSid: string, numberSid: string) {
  return call<{ sid: string }>(`${MESSAGING_API}/Services/${serviceSid}/PhoneNumbers`, 'POST', { PhoneNumberSid: numberSid })
}

export function validateTwilioSignature(url: string, params: Record<string, string>, signature: string | null) {
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!token || !signature) return false
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url)
  const expected = createHmac('sha1', token).update(Buffer.from(data, 'utf-8')).digest('base64')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  return a.length === b.length && timingSafeEqual(a, b)
}
