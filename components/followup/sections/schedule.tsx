import { approveScheduled, cancelScheduled, sendScheduledNow, updateScheduled } from '@/app/actions'
import { getSchedule, type ScheduledRow } from '@/lib/data'
import { formatDateTime, SCHEDULED_STATUS_LABELS, toZonedInputs } from '@/lib/format'
import type { HomeContext } from '@/lib/types'
import { ActionForm } from '../action-form'
import { Field, inputClass } from '../field'

function ScheduledCard({ item, ctx }: { item: ScheduledRow; ctx: HomeContext }) {
  const tz = ctx.home.timezone
  const { date, time } = toZonedInputs(item.scheduled_for, tz)
  const isAdmin = ctx.role === 'admin'
  const familyHeld = item.families?.status !== 'active'

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
          {SCHEDULED_STATUS_LABELS[item.status]} · {formatDateTime(item.scheduled_for, tz)}
        </p>
      </div>
      {(item.blocked_reason || familyHeld) && (
        <p className="mt-2 rounded-lg bg-notice p-3 text-sm leading-relaxed text-notice-foreground">
          {item.blocked_reason ?? 'On hold while this conversation is paused.'}
        </p>
      )}

      <ActionForm action={updateScheduled} submitLabel="Save changes" variant="outline" className="mt-3">
        <input type="hidden" name="id" value={item.id} />
        <Field label="Message" htmlFor={`body-${item.id}`} hint="Editing an approved message sends it back for approval.">
          <textarea id={`body-${item.id}`} name="body" rows={4} maxLength={640} defaultValue={item.body} className={inputClass} />
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

      <div className="mt-3 flex flex-wrap gap-3 border-t pt-3">
        {item.status === 'pending_approval' && isAdmin && (
          <ActionForm action={approveScheduled} submitLabel="Approve" pendingLabel="Approving...">
            <input type="hidden" name="id" value={item.id} />
          </ActionForm>
        )}
        {item.status === 'pending_approval' && !isAdmin && (
          <p className="text-sm text-muted-foreground">Waiting for an administrator to approve.</p>
        )}
        {item.status === 'approved' && (
          <ActionForm action={sendScheduledNow} submitLabel="Simulate send now" pendingLabel="Recording..." variant="secondary">
            <input type="hidden" name="id" value={item.id} />
          </ActionForm>
        )}
        <ActionForm
          action={cancelScheduled}
          submitLabel="Cancel message"
          pendingLabel="Cancelling..."
          variant="ghost"
          confirmMessage="Cancel this scheduled message?"
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
        {ctx.home.require_approval
          ? 'An administrator must approve each message before it can go out.'
          : 'Approval is turned off in Settings. Messages still never send while texting is disabled.'}{' '}
        Each family gets each template at most once.
      </p>

      {open.length === 0 ? (
        <p className="rounded-xl bg-card p-6 text-sm text-muted-foreground">
          Nothing scheduled. Schedule follow-ups from the Families page.
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
                <span className="text-muted-foreground">{SCHEDULED_STATUS_LABELS[item.status]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
