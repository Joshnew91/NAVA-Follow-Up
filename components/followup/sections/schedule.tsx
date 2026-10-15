import { cancelScheduled, restoreScheduled, skipScheduled, updateScheduled } from '@/app/actions'
import { getSchedule, type ScheduledRow } from '@/lib/data'
import { displayStatus, formatDateTime, toZonedInputs } from '@/lib/format'
import type { HomeContext } from '@/lib/types'
import { ActionForm } from '../action-form'
import { Field, inputClass } from '../field'

function holdReason(item: ScheduledRow, homePaused: boolean) {
  if (homePaused) return 'All messages are paused for your funeral home. Resume in Settings.'
  if (item.families?.status === 'paused') return 'On hold while this family is paused.'
  if (item.families?.status === 'completed') return 'Follow-ups were stopped for this family.'
  if (item.status === 'failed') return item.last_error ?? 'Delivery failed after several attempts.'
  return item.blocked_reason
}

function ScheduledCard({ item, ctx }: { item: ScheduledRow; ctx: HomeContext }) {
  const tz = ctx.home.timezone
  const { date, time } = toZonedInputs(item.scheduled_for, tz)
  const status = displayStatus(item.status, { familyStatus: item.families?.status, homePaused: ctx.home.messaging_paused })
  const reason = holdReason(item, ctx.home.messaging_paused)
  const editable = item.status === 'scheduled' || item.status === 'failed'

  return (
    <li className="rounded-xl bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">
          {item.families?.contact_name ?? 'Family'}
          {item.message_templates ? (
            <span className="font-normal text-muted-foreground"> · {item.message_templates.title}</span>
          ) : null}
        </p>
        <p className="text-xs text-muted-foreground">
          {status} · {formatDateTime(item.scheduled_for, tz)}
        </p>
      </div>
      {item.status === 'scheduled' &&
        item.original_scheduled_for &&
        item.delivery_adjustment &&
        formatDateTime(item.original_scheduled_for, tz) !== formatDateTime(item.scheduled_for, tz) && (
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Originally {formatDateTime(item.original_scheduled_for, tz)}. {item.delivery_adjustment}
          </p>
        )}
      {reason && (
        <p className="mt-2 rounded-lg bg-notice p-3 text-sm leading-relaxed text-notice-foreground">{reason}</p>
      )}

      {editable ? (
        <details className="mt-3">
          <summary className="min-h-11 cursor-pointer content-center text-sm font-medium">Edit or reschedule</summary>
          <ActionForm action={updateScheduled} submitLabel="Save changes" variant="outline" className="mt-3">
            <input type="hidden" name="id" value={item.id} />
            <Field label="Message" htmlFor={`body-${item.id}`}>
              <textarea id={`body-${item.id}`} name="body" rows={5} maxLength={640} defaultValue={item.body} className={inputClass} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date" htmlFor={`date-${item.id}`}>
                <input id={`date-${item.id}`} name="date" type="date" defaultValue={date} className={inputClass} />
              </Field>
              <Field label="Time" htmlFor={`time-${item.id}`}>
                <input id={`time-${item.id}`} name="time" type="time" defaultValue={time} className={inputClass} />
              </Field>
            </div>
          </ActionForm>
        </details>
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground line-clamp-3">{item.body}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-3 border-t pt-3">
        {item.status === 'scheduled' && (
          <ActionForm action={skipScheduled} submitLabel="Skip" pendingLabel="Skipping..." variant="outline">
            <input type="hidden" name="id" value={item.id} />
          </ActionForm>
        )}
        {(item.status === 'skipped' || item.status === 'failed') && (
          <ActionForm action={restoreScheduled} submitLabel={item.status === 'failed' ? 'Retry' : 'Restore'} pendingLabel="Saving...">
            <input type="hidden" name="id" value={item.id} />
          </ActionForm>
        )}
        <ActionForm
          action={cancelScheduled}
          submitLabel="Cancel message"
          pendingLabel="Canceling..."
          variant="ghost"
          confirmMessage="Cancel this message? It will not be sent."
        >
          <input type="hidden" name="id" value={item.id} />
        </ActionForm>
      </div>
    </li>
  )
}

export async function ScheduleSection({ ctx }: { ctx: HomeContext }) {
  const { open, closed } = await getSchedule(ctx.home.id)

  return (
    <div className="flex flex-col gap-5">
      <p className="rounded-lg bg-notice p-4 text-sm leading-relaxed text-notice-foreground">
        {ctx.home.messaging_paused
          ? 'All automated messages are paused. Nothing will send until an administrator resumes them in Settings.'
          : 'Automated messages send Monday to Saturday, 10am to 6pm Eastern, spread across the day, at most one per family per day. Anything due on a Sunday or federal holiday moves to the next sending day. Personal replies to families can be sent anytime.'}{' '}
        {ctx.home.texting_enabled ? '' : 'Texting is not connected yet, so sends are simulated.'}
      </p>

      {open.length === 0 ? (
        <p className="rounded-xl bg-card p-6 text-sm text-muted-foreground">
          Nothing upcoming. Messages are scheduled automatically when you add a family.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {open.map((item) => (
            <ScheduledCard key={item.id} item={item} ctx={ctx} />
          ))}
        </ul>
      )}

      {closed.length > 0 && (
        <section aria-labelledby="schedule-history" className="rounded-xl bg-card">
          <h2 id="schedule-history" className="px-5 py-4 font-semibold">
            Recent history
          </h2>
          <ul>
            {closed.map((item) => (
              <li key={item.id} className="flex flex-wrap justify-between gap-2 border-t px-5 py-4 text-sm">
                <span>
                  {item.families?.contact_name ?? 'Family'}
                  {item.message_templates ? ` · ${item.message_templates.title}` : ''}
                </span>
                <span className="text-muted-foreground">
                  {displayStatus(item.status, { deliveryStatus: item.delivery_status })}
                  {item.sent_at ? ` · ${formatDateTime(item.sent_at, ctx.home.timezone)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
