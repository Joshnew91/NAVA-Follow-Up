import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'

export const metadata: Metadata = {
  title: 'Backend not connected',
}

export default function SetupPage() {
  return (
    <AuthShell title="Backend not connected">
      <div className="flex flex-col gap-4 leading-relaxed">
        <p>
          This app stores families, messages and accounts in Supabase, but no Supabase project is connected to this
          environment yet.
        </p>
        <p className="text-sm text-muted-foreground">
          Connect Supabase from the project settings to sign in and use the app. Once the connection is added, this page
          will send you to the app automatically.
        </p>
      </div>
    </AuthShell>
  )
}
