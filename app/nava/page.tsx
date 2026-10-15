import type { Metadata } from 'next'
import { setHomeTexting, setRegistrationStatus, updatePlatformSwitches } from '@/app/nava/actions'
import { ActionForm } from '@/components/followup/action-form'
import { Field, inputClass } from '@/components/followup/field'
import { NumberPicker } from '@/components/nava/number-picker'
import { getPlatformFlags } from '@/lib/data-account'
import { formatDateTime } from '@/lib/format'
import { requireNavaAdmin } from '@/lib/nava-session'
import { stripeIsLiveKey } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { twilioConfigured } from '@/lib/twilio'

export const metadata: Metadata = { title: 'NAVA Admin', robots: { index: false } }

type HomeRow = { id: string; name: string; texting_enabled: boolean; messaging_paused: boolean; created_at: string }
type SubRow = { funeral_home_id: string; status: string; current_period_end: string | null }
type ProfileRow = {
  funeral_home_id: string
  status: string
  status_note: string | null
  legal_business_name: string | null
  ein: string | null
  city: string | null
  state: string | null
  preferred_area_code: string | null
  phone_number_e164: string | null
  submitted_at: string | null
}
type AuditRow = { id: string; summary: string; actor_email: string | null; created_at: string; funeral_home_id: string | null }

const REG_LABEL: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Needs review',
  pending_carrier: 'With carriers',
  approved: 'Approved',
  rejected: 'Changes requested',
}

export default async function NavaAdminPage() {
  const admin = await requireNavaAdmin()
  const db = createAdminClient()
  const [flags, homesRes, subsRes, profilesRes, auditRes, failedEmailsRes] = await Promise.all([
    getPlatformFlags(),
    db.from('funeral_homes').select('id, name, texting_enabled, messaging_paused, created_at').order('created_at', { ascending: false }).limit(500),
    db.from('subscriptions').select('funeral_home_id, status, current_period_end'),
    db
      .from('messaging_profiles')
      .select('funeral_home_id, status, status_note, legal_business_name, ein, city, state, preferred_area_code, phone_number_e164, submitted_at'),
    db.from('audit_log').select('id, summary, actor_email, created_at, funeral_home_id').order('created_at', { ascending: false }).limit(40),
    db.from('email_outbox').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
  ])

  const homes = (homesRes.data ?? []) as HomeRow[]
  const subs = new Map(((subsRes.data ?? []) as SubRow[]).map((s) => [s.funeral_home_id, s]))
  const profiles = new Map(((profilesRes.data ?? []) as ProfileRow[]).map((p) => [p.funeral_home_id, p]))
  const homeName = new Map(homes.map((h) => [h.id, h.name]))
  const audit = (auditRes.data ?? []) as AuditRow[]

  const active = homes.filter((h) => ['active', 'trialing'].includes(subs.get(h.id)?.status ?? '')).length
  const pastDue = homes.filter((h) => subs.get(h.id)?.status === 'past_due').length
  const queue = homes.filter((h) => ['submitted', 'pending_carrier'].includes(profiles.get(h.id)?.status ?? ''))
  const needsNumber = homes.filter((h) => profiles.get(h.id)?.status === 'approved' && !profiles.get(h.id)?.phone_number_e164)

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-5 py-6 md:px-8">
      <header className="flex flex-col gap-2">
        <p className="text-xs tracking-wider text-muted-foreground">NAVA ADMINISTRATION</p>
        <h1 className="font-serif text-4xl text-balance">All funeral homes</h1>
        <p className="text-sm text-muted-foreground">Signed in as {admin.email} with two-step verification.</p>
      </header>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Funeral homes', homes.length],
          ['Paying', active],
          ['Payment failed', pastDue],
          ['Failed emails', failedEmailsRes.count ?? 0],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-card p-4">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="switches" className="rounded-xl bg-card p-5">
        <h2 id="switches" className="font-semibold">
          Live switches
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Everything runs in test mode until you turn these on. Each change is recorded in the audit log.
        </p>
        <ul className="mt-3 flex flex-col gap-1 text-sm">
          <li>Twilio keys: {twilioConfigured() ? 'connected' : 'not added yet'}</li>
          <li>Stripe key: {stripeIsLiveKey() ? 'LIVE key' : 'test key'}</li>
          <li>Resend key: {process.env.RESEND_API_KEY ? 'connected' : 'not added yet (emails are simulated)'}</li>
        </ul>
        <ActionForm action={updatePlatformSwitches} submitLabel="Save switches" className="mt-4">
          {[
            ['sms', 'Send real text messages', flags.sms_live_enabled],
            ['billing', 'Allow live Stripe charges', flags.billing_live_enabled],
            ['numbers', 'Allow buying Twilio numbers', flags.number_purchase_enabled],
          ].map(([name, label, on]) => (
            <label key={name as string} className="flex min-h-11 items-center gap-3 text-sm">
              <input type="checkbox" name={name as string} defaultChecked={on as boolean} className="size-5 shrink-0 accent-brand" />
              {label as string}
            </label>
          ))}
          <Field label="Type APPROVE to turn any switch on" htmlFor="confirm">
            <input id="confirm" name="confirm" autoComplete="off" className={inputClass} />
          </Field>
        </ActionForm>
      </section>

      <section aria-labelledby="queue" className="rounded-xl bg-card p-5">
        <h2 id="queue" className="font-semibold">
          Texting registration queue ({queue.length})
        </h2>
        {queue.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nothing waiting for review.</p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-border">
            {queue.map((h) => {
              const p = profiles.get(h.id)!
              return (
                <li key={h.id} className="flex flex-col gap-3 py-4">
                  <div>
                    <p className="font-medium">{h.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {p.legal_business_name} · EIN {p.ein} · {[p.city, p.state].filter(Boolean).join(', ')} · {REG_LABEL[p.status]}
                    </p>
                    {p.submitted_at && <p className="text-xs text-muted-foreground">Submitted {formatDateTime(p.submitted_at, 'America/New_York')}</p>}
                  </div>
                  <ActionForm action={setRegistrationStatus} submitLabel="Update status">
                    <input type="hidden" name="home" value={h.id} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="New status" htmlFor={`st-${h.id}`}>
                        <select id={`st-${h.id}`} name="status" defaultValue={p.status === 'submitted' ? 'pending_carrier' : 'approved'} className={inputClass}>
                          <option value="pending_carrier">Sent to carriers</option>
                          <option value="approved">Approved</option>
                          <option value="rejected">Request changes</option>
                        </select>
                      </Field>
                      <Field label="Note to funeral home" htmlFor={`nt-${h.id}`}>
                        <input id={`nt-${h.id}`} name="note" maxLength={500} className={inputClass} />
                      </Field>
                    </div>
                  </ActionForm>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {needsNumber.length > 0 && (
        <section aria-labelledby="numbers" className="rounded-xl bg-card p-5">
          <h2 id="numbers" className="font-semibold">
            Approved, waiting for a number ({needsNumber.length})
          </h2>
          <ul className="mt-3 flex flex-col divide-y divide-border">
            {needsNumber.map((h) => (
              <li key={h.id} className="py-4">
                <p className="font-medium">{h.name}</p>
                <NumberPicker
                  homeId={h.id}
                  defaultArea={profiles.get(h.id)?.preferred_area_code ?? ''}
                  purchasingEnabled={flags.number_purchase_enabled}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="homes" className="rounded-xl bg-card p-5">
        <h2 id="homes" className="font-semibold">
          Funeral homes
        </h2>
        {homes.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No funeral homes have signed up yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-border">
            {homes.map((h) => {
              const sub = subs.get(h.id)
              const p = profiles.get(h.id)
              return (
                <li key={h.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium">{h.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Plan: {sub?.status ?? 'not started'} · Texting: {REG_LABEL[p?.status ?? 'draft']}
                      {p?.phone_number_e164 ? ` · ${p.phone_number_e164}` : ''}
                      {h.messaging_paused ? ' · Paused' : ''}
                    </p>
                  </div>
                  <ActionForm
                    action={setHomeTexting}
                    submitLabel={h.texting_enabled ? 'Disable texting' : 'Enable texting'}
                    variant="outline"
                    footerClassName="sm:justify-end"
                  >
                    <input type="hidden" name="home" value={h.id} />
                    <input type="hidden" name="enabled" value={h.texting_enabled ? 'false' : 'true'} />
                  </ActionForm>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="platform-audit" className="rounded-xl bg-card p-5">
        <h2 id="platform-audit" className="font-semibold">
          Recent activity, all homes
        </h2>
        <ol className="mt-3 flex flex-col divide-y divide-border">
          {audit.map((a) => (
            <li key={a.id} className="py-3">
              <p className="text-sm leading-relaxed">{a.summary}</p>
              <p className="text-xs text-muted-foreground">
                {(a.funeral_home_id && homeName.get(a.funeral_home_id)) || 'Platform'} · {a.actor_email ?? 'System'} ·{' '}
                {formatDateTime(a.created_at, 'America/New_York')}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  )
}
