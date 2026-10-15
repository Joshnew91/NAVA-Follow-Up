import { addFamily, recordConsent, scheduleFollowups } from '@/app/actions'
import { getFamilies } from '@/lib/data'
import { familyStatusLabel, formatDate, formatDateTime, formatPhone } from '@/lib/format'
import { CONSENT_METHOD_LABELS, STAFF_CONSENT_METHODS, type HomeContext } from '@/lib/types'
import { ActionForm } from '../action-form'
import { Field, inputClass } from '../field'

const DEFAULT_CONSENT_LANGUAGE =
  'I agree to receive occasional follow-up text messages from this funeral home. Message frequency varies. Reply STOP to opt out at any time.'

function ConsentFields({ prefix }: { prefix: string }) {
  return (
    <>
      <Field label="How consent was collected" htmlFor={`${prefix}-method`}>
        <select id={`${prefix}-method`} name="consentMethod" defaultValue="written_form" className={inputClass}>
          {STAFF_CONSENT_METHODS.map((method) => (
            <option key={method} value={method}>
              {CONSENT_METHOD_LABELS[method]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Consent wording the family agreed to" htmlFor={`${prefix}-language`}>
        <textarea
          id={`${prefix}-language`}
          name="consentLanguage"
          rows={3}
          maxLength={1000}
          defaultValue={DEFAULT_CONSENT_LANGUAGE}
          className={inputClass}
        />
      </Field>
      <Field label="Evidence note (optional)" htmlFor={`${prefix}-evidence`} hint="For example: signed form filed with arrangement paperwork.">
        <input id={`${prefix}-evidence`} name="evidenceNote" maxLength={1000} className={inputClass} />
      </Field>
    </>
  )
}

export async function FamiliesSection({ ctx }: { ctx: HomeContext }) {
  const families = await getFamilies(ctx.home.id)
  const tz = ctx.home.timezone

  return (
    <div className="flex flex-col gap-5">
      <details className="rounded-xl bg-card p-5">
        <summary className="min-h-11 cursor-pointer content-center font-semibold">Add a family</summary>
        <ActionForm action={addFamily} submitLabel="Add family" resetOnSuccess className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Contact name" htmlFor="contactName">
              <input id="contactName" name="contactName" required maxLength={120} className={inputClass} />
            </Field>
            <Field label="Relationship" htmlFor="relationship">
              <input id="relationship" name="relationship" maxLength={60} placeholder="Daughter" className={inputClass} />
            </Field>
            <Field label="Mobile number" htmlFor="phone">
              <input id="phone" name="phone" type="tel" required autoComplete="off" placeholder="(512) 555-0123" className={inputClass} />
            </Field>
            <Field label="Name of the deceased" htmlFor="deceasedName">
              <input id="deceasedName" name="deceasedName" maxLength={120} className={inputClass} />
            </Field>
            <Field label="Service date" htmlFor="serviceDate" hint="Follow-ups are scheduled from this date.">
              <input id="serviceDate" name="serviceDate" type="date" className={inputClass} />
            </Field>
          </div>
          <fieldset className="flex flex-col gap-4 rounded-lg bg-secondary p-4">
            <legend className="sr-only">SMS consent</legend>
            <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
              <input type="checkbox" name="consentGiven" className="size-5 accent-brand" />
              The family gave SMS consent
            </label>
            <ConsentFields prefix="new" />
          </fieldset>
        </ActionForm>
      </details>

      {families.length === 0 ? (
        <p className="rounded-xl bg-card p-6 text-sm text-muted-foreground">No families yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {families.map((family) => {
            const consented = family.consent?.consent_given === true
            const canSchedule = consented && family.status === 'active' && Boolean(family.service_date)
            return (
              <li key={family.id} className="rounded-xl bg-card p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold">
                    {family.contact_name}
                    {family.relationship ? <span className="font-normal text-muted-foreground"> · {family.relationship}</span> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {familyStatusLabel(family.status, family.paused_reason)}
                    {family.is_sample ? ' · Sample' : ''}
                  </p>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {formatPhone(family.phone_e164)}
                  {family.deceased_name ? ` · In memory of ${family.deceased_name}` : ''}
                  {family.service_date ? ` · Service ${formatDate(`${family.service_date}T12:00:00Z`, 'UTC')}` : ''}
                </p>

                <div className="mt-3 rounded-lg bg-secondary p-3 text-sm leading-relaxed">
                  {family.consent ? (
                    <>
                      <p className="font-medium">
                        {consented ? 'Consent on file' : 'No consent'} · {CONSENT_METHOD_LABELS[family.consent.method]}
                      </p>
                      <p className="text-muted-foreground">
                        Recorded {formatDateTime(family.consent.recorded_at, tz)}
                        {family.consent.evidence_note ? ` · ${family.consent.evidence_note}` : ''}
                      </p>
                    </>
                  ) : (
                    <p className="font-medium">No consent documented</p>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-3">
                  {canSchedule && (
                    <ActionForm action={scheduleFollowups} submitLabel="Schedule follow-ups" pendingLabel="Scheduling...">
                      <input type="hidden" name="familyId" value={family.id} />
                    </ActionForm>
                  )}
                  {consented && !family.service_date && (
                    <p className="text-sm text-muted-foreground">Add a service date to schedule follow-ups.</p>
                  )}
                  {family.status !== 'opted_out' && (
                    <details className="w-full">
                      <summary className="min-h-11 cursor-pointer content-center text-sm font-medium">
                        {consented ? 'Withdraw consent' : 'Record consent'}
                      </summary>
                      <ActionForm
                        action={recordConsent}
                        submitLabel={consented ? 'Withdraw consent' : 'Save consent'}
                        variant={consented ? 'destructive' : 'default'}
                        className="mt-3"
                      >
                        <input type="hidden" name="familyId" value={family.id} />
                        <input type="hidden" name="consentGiven" value={consented ? 'false' : 'true'} />
                        <ConsentFields prefix={family.id} />
                      </ActionForm>
                    </details>
                  )}
                  {family.status === 'opted_out' && (
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      This family texted STOP. Only the family can opt back in by texting START.
                    </p>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
