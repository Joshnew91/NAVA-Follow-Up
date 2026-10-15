import 'server-only'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Bypasses row-level security. Only use in background jobs, provider webhooks,
// and NAVA admin code paths that have already verified the caller.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase service credentials are missing.')
  return createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
