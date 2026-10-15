import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { MfaChallenge } from '@/components/nava/mfa-challenge'
import { checkNavaAdmin } from '@/lib/nava-session'

export const metadata: Metadata = { title: 'Verify your identity · NAVA Admin', robots: { index: false } }

export default async function NavaMfaPage() {
  const status = await checkNavaAdmin()
  if (status.ok) redirect('/nava')
  if (status.reason === 'signed_out') redirect('/auth/login?next=/nava')
  if (status.reason === 'not_admin') redirect('/')

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <p className="text-xs tracking-wider text-muted-foreground">NAVA ADMINISTRATION</p>
      <h1 className="mt-3 font-serif text-3xl text-balance">Two-step verification</h1>
      <p className="mt-3 leading-relaxed text-muted-foreground">
        Administrator access requires a code from an authenticator app such as Google Authenticator, 1Password or Authy.
      </p>
      <div className="mt-6 rounded-xl bg-card p-5">
        <MfaChallenge />
      </div>
    </main>
  )
}
