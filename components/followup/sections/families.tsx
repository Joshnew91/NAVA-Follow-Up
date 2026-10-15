import { addFamily, setFamilyPaused, stopFamily, withdrawAuthorization } from '@/app/actions'
import { getFamilies } from '@/lib/data'
import { familyStatusLabel, formatDate, formatPhone } from '@/lib/format'
import type { HomeContext } from '@/lib/types'
import { ActionForm } from '../action-form'
import { Field, inputClass } from '../field'

function dateOnly(value: string) {
  return formatDate(`${value}T12:00:00Z`, 'UTC')
}

export async function FamiliesSection({ ctx }: { ctx: HomeContext }) {
  const families = await getFamilies(ctx.home.id)
  const tz = ctx.home.timezone

  return (
    <div className="flex flex-col gap-5">
      <details className="rounded-xl bg-card p-5" open={families.length === 0}>
        <summary className="min-h-11 cursor-pointer content-center font-semibold">Add a family</summary>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          All five follow-ups are scheduled automatically and sent on their dates.
        </p>
        <ActionForm action={addFamily} submitLabel="Add family" pendingLabel="Adding..." resetOnSuccess className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Name of the deceased" htmlFor="deceasedName">
              <input id="deceasedName" name="deceasedName" required maxLength={120} autoComplete="off" className={inputClass} />
            </Field>
            <Field label="Family contact" htmlFor="contactName">
              <input id="contactName" name="contactName" required maxLength={120} autoComplete="off" className={inputClass} />
            </Field>
            <Field label="Mobile number" htmlFor="phone">
              <input
                id="phone"
                name="phone"
                type="tel"
                inputMode="tel"
                required
                autoComplete="off"
                placeholder="(512) 555-0123"
                className={inputClass}
              />
            </Field>
            <Field label="Service date" htmlFor="serviceDate">
              <input id="serviceDate" name="serviceDate" type="date" required className={inputClass} />
            </Field>
            <Field label="Relationship (optional)" htmlFor="relationship">
              <input id="relationship" name="relationship" maxLength={60} placeholder="Daughter" className={inputClass} />
            </Field>
            <Field label="Authorization signed (optional)" htmlFor="authorizationSignedOn">
              <input id="authorizationSignedOn" name="authorizationSignedOn" type="date" className={inputClass} />
            </Field>
          </div>
  <p className="rounded-lg bg-secondary p-3 text-sm leading-relaxed text-muted-foreground">
  Only add families who have signed your written SMS authorization form. Your name and today&apos;s date are recorded automatically.
  </p>
          <label className="flex min-h-11 items-center gap-3 text-sm text-muted-foreground">
            <input type="checkbox" name="allowDuplicate" className="size-5 shrink-0 accent-brand" />
            This is a different family with similar names
          </label>
        </ActionForm>
      </details>

      {families.length === 0 ? (
        <p className="rounded-xl bg-card p-6 text-sm text-muted-foreground">No families yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {families.map((family) => {
            const authorized = family.consent?.consent_given === true
            const canPause = family.status === 'active'
            const canResume = family.status === 'paused' || family.status === 'completed'
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
                  {family.service_date ? ` · Service ${dateOnly(family.service_date)}` : ''}
                </p>

                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-secondary p-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Enrolled</dt>
                    <dd>
                      {formatDate(family.created_at, tz)}
                      {family.enrolledBy ? ` by ${family.enrolledBy}` : ''}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Authorization</dt>
                    <dd>
                      {family.status === 'opted_out'
                        ? 'Opted out'
                        : authorized
                          ? family.authorization_signed_on
                            ? `Signed ${dateOnly(family.authorization_signed_on)}`
                            : 'On file'
                          : 'Not on file'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Upcoming messages</dt>
                    <dd>{family.openScheduled}</dd>
                  </div>
                </dl>

                {family.status === 'opted_out' ? (
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    This number replied STOP and will not receive messages. Only the family can opt back in by texting START.
                  </p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-3">
                    {canPause && (
                      <ActionForm action={setFamilyPaused} submitLabel="Pause" pendingLabel="Pausing..." variant="outline">
                        <input type="hidden" name="familyId" value={family.id} />
                        <input type="hidden" name="pause" value="true" />
                      </ActionForm>
                    )}
                    {canResume && (
                      <ActionForm action={setFamilyPaused} submitLabel="Resume" pendingLabel="Resuming...">
                        <input type="hidden" name="familyId" value={family.id} />
                        <input type="hidden" name="pause" value="false" />
                      </ActionForm>
                    )}
                    {family.status !== 'completed' && family.openScheduled > 0 && (
                      <ActionForm
                        action={stopFamily}
                        submitLabel="Stop follow-ups"
                        pendingLabel="Stopping..."
                        variant="ghost"
                        confirmMessage="Stop all remaining follow-ups for this family? You can resume later."
                      >
                        <input type="hidden" name="familyId" value={family.id} />
                      </ActionForm>
                    )}
                    {authorized && (
                      <details className="w-full">
                        <summary className="min-h-11 cursor-pointer content-center text-sm text-muted-foreground">
                          Family withdrew authorization
                        </summary>
                        <ActionForm
                          action={withdrawAuthorization}
                          submitLabel="Record withdrawal"
                          variant="destructive"
                          confirmMessage="Mark this number as opted out and cancel every remaining message?"
                          className="mt-3"
                        >
                          <input type="hidden" name="familyId" value={family.id} />
                          <Field label="Note (optional)" htmlFor={`note-${family.id}`}>
                            <input id={`note-${family.id}`} name="note" maxLength={1000} className={inputClass} />
                          </Field>
                        </ActionForm>
                      </details>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
