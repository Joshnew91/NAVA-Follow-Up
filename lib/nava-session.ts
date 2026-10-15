import 'server-only'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type NavaAdmin = { userId: string; email: string }

/** Verifies platform-admin membership and a completed second factor (AAL2). */
export async function checkNavaAdmin(): Promise<
  { ok: true; admin: NavaAdmin } | { ok: false; reason: 'signed_out' | 'not_admin' | 'needs_mfa' }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, reason: 'signed_out' }

  const { data: isAdmin } = await supabase.rpc('is_platform_admin')
  if (!isAdmin) return { ok: false, reason: 'not_admin' }

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aal?.currentLevel !== 'aal2') return { ok: false, reason: 'needs_mfa' }

  return { ok: true, admin: { userId: user.id, email: user.email ?? '' } }
}

export async function requireNavaAdmin(): Promise<NavaAdmin> {
  const result = await checkNavaAdmin()
  if (result.ok) return result.admin
  if (result.reason === 'signed_out') redirect('/auth/login?next=/nava')
  if (result.reason === 'needs_mfa') redirect('/nava/mfa')
  redirect('/')
}
