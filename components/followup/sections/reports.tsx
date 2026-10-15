import { getReports } from '@/lib/data'
import type { HomeContext } from '@/lib/types'

export async function ReportsSection({ ctx }: { ctx: HomeContext }) {
  const r = await getReports(ctx.home.id)
  const rows = [
    ['Families on file', r.families],
    ['Consent records (given)', r.consented],
    ['Outgoing messages (simulated)', r.outbound],
    ['Family replies', r.inbound],
    ['STOP opt-outs', r.optOuts],
    ['Scheduled follow-ups completed', r.sentScheduled],
    ['Scheduled follow-ups cancelled', r.cancelled],
  ] as const

  return (
    <section aria-label="Activity totals" className="rounded-xl bg-card">
      <dl>
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-4 border-t px-5 py-4 first:border-t-0">
            <dt className="text-sm">{label}</dt>
            <dd className="font-serif text-2xl">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
