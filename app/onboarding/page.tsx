import { redirect } from 'next/navigation'
import { createFuneralHome, signOut } from '@/app/actions'
import { AuthShell } from '@/components/auth/auth-shell'
import { ActionForm } from '@/components/followup/action-form'
import { Field, inputClass } from '@/components/followup/field'
import { getMemberships, getUser } from '@/lib/session'

export default async function OnboardingPage() {
  const user = await getUser()
  if (!user) redirect('/auth/login')
  if ((await getMemberships()).length > 0) redirect('/')

  return (
    <AuthShell
      title="Set up your funeral home"
      description="You'll be its first administrator. If a colleague already invited you, ask them to resend the invitation to this email."
    >
      <ActionForm action={createFuneralHome} submitLabel="Create funeral home" pendingLabel="Creating...">
        <Field label="Funeral home name" htmlFor="name">
          <input id="name" name="name" required maxLength={120} className={inputClass} />
        </Field>
        <Field label="Reply notification email (optional)" htmlFor="notificationEmail">
          <input
            id="notificationEmail"
            name="notificationEmail"
            type="email"
            defaultValue={user.email ?? ''}
            className={inputClass}
          />
        </Field>
      </ActionForm>
      <form action={signOut} className="mt-4">
        <button type="submit" className="min-h-11 text-sm text-muted-foreground underline underline-offset-4">
          Sign out
        </button>
      </form>
    </AuthShell>
  )
}
