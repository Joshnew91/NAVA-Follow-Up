import Link from 'next/link'
import { AuthShell } from '@/components/auth/auth-shell'

export default function AuthErrorPage() {
  return (
    <AuthShell title="That link did not work">
      <div className="flex flex-col gap-4 leading-relaxed">
        <p>The sign-in link may have expired or already been used. Please try signing in again.</p>
        <Link href="/auth/login" className="text-sm underline underline-offset-4">
          Back to sign in
        </Link>
      </div>
    </AuthShell>
  )
}
