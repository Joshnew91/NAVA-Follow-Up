import { timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { runDaily, runDispatch } from '@/lib/jobs'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 60

export async function POST(request: NextRequest, { params }: { params: Promise<{ job: string }> }) {
  const { job } = await params
  const provided = request.headers.get('x-nava-job-secret') ?? ''
  const { data: secret } = await createAdminClient().rpc('nava_job_secret')
  const a = Buffer.from(provided)
  const b = Buffer.from(String(secret ?? ''))
  if (!secret || a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (job === 'dispatch') return NextResponse.json(await runDispatch())
  if (job === 'daily') return NextResponse.json(await runDaily())
  return NextResponse.json({ error: 'Unknown job' }, { status: 404 })
}
