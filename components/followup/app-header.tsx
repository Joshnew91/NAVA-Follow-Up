import { signOut } from '@/app/actions'
import type { HomeContext } from '@/lib/types'
import { HomeSwitcher } from './home-switcher'

export function AppHeader({ ctx }: { ctx: HomeContext }) {
  return (
    <header className="bg-brand text-brand-foreground">
      <div className="mx-auto flex max-w-[1350px] flex-wrap items-center justify-between gap-4 px-5 py-6 md:px-8">
        <div>
          <p className="text-2xl tracking-[0.25em]">NAVA MEMORIAL</p>
          <p className="text-xs tracking-[0.2em] opacity-80">FAMILY FOLLOW-UP</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {ctx.homes.length > 1 ? (
            <HomeSwitcher homes={ctx.homes} currentId={ctx.home.id} />
          ) : (
            <span>{ctx.home.name}</span>
          )}
          <span className="rounded-full border border-brand-foreground/30 px-2 py-0.5 text-xs tracking-wider">
            {ctx.role === 'admin' ? 'ADMIN' : 'STAFF'}
          </span>
          <span className="rounded-full border border-brand-foreground/30 px-2 py-0.5 text-xs tracking-wider">
            TEXTING OFF
          </span>
          <form action={signOut}>
            <button
              type="submit"
              className="min-h-11 rounded-md px-3 text-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-brand-foreground"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  )
}
