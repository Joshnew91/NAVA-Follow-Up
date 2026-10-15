import Link from 'next/link'
import { AuthShell } from '@/components/auth/auth-shell'

export default function SignUpSuccessPage() {
  return (
    <AuthShell title="Check your email">
      <div className="flex flex-col gap-4 leading-relaxed">
        <p>We sent you a confirmation link. Open it to activate your account, then sign in.</p>
        <p className="text-sm text-muted-foreground">
          If an administrator invited you, you will be added to their funeral home automatically once your email is
          confirmed.
        </p>
        <Link href="/auth/login" className="text-sm underline underline-offset-4">
          Back to sign in
        </Link>
      </div>
    </AuthShell>
  )
}
