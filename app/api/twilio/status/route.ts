import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateTwilioSignature } from '@/lib/twilio'

export async function POST(request: NextRequest) {
  const form = await request.formData()
  const params: Record<string, string> = {}
  form.forEach((value, key) => {
    if (typeof value === 'string') params[key] = value
  })

  const admin = createAdminClient()
  const { data: flags } = await admin.from('platform_settings').select('app_base_url').single()
  const url = `${flags?.app_base_url ?? request.nextUrl.origin}/api/twilio/status`
  if (!validateTwilioSignature(url, params, request.headers.get('x-twilio-signature'))) {
    return new Response('Invalid signature', { status: 403 })
  }

  if (params.MessageSid && params.MessageStatus) {
    await admin.rpc('record_delivery_status', {
      p_sid: params.MessageSid,
      p_status: params.MessageStatus,
      p_error: params.ErrorCode ?? null,
    })
  }
  return new Response(null, { status: 204 })
}
