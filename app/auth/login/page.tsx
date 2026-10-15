'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { AuthShell } from '@/components/auth/auth-shell'
import { Field, inputClass } from '@/components/followup/field'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

// Only the credential/existence signal is genericized; actionable errors are passed through.
function loginErrorMessage(error: unknown) {
  const { code, status } = (error ?? {}) as { code?: string; status?: number }
  if (code === 'email_not_confirmed') return 'Please confirm your email address. Check your inbox for the link.'
  if (code === 'over_request_rate_limit' || status === 429) return 'Too many attempts. Please wait a moment and try again.'
  if (code === 'invalid_credentials') return 'Invalid email or password.'
  return 'Something went wrong. Please try again.'
}

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setIsLoading(true)
    setError(null)
    const { error } = await createClient().auth.signInWithPassword({ email, password })
    if (error) {
      setError(loginErrorMessage(error))
      setIsLoading(false)
      return
    }
    const next = new URLSearchParams(window.location.search).get('next')
    router.push(next && next.startsWith('/') && !next.startsWith('//') ? next : '/')
    router.refresh()
  }

  return (
    <AuthShell title="Sign in" description="Access your funeral home's private family follow-up dashboard.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <Field label="Email" htmlFor="email">
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Password" htmlFor="password">
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </Field>
        <div aria-live="polite">{error && <p className="text-sm text-destructive">{error}</p>}</div>
        <Button type="submit" disabled={isLoading} className="h-11">
          {isLoading ? 'Signing in...' : 'Sign in'}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          New here?{' '}
          <Link href="/auth/sign-up" className="text-foreground underline underline-offset-4">
            Create an account
          </Link>
        </p>
      </form>
    </AuthShell>
  )
}
