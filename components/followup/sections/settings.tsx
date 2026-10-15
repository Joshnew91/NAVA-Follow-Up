import {
  cancelInvitation,
  inviteMember,
  loadSampleData,
  removeMember,
  updateMemberRole,
  updateSettings,
} from '@/app/actions'
import { getSettings } from '@/lib/data'
import { formatDateTime } from '@/lib/format'
import type { HomeContext } from '@/lib/types'
import { ActionForm } from '../action-form'
import { Field, inputClass } from '../field'

export async function SettingsSection({ ctx }: { ctx: HomeContext }) {
  const isAdmin = ctx.role === 'admin'
  const { members, invitations, notifications } = await getSettings(ctx.home.id)

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="home-settings" className="rounded-xl bg-card p-5">
        <h2 id="home-settings" className="font-semibold">
          Funeral home
        </h2>
        {isAdmin ? (
          <ActionForm action={updateSettings} submitLabel="Save settings" className="mt-4">
            <Field label="Name" htmlFor="home-name">
              <input id="home-name" name="name" required maxLength={120} defaultValue={ctx.home.name} className={inputClass} />
            </Field>
            <Field
              label="Reply notification email"
              htmlFor="notify-email"
              hint="New family replies are queued for this address and for every administrator."
            >
              <input
                id="notify-email"
                name="notificationEmail"
                type="email"
                defaultValue={ctx.home.notification_email ?? ''}
                className={inputClass}
              />
            </Field>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input type="checkbox" name="requireApproval" defaultChecked={ctx.home.require_approval} className="size-5 accent-brand" />
              Require administrator approval before messages go out
            </label>
          </ActionForm>
        ) : (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {ctx.home.name} · Approval {ctx.home.require_approval ? 'required' : 'not required'}. Only administrators can change settings.
          </p>
        )}
        <p className="mt-4 rounded-lg bg-notice p-3 text-sm leading-relaxed text-notice-foreground">
          Texting is disabled for every funeral home and is locked off in the database until launch.
        </p>
      </section>

      <section aria-labelledby="team" className="rounded-xl bg-card">
        <h2 id="team" className="px-5 py-4 font-semibold">
          Team
        </h2>
        <ul>
          {members.map((member) => {
            const isSelf = member.user_id === ctx.userId
            return (
              <li key={member.user_id} className="flex flex-col gap-3 border-t px-5 py-4">
                <div>
                  <p className="font-medium">
                    {member.full_name || member.email || 'Team member'}
                    {isSelf ? <span className="text-muted-foreground"> (you)</span> : null}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {member.email} · {member.role === 'admin' ? 'Administrator' : 'Staff'}
                  </p>
                </div>
                {isAdmin && !isSelf && (
                  <div className="flex flex-wrap gap-3">
                    <ActionForm
                      action={updateMemberRole}
                      submitLabel={member.role === 'admin' ? 'Make staff' : 'Make administrator'}
                      variant="outline"
                    >
                      <input type="hidden" name="userId" value={member.user_id} />
                      <input type="hidden" name="role" value={member.role === 'admin' ? 'staff' : 'admin'} />
                    </ActionForm>
                    <ActionForm
                      action={removeMember}
                      submitLabel="Remove"
                      variant="ghost"
                      confirmMessage="Remove this person from the funeral home?"
                    >
                      <input type="hidden" name="userId" value={member.user_id} />
                    </ActionForm>
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        {isAdmin && (
          <div className="border-t p-5">
            <ActionForm action={inviteMember} submitLabel="Invite" resetOnSuccess>
              <div className="grid gap-4 md:grid-cols-[1fr_12rem]">
                <Field label="Employee email" htmlFor="invite-email">
                  <input id="invite-email" name="email" type="email" required className={inputClass} />
                </Field>
                <Field label="Role" htmlFor="invite-role">
                  <select id="invite-role" name="role" defaultValue="staff" className={inputClass}>
                    <option value="staff">Staff</option>
                    <option value="admin">Administrator</option>
                  </select>
                </Field>
              </div>
            </ActionForm>
            {invitations.length > 0 && (
              <ul className="mt-4 flex flex-col gap-3">
                {invitations.map((invite) => (
                  <li key={invite.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-secondary p-3 text-sm">
                    <span>
                      {invite.email} · {invite.role === 'admin' ? 'Administrator' : 'Staff'} · Pending
                    </span>
                    <ActionForm action={cancelInvitation} submitLabel="Cancel" variant="ghost">
                      <input type="hidden" name="id" value={invite.id} />
                    </ActionForm>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {isAdmin && (
        <section aria-labelledby="notifications" className="rounded-xl bg-card">
          <h2 id="notifications" className="px-5 pt-4 font-semibold">
            Reply email notifications
          </h2>
          <p className="px-5 pb-4 pt-1 text-sm leading-relaxed text-muted-foreground">
            Queued for delivery. Email sending is not connected yet, so these stay pending.
          </p>
          {notifications.length === 0 ? (
            <p className="border-t px-5 py-4 text-sm text-muted-foreground">None yet.</p>
          ) : (
            <ul>
              {notifications.map((n) => (
                <li key={n.id} className="flex flex-wrap justify-between gap-2 border-t px-5 py-4 text-sm">
                  <span>
                    {n.families?.contact_name ?? 'Family'} replied → {n.recipient_email}
                  </span>
                  <span className="text-muted-foreground">
                    {n.status} · {formatDateTime(n.created_at, ctx.home.timezone)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {isAdmin && (
        <section aria-labelledby="sample-data" className="rounded-xl bg-card p-5">
          <h2 id="sample-data" className="font-semibold">
            Sample data
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Adds fictional families with reserved 555-01xx numbers for testing.
          </p>
          <ActionForm action={loadSampleData} submitLabel="Load sample families" variant="secondary" className="mt-3" />
        </section>
      )}
    </div>
  )
}
