import type { ReactNode } from 'react'

type AuthShellProps = {
  title: string
  description?: string
  children: ReactNode
}

export function AuthShell({ title, description, children }: AuthShellProps) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="bg-brand text-brand-foreground">
        <div className="mx-auto max-w-[1350px] px-5 py-6 md:px-8">
          <p className="text-2xl tracking-[0.25em]">NAVA MEMORIAL</p>
          <p className="text-xs tracking-[0.2em] opacity-80">FAMILY FOLLOW-UP</p>
        </div>
      </header>
      <main className="flex flex-1 justify-center px-5 py-10">
        <div className="flex w-full max-w-md flex-col gap-6">
          <div>
            <h1 className="font-serif text-4xl text-balance">{title}</h1>
            {description && <p className="mt-3 leading-relaxed text-muted-foreground text-pretty">{description}</p>}
          </div>
          <div className="rounded-xl bg-card p-6">{children}</div>
        </div>
      </main>
    </div>
  )
}
