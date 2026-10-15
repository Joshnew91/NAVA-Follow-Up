'use client'

import { useState, useTransition, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ActionResult } from '@/lib/types'

type ActionFormProps = {
  action: (formData: FormData) => Promise<ActionResult>
  children?: ReactNode
  submitLabel: string
  pendingLabel?: string
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive'
  className?: string
  footerClassName?: string
  resetOnSuccess?: boolean
  confirmMessage?: string
}

export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel = 'Saving...',
  variant = 'default',
  className,
  footerClassName,
  resetOnSuccess = false,
  confirmMessage,
}: ActionFormProps) {
  const [result, setResult] = useState<ActionResult>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (confirmMessage && !window.confirm(confirmMessage)) return
    const form = event.currentTarget
    const formData = new FormData(form)
    startTransition(async () => {
      const next = await action(formData)
      setResult(next)
      if (next?.ok && resetOnSuccess) form.reset()
    })
  }

  return (
    <form onSubmit={handleSubmit} className={cn('flex flex-col gap-4', className)}>
      {children}
      <div className={cn('flex flex-wrap items-center gap-3', footerClassName)}>
        <Button type="submit" variant={variant} disabled={isPending} className="h-11 px-5">
          {isPending ? pendingLabel : submitLabel}
        </Button>
        <p
          role="status"
          className={cn('text-sm leading-relaxed', result?.ok ? 'text-muted-foreground' : 'text-destructive')}
        >
          {result?.message}
        </p>
      </div>
    </form>
  )
}
