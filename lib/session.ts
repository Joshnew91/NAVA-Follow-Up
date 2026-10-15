import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from './supabase/server'
import type { FuneralHome, HomeContext, Role } from './types'

export const HOME_COOKIE = 'nava_home'

type MembershipRow = {
  role: Role
  funeral_home_id: string
  funeral_homes: FuneralHome | null
}

export const getUser = cache(async () => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
})

export const getMemberships = cache(async () => {
  const user = await getUser()
  if (!user) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('memberships')
    .select('role, funeral_home_id, funeral_homes(id, name, notification_email, timezone, texting_enabled, messaging_paused, messaging_paused_at, pause_on_reply, skip_holidays)')
    .eq('user_id', user.id)
    .order('created_at')
  return ((data ?? []) as unknown as MembershipRow[]).filter((m) => m.funeral_homes)
})

export const getHomeContext = cache(async (): Promise<HomeContext> => {
  const user = await getUser()
  if (!user) redirect('/auth/login')
  const memberships = await getMemberships()
  if (memberships.length === 0) redirect('/onboarding')

  const preferred = (await cookies()).get(HOME_COOKIE)?.value
  const current = memberships.find((m) => m.funeral_home_id === preferred) ?? memberships[0]

  return {
    userId: user.id,
    userEmail: user.email ?? '',
    role: current.role,
    home: current.funeral_homes!,
    homes: memberships.map((m) => ({ id: m.funeral_home_id, name: m.funeral_homes!.name, role: m.role })),
  }
})
