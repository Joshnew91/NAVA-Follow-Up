'use client'

import { switchHome } from '@/app/actions'
import type { HomeContext } from '@/lib/types'

type HomeSwitcherProps = {
  homes: HomeContext['homes']
  currentId: string
}

export function HomeSwitcher({ homes, currentId }: HomeSwitcherProps) {
  return (
    <form action={switchHome}>
      <label htmlFor="home-switcher" className="sr-only">
        Funeral home
      </label>
      <select
        id="home-switcher"
        name="homeId"
        defaultValue={currentId}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="min-h-11 rounded-md border border-brand-foreground/30 bg-brand px-3 text-base text-brand-foreground"
      >
        {homes.map((home) => (
          <option key={home.id} value={home.id}>
            {home.name}
          </option>
        ))}
      </select>
    </form>
  )
}
