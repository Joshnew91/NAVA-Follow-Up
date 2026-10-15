import type { NextRequest } from 'next/server'
import { normalizePhone } from '@/lib/format'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateTwilioSignature } from '@/lib/twilio'

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'

export async function POST(request: NextRequest) {
  const form = await request.formData()
  const params: Record<string, string> = {}
  form.forEach((value, key) => {
    if (typeof value === 'string') params[key] = value
  })

  const admin = createAdminClient()
  const { data: flags } = await admin.from('platform_settings').select('app_base_url').single()
  const url = `${flags?.app_base_url ?? request.nextUrl.origin}/api/twilio/inbound`
  if (!validateTwilioSignature(url, params, request.headers.get('x-twilio-signature'))) {
    return new Response('Invalid signature', { status: 403 })
  }

  const to = normalizePhone(params.To ?? '')
  const from = normalizePhone(params.From ?? '')
  if (to && from) {
    const { error } = await admin.rpc('record_inbound_sms', {
      p_to: to,
      p_from: from,
      p_body: (params.Body ?? '').slice(0, 1600) || ' ',
      p_sid: params.MessageSid ?? null,
    })
    if (error) console.error('[nava] inbound sms error', error.message)
  }
  return new Response(EMPTY_TWIML, { headers: { 'Content-Type': 'text/xml' } })
}
