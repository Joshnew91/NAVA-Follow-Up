'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { AuthShell } from '@/components/auth/auth-shell'
import { Field, inputClass } from '@/components/followup/field'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

function signUpErrorMessage(error: unknown) {
  const { code, status } = (error ?? {}) as { code?: string; status?: number }
  if (code === 'weak_password') return 'Please choose a stronger password (at least 8 characters).'
  if (code === 'email_address_invalid') return 'Please enter a valid email address you can receive mail at.'
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || status === 429)
    return 'Too many attempts. Please wait a few minutes and try again.'
  if (code === 'email_address_not_authorized') return 'Confirmation emails cannot be sent to this address yet.'
  return 'Something went wrong. Please try again.'
}

export default function SignUpPage() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (password.length < 8) return setError('Use at least 8 characters for your password.')
    if (password !== confirm) return setError('Passwords do not match.')
    setIsLoading(true)
    const { error } = await createClient().auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ?? `${window.location.origin}/auth/callback`,
        data: { full_name: fullName.trim() },
      },
    })
    if (error) {
      setError(signUpErrorMessage(error))
      setIsLoading(false)
      return
    }
    router.push('/auth/sign-up-success')
  }

  return (
    <AuthShell
      title="Create your account"
      description="Joining an existing funeral home? Sign up with the exact email address your administrator invited."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <Field label="Full name" htmlFor="full-name">
          <input
            id="full-name"
            autoComplete="name"
            required
            maxLength={120}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Work email" htmlFor="email">
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
        <Field label="Password" htmlFor="password" hint="At least 8 characters.">
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Confirm password" htmlFor="confirm">
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={inputClass}
          />
        </Field>
        <div aria-live="polite">{error && <p className="text-sm text-destructive">{error}</p>}</div>
        <Button type="submit" disabled={isLoading} className="h-11">
          {isLoading ? 'Creating account...' : 'Create account'}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/auth/login" className="text-foreground underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  )
}
