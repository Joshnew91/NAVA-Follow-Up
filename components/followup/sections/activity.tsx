import { getActivity } from '@/lib/data-account'
import { formatDateTime } from '@/lib/format'
import type { HomeContext } from '@/lib/types'

const METRIC_LABELS: Record<string, string> = {
  families_enrolled: 'Families added',
  messages_sent: 'Messages sent',
  replies: 'Replies',
  opt_outs: 'Opt-outs',
  failed: 'Failed',
}

function monthName(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export async function ActivitySection({ ctx }: { ctx: HomeContext }) {
  const { audit, reports } = await getActivity(ctx.home.id)

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="monthly" className="rounded-xl bg-card p-5">
        <h2 id="monthly" className="font-semibold">
          Monthly reports
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Created automatically on the 1st of each month and emailed to your administrators.
        </p>
        {reports.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">Your first report arrives at the start of next month.</p>
        ) : (
          <ul className="mt-4 flex flex-col divide-y divide-border">
            {reports.map((r) => (
              <li key={r.id} className="py-3">
                <p className="text-sm font-medium">{monthName(r.period_start)}</p>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
                  {Object.entries(METRIC_LABELS).map(([key, label]) => (
                    <div key={key}>
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd className="font-semibold tabular-nums">{r.metrics?.[key] ?? 0}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="audit" className="rounded-xl bg-card p-5">
        <h2 id="audit" className="font-semibold">
          Activity log
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          A permanent record of who did what. Entries can&apos;t be edited or deleted.
        </p>
        {audit.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          <ol className="mt-4 flex flex-col divide-y divide-border">
            {audit.map((a) => (
              <li key={a.id} className="flex flex-col gap-0.5 py-3">
                <p className="text-sm leading-relaxed">{a.summary}</p>
                <p className="text-xs text-muted-foreground">
                  {a.actor_email ?? 'System'} · {formatDateTime(a.created_at, ctx.home.timezone)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
