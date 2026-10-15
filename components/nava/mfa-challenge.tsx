'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition, type FormEvent } from 'react'
import useSWR from 'swr'
import { inputClass } from '@/components/followup/field'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

type Factor = { mode: 'verify'; factorId: string } | { mode: 'enroll'; factorId: string; qr: string; secret: string }

async function loadFactor(): Promise<Factor> {
  const supabase = createClient()
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error) throw error
  const verified = data.totp.find((f) => f.status === 'verified')
  if (verified) return { mode: 'verify', factorId: verified.id }

  const { data: all } = await supabase.auth.mfa.listFactors()
  for (const f of all?.all ?? []) {
    if (f.factor_type === 'totp' && f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id })
  }
  const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `NAVA admin ${new Date().toISOString().slice(0, 10)}`,
  })
  if (enrollError) throw enrollError
  return { mode: 'enroll', factorId: enrolled.id, qr: enrolled.totp.qr_code, secret: enrolled.totp.secret }
}

export function MfaChallenge() {
  const router = useRouter()
  const { data: factor, error: loadError } = useSWR('nava-mfa-factor', loadFactor, { revalidateOnFocus: false })
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!factor) return
    const code = String(new FormData(event.currentTarget).get('code') ?? '').replace(/\s/g, '')
    if (!/^\d{6}$/.test(code)) {
      setMessage('Enter the 6-digit code.')
      return
    }
    startTransition(async () => {
      const { error } = await createClient().auth.mfa.challengeAndVerify({ factorId: factor.factorId, code })
      if (error) {
        setMessage('That code did not work. Wait for a new code and try again.')
        return
      }
      router.replace('/nava')
      router.refresh()
    })
  }

  if (loadError) return <p className="text-sm text-destructive">Could not start verification. Sign out and sign in again.</p>
  if (!factor) return <p className="text-sm text-muted-foreground">Preparing...</p>

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {factor.mode === 'enroll' && (
        <div className="flex flex-col gap-3">
          <p className="text-sm leading-relaxed">First-time setup: scan this code with your authenticator app.</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL SVG from Supabase */}
          <img src={factor.qr} alt="QR code for your authenticator app" className="size-48 self-center rounded-lg bg-background p-2" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            {"Can't scan? Enter this key manually: "}
            <span className="font-mono break-all text-foreground">{factor.secret}</span>
          </p>
        </div>
      )}
      <label htmlFor="mfa-code" className="text-sm font-medium">
        6-digit code
      </label>
      <input
        id="mfa-code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={7}
        required
        autoFocus
        className={`${inputClass} text-center font-mono text-xl tracking-widest`}
      />
      <Button type="submit" disabled={isPending} className="h-11">
        {isPending ? 'Verifying...' : 'Verify'}
      </Button>
      <p role="status" className="text-sm text-destructive">
        {message}
      </p>
    </form>
  )
}
