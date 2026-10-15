import Link from 'next/link'
import { getOverview } from '@/lib/data'
import { formatDateTime } from '@/lib/format'
import type { HomeContext } from '@/lib/types'

export async function OverviewSection({ ctx }: { ctx: HomeContext }) {
  const data = await getOverview(ctx.home.id)
  const tiles = [
    { label: 'Sending in next 7 days', value: data.nextWeek, href: '/?section=Schedule' },
    { label: 'Paused families', value: data.paused, href: '/?section=Families' },
    { label: 'Failed messages', value: data.failed, href: '/?section=Schedule' },
    { label: 'Active families', value: data.active, href: '/?section=Families' },
    { label: 'Opted out', value: data.optedOut, href: '/?section=Families' },
  ]

  return (
    <div className="flex flex-col gap-5">
      {ctx.home.messaging_paused && (
        <Link
          href="/?section=Settings"
          className="rounded-lg bg-notice p-4 text-sm font-medium leading-relaxed text-notice-foreground"
        >
          All automated messages are paused for {ctx.home.name}. Open Settings to resume.
        </Link>
      )}

      {data.alerts.length > 0 && (
        <section aria-labelledby="alerts" className="rounded-xl bg-card">
          <h2 id="alerts" className="px-5 py-4 font-semibold">
            Needs attention
          </h2>
          <ul>
            {data.alerts.map((alert) => (
              <li key={alert.id} className="border-t px-5 py-4 text-sm leading-relaxed">
                <p>{alert.message}</p>
                <p className="text-xs text-muted-foreground">{formatDateTime(alert.created_at, ctx.home.timezone)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ul className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {tiles.map((tile) => (
          <li key={tile.label}>
            <Link
              href={tile.href}
              className="flex h-full flex-col gap-1 rounded-xl bg-card p-4 transition-colors hover:bg-secondary"
            >
              <span className="font-serif text-3xl">{tile.value}</span>
              <span className="text-sm text-muted-foreground">{tile.label}</span>
            </Link>
          </li>
        ))}
      </ul>

      <section aria-labelledby="recent-replies" className="rounded-xl bg-card">
        <h2 id="recent-replies" className="px-5 py-4 font-semibold">
          Recent family replies
        </h2>
        {data.recentReplies.length === 0 ? (
          <p className="border-t px-5 py-5 text-sm text-muted-foreground">No replies yet.</p>
        ) : (
          <ul>
            {data.recentReplies.map((reply) => (
              <li key={reply.id} className="border-t">
                <Link
                  href={`/?section=Inbox&family=${reply.family_id}`}
                  className="block px-5 py-4 transition-colors hover:bg-secondary"
                >
                  <span className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold">{reply.families?.contact_name ?? 'Family'}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(reply.created_at, ctx.home.timezone)}
                    </span>
                  </span>
                  <span className="mt-1 block text-sm leading-relaxed text-muted-foreground line-clamp-2">
                    {reply.is_opt_out ? 'Opted out · ' : ''}
                    {reply.body}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
