import { Dashboard } from '@/components/followup/dashboard'
import { getHomeContext } from '@/lib/session'
import { parseSection } from '@/lib/types'

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const ctx = await getHomeContext()
  const family = typeof params.family === 'string' ? params.family : undefined
  return <Dashboard ctx={ctx} section={parseSection(params.section)} familyId={family} />
}
