'use client'

import { useState, useTransition } from 'react'
import { buyNumber, searchNumbers } from '@/app/nava/actions'
import { inputClass } from '@/components/followup/field'
import { Button } from '@/components/ui/button'

export function NumberPicker({ homeId, defaultArea, purchasingEnabled }: { homeId: string; defaultArea: string; purchasingEnabled: boolean }) {
  const [area, setArea] = useState(defaultArea)
  const [numbers, setNumbers] = useState<string[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function search() {
    const fd = new FormData()
    fd.set('area', area)
    startTransition(async () => {
      const r = await searchNumbers(fd)
      setMessage(r?.message ?? null)
      setNumbers(r?.numbers ?? [])
    })
  }

  function buy(phone: string) {
    if (!window.confirm(`Buy ${phone}? Twilio will bill your account for this number.`)) return
    const fd = new FormData()
    fd.set('home', homeId)
    fd.set('phone', phone)
    startTransition(async () => {
      const r = await buyNumber(fd)
      setMessage(r?.message ?? null)
      if (r?.ok) setNumbers([])
    })
  }

  return (
    <div className="mt-3 flex flex-col gap-3">
      <div className="flex gap-2">
        <label htmlFor={`area-${homeId}`} className="sr-only">
          Area code
        </label>
        <input
          id={`area-${homeId}`}
          value={area}
          onChange={(e) => setArea(e.target.value.replace(/\D/g, '').slice(0, 3))}
          inputMode="numeric"
          placeholder="Area code"
          className={`${inputClass} w-32`}
        />
        <Button type="button" variant="outline" onClick={search} disabled={isPending} className="h-11">
          Find numbers
        </Button>
      </div>
      {numbers.length > 0 && (
        <ul className="flex flex-col gap-2">
          {numbers.map((n) => (
            <li key={n} className="flex items-center justify-between gap-3 rounded-lg bg-muted px-3 py-2">
              <span className="font-mono tabular-nums">{n}</span>
              <Button type="button" size="sm" onClick={() => buy(n)} disabled={isPending || !purchasingEnabled} className="h-11">
                Buy
              </Button>
            </li>
          ))}
        </ul>
      )}
      {!purchasingEnabled && numbers.length > 0 && (
        <p className="text-xs text-muted-foreground">Turn on &quot;Allow buying Twilio numbers&quot; above to purchase.</p>
      )}
      <p role="status" className="text-sm text-muted-foreground">
        {message}
      </p>
    </div>
  )
}
