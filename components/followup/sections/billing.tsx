import { openBillingPortal, startSubscription, updateSpendingLimit } from '@/app/account-actions'
import { getBilling } from '@/lib/data-account'
import { formatDateTime } from '@/lib/format'
import { stripeIsLiveKey } from '@/lib/stripe'
import type { HomeContext } from '@/lib/types'
import { ActionForm } from '../action-form'
import { Field, inputClass } from '../field'

const STATUS_LABEL: Record<string, string> = {
  none: 'Not started',
  incomplete: 'Waiting for payment',
  trialing: 'Trial',
  active: 'Active',
  past_due: 'Payment failed',
  canceled: 'Canceled',
  unpaid: 'Unpaid',
}

function dollars(cents: number) {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0 })}`
}

export async function BillingSection({ ctx }: { ctx: HomeContext }) {
  const isAdmin = ctx.role === 'admin'
  const { usage, subscription, flags } = await getBilling(ctx.home.id)
  const status = subscription?.status ?? 'none'
  const hasSub = ['active', 'trialing', 'past_due', 'incomplete'].includes(status)
  const live = stripeIsLiveKey()
  const enrolled = usage?.enrolled ?? 0
  const included = usage?.included ?? 500
  const pct = Math.min(100, Math.round((enrolled / Math.max(included, 1)) * 100))
  const limitCents = usage?.spending_limit_cents ?? null

  return (
    <div className="flex flex-col gap-5">
      {(!live || !flags.billing_live_enabled) && (
        <p className="rounded-lg bg-notice p-3 text-sm leading-relaxed text-notice-foreground">
          {live
            ? 'Live billing is waiting for NAVA approval. No charges will be made.'
            : 'Billing is in test mode. No real charges are made. Use the test card 4242 4242 4242 4242.'}
        </p>
      )}

      <section aria-labelledby="plan" className="rounded-xl bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="plan" className="font-semibold">
              Monthly plan
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              $125 per month. Includes 500 new families per subscription year, then $1 per additional family.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-medium">{STATUS_LABEL[status] ?? status}</span>
        </div>
        {subscription?.current_period_end && (
          <p className="mt-3 text-sm text-muted-foreground">
            Next bill {formatDateTime(subscription.current_period_end, ctx.home.timezone)}
          </p>
        )}
        {isAdmin ? (
          <div className="mt-4">
            {hasSub ? (
              <ActionForm action={openBillingPortal} submitLabel="Manage payment & invoices" pendingLabel="Opening..." variant="outline" />
            ) : (
              <ActionForm action={startSubscription} submitLabel="Start subscription" pendingLabel="Opening checkout..." />
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Only administrators can manage billing.</p>
        )}
      </section>

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
        {usage && (
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Year</dt>
              <dd className="font-medium">
                {usage.year_start} to {usage.year_end}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Additional families</dt>
              <dd className="font-medium">
                {usage.extra} ({dollars(usage.extra_cents)})
              </dd>
            </div>
          </dl>
        )}
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          Reaching the allowance never stops messages already scheduled. It only affects new enrollments.
        </p>
      </section>

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
    </div>
  )
}
