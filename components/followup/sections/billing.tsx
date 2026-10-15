import {
  cancelSubscription,
  openBillingPortal,
  reactivateSubscription,
  startSubscription,
  updateSpendingLimit,
} from '@/app/account-actions'
import { getBilling, getStripeDetails, type StripeDetails, type SubscriptionRow } from '@/lib/data-account'
import { stripeIsLiveKey } from '@/lib/stripe'
import type { HomeContext } from '@/lib/types'
import { ActionForm } from '../action-form'
import { Field, inputClass } from '../field'

const STATUS_LABEL: Record<string, string> = {
  none: 'Not started',
  incomplete: 'Waiting for payment',
  incomplete_expired: 'Checkout expired',
  trialing: 'Trial',
  active: 'Active',
  past_due: 'Payment failed',
  canceled: 'Canceled',
  unpaid: 'Suspended',
}

const ACTIVE = ['active', 'trialing', 'past_due', 'unpaid']

function dollars(cents: number) {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`
}

function day(value: string | number | null | undefined, tz: string) {
  if (value === null || value === undefined) return null
  const date = typeof value === 'number' ? new Date(value * 1000) : new Date(value)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: tz })
}

function statusTone(status: string, suspended: boolean, canceling: boolean) {
  if (suspended || status === 'canceled' || status === 'unpaid') return 'bg-destructive/10 text-destructive'
  if (status === 'past_due' || canceling) return 'bg-notice text-notice-foreground'
  if (status === 'active' || status === 'trialing') return 'bg-brand/10 text-brand'
  return 'bg-muted text-foreground'
}

export async function BillingSection({ ctx }: { ctx: HomeContext }) {
  const isAdmin = ctx.role === 'admin'
  const tz = ctx.home.timezone
  const { usage, subscription, flags } = await getBilling(ctx.home.id)
  const details = isAdmin ? await getStripeDetails(subscription) : null
  const status = subscription?.status ?? 'none'
  const isActive = ACTIVE.includes(status)
  const canceling = Boolean(subscription?.cancel_at_period_end && isActive)
  const suspended = Boolean(subscription?.service_suspended_at)
  const live = stripeIsLiveKey()

  return (
    <div className="flex flex-col gap-5">
      {(!live || !flags.billing_live_enabled) && (
        <p className="rounded-lg bg-notice p-3 text-sm leading-relaxed text-notice-foreground">
          {live
            ? 'Live billing is waiting for NAVA approval. No charges will be made.'
            : 'Billing is in test mode. No real charges are made. Use the test card 4242 4242 4242 4242.'}
        </p>
      )}

      <ServiceNotice subscription={subscription} graceDays={flags.grace_period_days} tz={tz} />

      <section aria-labelledby="plan" className="rounded-xl bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="plan" className="font-semibold">
              Standard plan
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              $125 per month. Includes 500 new families per subscription year, then $1 per additional family.
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${statusTone(status, suspended, canceling)}`}
          >
            {canceling ? 'Ends soon' : suspended && status !== 'canceled' ? 'Suspended' : (STATUS_LABEL[status] ?? status)}
          </span>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">{canceling ? 'Service ends' : 'Next billing date'}</dt>
            <dd className="font-medium tabular-nums">
              {(canceling ? day(subscription?.current_period_end, tz) : day(details?.nextDate ?? subscription?.current_period_end, tz)) ??
                'None'}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Expected payment</dt>
            <dd className="font-medium tabular-nums">
              {canceling || !isActive
                ? '$0'
                : details?.nextAmountCents != null
                  ? dollars(details.nextAmountCents)
                  : isActive
                    ? dollars(12500 + (usage?.overage_cents ?? 0))
                    : '$0'}
            </dd>
          </div>
        </dl>

        {!isAdmin && <p className="mt-4 text-sm text-muted-foreground">Only administrators can view or change billing.</p>}

        {isAdmin && (
          <div className="mt-5 flex flex-col gap-3">
            {isActive && !canceling && (
              <ActionForm action={openBillingPortal} submitLabel="Manage in Stripe portal" pendingLabel="Opening..." />
            )}
            {canceling && (
              <ActionForm action={reactivateSubscription} submitLabel="Keep my subscription" pendingLabel="Reactivating..." />
            )}
            {!isActive && (
              <ActionForm
                action={status === 'canceled' || status === 'incomplete_expired' ? reactivateSubscription : startSubscription}
                submitLabel={status === 'canceled' ? 'Reactivate subscription' : 'Start subscription'}
                pendingLabel="Opening checkout..."
              />
            )}
            {subscription?.stripe_customer_id && (isActive || canceling) && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Opens Stripe&apos;s secure portal. Card numbers are handled by Stripe and never stored by NAVA.
              </p>
            )}
          </div>
        )}
      </section>

      {isAdmin && subscription?.stripe_customer_id && <PaymentMethod details={details} />}

      <UsageCard usage={usage} />

      <SpendingLimit isAdmin={isAdmin} limitCents={usage?.spending_limit_cents ?? null} />

      {isAdmin && subscription?.stripe_customer_id && <Invoices details={details} tz={tz} />}

      {isAdmin && isActive && !canceling && <CancelCard endsOn={day(subscription?.current_period_end, tz)} />}
    </div>
  )
}

function ServiceNotice({ subscription, graceDays, tz }: { subscription: SubscriptionRow | null; graceDays: number; tz: string }) {
  if (!subscription) return null
  if (subscription.service_suspended_at) {
    return (
      <div role="status" className="rounded-lg bg-destructive/10 p-4 text-sm leading-relaxed text-destructive">
        <p className="font-semibold">Automated texting is paused</p>
        <p className="mt-1">
          Scheduled messages are not sending. Your families and history are safe. Update your payment method or reactivate to
          restore service. Messages that came due while paused will not be sent late.
        </p>
      </div>
    )
  }
  if (subscription.status === 'past_due' && subscription.past_due_since) {
    const deadline = new Date(new Date(subscription.past_due_since).getTime() + graceDays * 86400000)
    return (
      <div role="status" className="rounded-lg bg-notice p-4 text-sm leading-relaxed text-notice-foreground">
        <p className="font-semibold">Your last payment did not go through</p>
        <p className="mt-1">
          Stripe will retry automatically. Texting continues until {day(deadline.toISOString(), tz)}, then pauses until payment
          succeeds. Update your card below to fix it now.
        </p>
      </div>
    )
  }
  if (subscription.cancel_at_period_end && ACTIVE.includes(subscription.status)) {
    return (
      <div role="status" className="rounded-lg bg-notice p-4 text-sm leading-relaxed text-notice-foreground">
        <p className="font-semibold">Cancellation scheduled</p>
        <p className="mt-1">
          Everything keeps working until {day(subscription.current_period_end, tz) ?? 'the end of the paid period'}. You can keep
          your subscription any time before then.
        </p>
      </div>
    )
  }
  return null
}

function PaymentMethod({ details }: { details: StripeDetails | null }) {
  return (
    <section aria-labelledby="payment" className="rounded-xl bg-card p-5">
      <h2 id="payment" className="font-semibold">
        Payment & billing details
      </h2>
      {details?.error ? (
        <p className="mt-2 text-sm text-muted-foreground">Could not load details from Stripe right now.</p>
      ) : (
        <dl className="mt-3 flex flex-col gap-3 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Card</dt>
            <dd className="text-right font-medium">
              {details?.card
                ? `${details.card.brand.toUpperCase()} ending ${details.card.last4} · ${String(details.card.expMonth).padStart(2, '0')}/${String(details.card.expYear).slice(-2)}`
                : 'None on file'}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Billed to</dt>
            <dd className="min-w-0 truncate text-right font-medium">{details?.billingName ?? 'Not set'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Receipts sent to</dt>
            <dd className="min-w-0 truncate text-right font-medium">{details?.billingEmail ?? 'Not set'}</dd>
          </div>
        </dl>
      )}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ActionForm action={openBillingPortal} submitLabel="Update card" pendingLabel="Opening..." variant="outline">
          <input type="hidden" name="flow" value="payment_method_update" />
        </ActionForm>
        <ActionForm action={openBillingPortal} submitLabel="Edit billing details" pendingLabel="Opening..." variant="outline" />
      </div>
    </section>
  )
}

function UsageCard({ usage }: { usage: Awaited<ReturnType<typeof getBilling>>['usage'] }) {
  const enrolled = usage?.enrolled ?? 0
  const included = usage?.included ?? 500
  const remaining = Math.max(0, included - enrolled)
  const pct = Math.min(100, Math.round((enrolled / Math.max(included, 1)) * 100))
  return (
    <section aria-labelledby="allowance" className="rounded-xl bg-card p-5">
      <h2 id="allowance" className="font-semibold">
        Families this subscription year
      </h2>
      <p className="mt-3 text-3xl font-semibold tabular-nums">
        {enrolled}
        <span className="text-base font-normal text-muted-foreground"> of {included} included</span>
      </p>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Included families used"
      >
        <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground">Remaining included</dt>
          <dd className="font-medium tabular-nums">{remaining}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Additional families</dt>
          <dd className="font-medium tabular-nums">
            {usage?.extra ?? 0} · {dollars(usage?.extra_cents ?? 0)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Not yet billed</dt>
          <dd className="font-medium tabular-nums">{dollars(usage?.overage_cents ?? 0)}</dd>
        </div>
        {usage && (
          <div>
            <dt className="text-muted-foreground">Year</dt>
            <dd className="font-medium">
              {usage.year_start} – {usage.year_end}
            </dd>
          </div>
        )}
      </dl>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        Additional-family charges are added to your next monthly invoice. Reaching the allowance never stops messages already
        scheduled.
      </p>
    </section>
  )
}

function SpendingLimit({ isAdmin, limitCents }: { isAdmin: boolean; limitCents: number | null }) {
  return (
    <section aria-labelledby="limit" className="rounded-xl bg-card p-5">
      <h2 id="limit" className="font-semibold">
        Spending limit for additional families
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        {limitCents === null
          ? 'No limit set. Additional families are added at $1 each.'
          : `Currently ${dollars(limitCents)} per year (${limitCents / 100} additional families). New enrollments pause when it's reached; you'll be emailed at 80% and 100%.`}
      </p>
      {isAdmin && (
        <ActionForm action={updateSpendingLimit} submitLabel="Save limit" className="mt-4">
          <Field label="Yearly limit in dollars" htmlFor="limit-input" hint="Leave blank for no limit. Enter 0 to allow no additional families.">
            <input
              id="limit-input"
              name="limit"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              defaultValue={limitCents === null ? '' : limitCents / 100}
              className={inputClass}
            />
          </Field>
        </ActionForm>
      )}
    </section>
  )
}

function Invoices({ details, tz }: { details: StripeDetails | null; tz: string }) {
  const invoices = details?.invoices ?? []
  return (
    <section aria-labelledby="invoices" className="rounded-xl bg-card p-5">
      <h2 id="invoices" className="font-semibold">
        Invoices
      </h2>
      {invoices.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No invoices yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col divide-y divide-border">
          {invoices.map((inv) => (
            <li key={inv.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-medium tabular-nums">{dollars(inv.total)}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {day(inv.created, tz)} · {inv.status === 'paid' ? 'Paid' : inv.status === 'open' ? 'Due' : (inv.status ?? '')}
                  {inv.number ? ` · ${inv.number}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {inv.hostedUrl && (
                  <a
                    href={inv.hostedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-11 items-center rounded-md px-3 text-sm font-medium text-brand underline-offset-4 hover:underline"
                  >
                    {inv.status === 'open' ? 'Pay' : 'View'}
                    <span className="sr-only"> invoice {inv.number ?? ''}</span>
                  </a>
                )}
                {inv.pdfUrl && (
                  <a
                    href={inv.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-11 items-center rounded-md px-3 text-sm font-medium text-brand underline-offset-4 hover:underline"
                  >
                    PDF<span className="sr-only"> for invoice {inv.number ?? ''}</span>
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function CancelCard({ endsOn }: { endsOn: string | null }) {
  return (
    <section aria-labelledby="cancel" className="rounded-xl bg-card p-5">
      <details>
        <summary className="flex min-h-11 cursor-pointer items-center font-semibold">
          <span id="cancel">Cancel subscription</span>
        </summary>
        <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
          <p>What happens if you cancel:</p>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            <li>Everything keeps working until {endsOn ?? 'the end of your paid period'}. You won&apos;t be charged again.</li>
            <li>After that date, scheduled texts will not send and family replies are no longer received.</li>
            <li>Your families, message history, templates and reports are kept, so you can come back at any time.</li>
            <li>If you reactivate later, messages that came due while service was off are not sent automatically.</li>
          </ul>
          <ActionForm action={cancelSubscription} submitLabel="Cancel at period end" pendingLabel="Canceling..." variant="destructive">
            <Field label="Reason (optional)" htmlFor="cancel-reason">
              <textarea id="cancel-reason" name="reason" rows={2} maxLength={500} className={inputClass} />
            </Field>
            <Field label="Type CANCEL to confirm" htmlFor="cancel-confirm">
              <input
                id="cancel-confirm"
                name="confirm"
                autoComplete="off"
                autoCapitalize="characters"
                required
                className={inputClass}
              />
            </Field>
          </ActionForm>
        </div>
      </details>
    </section>
  )
}
