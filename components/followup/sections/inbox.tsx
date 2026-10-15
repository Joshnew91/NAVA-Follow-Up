import Link from 'next/link'
import { sendReply, setFamilyPaused, simulateReply } from '@/app/actions'
import { getInbox } from '@/lib/data'
import { familyStatusLabel, formatDateTime, formatPhone } from '@/lib/format'
import type { HomeContext } from '@/lib/types'
import { cn } from '@/lib/utils'
import { ActionForm } from '../action-form'
import { inputClass } from '../field'

export async function InboxSection({ ctx, familyId }: { ctx: HomeContext; familyId?: string }) {
  const { list, selected, messages, hasConsent } = await getInbox(ctx.home.id, familyId)

  if (!selected) {
    return (
      <div className="rounded-xl bg-card p-6 leading-relaxed">
        <p className="font-semibold">No families yet</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Add a family on the{' '}
          <Link href="/?section=Families" className="underline underline-offset-4">
            Families
          </Link>{' '}
          page, or load fictional sample families from Settings.
        </p>
      </div>
    )
  }

  const blocked = selected.status === 'opted_out' || !hasConsent

  return (
    <div className="flex flex-wrap gap-5">
      <section aria-labelledby="conversations-heading" className="flex-[1_1_250px] overflow-hidden rounded-xl bg-card">
        <h2 id="conversations-heading" className="px-5 py-4 font-semibold">
          Conversations
        </h2>
        <ul>
          {list.map((family) => {
            const isSelected = family.id === selected.id
            return (
              <li key={family.id}>
                <Link
                  href={`/?section=Inbox&family=${family.id}`}
                  aria-current={isSelected ? 'true' : undefined}
                  className={cn(
                    'block w-full border-t px-5 py-5 text-left transition-colors hover:bg-secondary',
                    isSelected && 'bg-secondary',
                  )}
                >
                  <span className="block font-semibold">{family.contact_name}</span>
                  <span className="mt-1.5 block text-xs text-muted-foreground">
                    {familyStatusLabel(family.status, family.paused_reason)}
                    {family.is_sample ? ' · Sample' : ''}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </section>

      <section
        aria-label={`Conversation with ${selected.contact_name}`}
        className="flex min-h-[440px] flex-[2_1_350px] flex-col rounded-xl bg-card"
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-5">
          <div>
            <p className="font-semibold">{selected.contact_name}</p>
            <p className="text-xs text-muted-foreground">
              {formatPhone(selected.phone_e164)} · {familyStatusLabel(selected.status, selected.paused_reason)}
              {selected.is_sample ? ' · Sample family' : ''}
            </p>
          </div>
          {selected.status !== 'opted_out' && selected.status !== 'completed' && (
            <ActionForm
              action={setFamilyPaused}
              submitLabel={selected.status === 'paused' ? 'Resume' : 'Pause'}
              pendingLabel="Updating..."
              variant="outline"
              className="gap-0"
            >
              <input type="hidden" name="familyId" value={selected.id} />
              <input type="hidden" name="pause" value={selected.status === 'paused' ? 'false' : 'true'} />
            </ActionForm>
          )}
        </div>

        {messages.length === 0 ? (
          <p className="flex-1 p-5 text-sm text-muted-foreground">No messages yet.</p>
        ) : (
          <ol className="flex flex-1 flex-col gap-3.5 p-5">
            {messages.map((message) => {
              const fromHome = message.direction === 'outbound'
              return (
                <li
                  key={message.id}
                  className={cn('max-w-[85%] rounded-xl p-4 md:max-w-[78%]', fromHome ? 'ml-auto bg-accent' : 'bg-muted')}
                >
                  <p className="text-xs text-muted-foreground">
                    {fromHome ? ctx.home.name : selected.contact_name} ·{' '}
                    {formatDateTime(message.created_at, ctx.home.timezone)}
                    {fromHome && message.delivery_status === 'simulated' ? ' · Simulated' : ''}
                  </p>
                  <p className="mt-1.5 whitespace-pre-wrap leading-relaxed">{message.body}</p>
                </li>
              )
            })}
          </ol>
        )}

        <div className="flex flex-col gap-4 border-t p-4">
          {selected.status === 'paused' && (
            <p className="rounded-lg bg-notice p-3 text-sm leading-relaxed text-notice-foreground">
              Scheduled follow-ups are on hold while this conversation is paused. You can still reply by hand.
            </p>
          )}
          {blocked ? (
            <p className="rounded-lg bg-notice p-3 text-sm leading-relaxed text-notice-foreground">
              {selected.status === 'opted_out'
                ? 'This family texted STOP. No messages can be sent unless they text START.'
                : 'No documented SMS consent. Record consent on the Families page before messaging.'}
            </p>
          ) : (
            <ActionForm
              action={sendReply}
              submitLabel="Send"
              pendingLabel="Sending..."
              resetOnSuccess
              footerClassName="flex-row-reverse justify-end"
            >
              <input type="hidden" name="familyId" value={selected.id} />
              <label htmlFor="reply" className="sr-only">
                Reply to {selected.contact_name}
              </label>
              <textarea id="reply" name="body" required maxLength={640} rows={2} placeholder="Write a reply..." className={inputClass} />
            </ActionForm>
          )}

          {selected.is_sample && (
            <details className="rounded-lg bg-secondary p-3">
              <summary className="min-h-11 cursor-pointer content-center text-sm font-medium">
                Test: simulate a reply from this sample family
              </summary>
              <ActionForm
                action={simulateReply}
                submitLabel="Record reply"
                pendingLabel="Recording..."
                variant="secondary"
                resetOnSuccess
                className="mt-3"
              >
                <input type="hidden" name="familyId" value={selected.id} />
                <label htmlFor="simulated-reply" className="text-sm text-muted-foreground">
                  Try a normal reply, STOP, or START.
                </label>
                <input id="simulated-reply" name="body" required maxLength={1600} className={inputClass} />
              </ActionForm>
            </details>
          )}
        </div>
      </section>
    </div>
  )
}
