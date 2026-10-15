import { saveTextingProfile } from '@/app/account-actions'
import { getMessagingProfile, getPlatformFlags } from '@/lib/data-account'
import { formatDateTime, formatPhone } from '@/lib/format'
import type { HomeContext } from '@/lib/types'
import { ActionForm } from '../action-form'
import { Field, inputClass } from '../field'

const STEPS = [
  { key: 'draft', label: 'Business details' },
  { key: 'submitted', label: 'NAVA review' },
  { key: 'pending_carrier', label: 'Carrier registration' },
  { key: 'approved', label: 'Approved' },
]

const STATUS_TEXT: Record<string, string> = {
  draft: 'Not submitted yet.',
  submitted: 'Submitted. NAVA is reviewing your details.',
  pending_carrier: 'Sent to the phone carriers for registration. This usually takes a few days.',
  approved: 'Approved for texting.',
  rejected: 'Changes needed. See the note below, update the details and resubmit.',
}

export async function TextingSection({ ctx }: { ctx: HomeContext }) {
  const isAdmin = ctx.role === 'admin'
  const [profile, flags] = await Promise.all([getMessagingProfile(ctx.home.id), getPlatformFlags()])
  const status = profile?.status ?? 'draft'
  const stepIndex = Math.max(0, STEPS.findIndex((s) => s.key === status))
  const editable = isAdmin && ['draft', 'rejected'].includes(status)

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="texting-status" className="rounded-xl bg-card p-5">
        <h2 id="texting-status" className="font-semibold">
          Texting setup
        </h2>
        <ol className="mt-4 flex flex-col gap-3">
          {STEPS.map((step, i) => {
            const done = status !== 'rejected' && i < stepIndex
            const current = i === stepIndex
            return (
              <li key={step.key} className="flex items-center gap-3 text-sm">
                <span
                  aria-hidden="true"
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    done || (current && status === 'approved')
                      ? 'bg-brand text-brand-foreground'
                      : current
                        ? 'border-2 border-brand text-foreground'
                        : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {i + 1}
                </span>
                <span className={current ? 'font-medium' : 'text-muted-foreground'}>{step.label}</span>
              </li>
            )
          })}
        </ol>
        <p className="mt-4 text-sm leading-relaxed">{STATUS_TEXT[status] ?? status}</p>
        {profile?.status_note && (
          <p className="mt-2 rounded-lg bg-muted p-3 text-sm leading-relaxed">Note from NAVA: {profile.status_note}</p>
        )}
        {profile?.submitted_at && (
          <p className="mt-2 text-xs text-muted-foreground">Submitted {formatDateTime(profile.submitted_at, ctx.home.timezone)}</p>
        )}
      </section>

      <section aria-labelledby="number" className="rounded-xl bg-card p-5">
        <h2 id="number" className="font-semibold">
          Your texting number
        </h2>
        <p className="mt-2 text-2xl font-semibold tabular-nums">
          {profile?.phone_number_e164 ? formatPhone(profile.phone_number_e164) : 'Not assigned yet'}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {profile?.phone_number_e164
            ? 'Families see this number and can reply to it. Replies arrive in your Inbox.'
            : 'NAVA assigns a dedicated local number after your registration is approved.'}
        </p>
        {!flags.sms_live_enabled && (
          <p className="mt-3 rounded-lg bg-notice p-3 text-sm leading-relaxed text-notice-foreground">
            Real texting is not turned on yet. Messages run on schedule but each send is simulated.
          </p>
        )}
      </section>

      <section aria-labelledby="business" className="rounded-xl bg-card p-5">
        <h2 id="business" className="font-semibold">
          Business details for carrier registration
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Phone carriers require this before a business can send texts. It must match your IRS records.
        </p>
        {editable ? (
          <ActionForm action={saveTextingProfile} submitLabel="Save draft" className="mt-4">
            <ProfileFields profile={profile} />
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input type="checkbox" name="intent" value="submit" className="size-5 shrink-0 accent-brand" />
              Submit to NAVA for review now
            </label>
          </ActionForm>
        ) : (
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            {[
              ['Legal name', profile?.legal_business_name],
              ['EIN', profile?.ein],
              ['Address', [profile?.street, profile?.city, profile?.state, profile?.postal_code].filter(Boolean).join(', ')],
              ['Contact', [profile?.contact_name, profile?.contact_email].filter(Boolean).join(' · ')],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-medium break-words">{value || '—'}</dd>
              </div>
            ))}
          </dl>
        )}
        {!isAdmin && <p className="mt-3 text-sm text-muted-foreground">Only administrators can edit these details.</p>}
      </section>
    </div>
  )
}

function ProfileFields({ profile }: { profile: Awaited<ReturnType<typeof getMessagingProfile>> }) {
  const v = (k: keyof NonNullable<typeof profile>) => (profile?.[k] as string | null) ?? ''
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Legal business name *" htmlFor="p-legal" className="sm:col-span-2">
        <input id="p-legal" name="legal_business_name" defaultValue={v('legal_business_name')} className={inputClass} />
      </Field>
      <Field label="EIN *" htmlFor="p-ein">
        <input id="p-ein" name="ein" inputMode="numeric" placeholder="12-3456789" defaultValue={v('ein')} className={inputClass} />
      </Field>
      <Field label="Business type" htmlFor="p-type">
        <select id="p-type" name="business_type" defaultValue={v('business_type') || 'llc'} className={inputClass}>
          <option value="llc">LLC</option>
          <option value="corporation">Corporation</option>
          <option value="partnership">Partnership</option>
          <option value="sole_proprietor">Sole proprietor</option>
          <option value="nonprofit">Nonprofit</option>
        </select>
      </Field>
      <Field label="Street address *" htmlFor="p-street" className="sm:col-span-2">
        <input id="p-street" name="street" autoComplete="street-address" defaultValue={v('street')} className={inputClass} />
      </Field>
      <Field label="City *" htmlFor="p-city">
        <input id="p-city" name="city" defaultValue={v('city')} className={inputClass} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="State *" htmlFor="p-state">
          <input id="p-state" name="state" maxLength={2} defaultValue={v('state')} className={inputClass} />
        </Field>
        <Field label="ZIP *" htmlFor="p-zip">
          <input id="p-zip" name="postal_code" inputMode="numeric" defaultValue={v('postal_code')} className={inputClass} />
        </Field>
      </div>
      <Field label="Website" htmlFor="p-web" className="sm:col-span-2">
        <input id="p-web" name="website" type="url" placeholder="https://" defaultValue={v('website')} className={inputClass} />
      </Field>
      <Field label="Contact name *" htmlFor="p-cname">
        <input id="p-cname" name="contact_name" defaultValue={v('contact_name')} className={inputClass} />
      </Field>
      <Field label="Contact email *" htmlFor="p-cemail">
        <input id="p-cemail" name="contact_email" type="email" defaultValue={v('contact_email')} className={inputClass} />
      </Field>
      <Field label="Contact phone *" htmlFor="p-cphone">
        <input id="p-cphone" name="contact_phone" type="tel" defaultValue={v('contact_phone')} className={inputClass} />
      </Field>
      <Field label="Preferred area code" htmlFor="p-area" hint="For your dedicated local number.">
        <input id="p-area" name="preferred_area_code" inputMode="numeric" maxLength={3} defaultValue={v('preferred_area_code')} className={inputClass} />
      </Field>
    </div>
  )
}
