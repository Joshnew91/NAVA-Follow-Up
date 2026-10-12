export function AppHeader() {
  return (
    <header className="bg-brand text-brand-foreground">
      <div className="mx-auto flex max-w-[1350px] flex-wrap items-center justify-between gap-3 px-5 py-6 md:px-8">
        <div>
          <p className="text-2xl tracking-[0.25em]">NAVA MEMORIAL</p>
          <p className="text-xs tracking-[0.2em] opacity-80">FAMILY FOLLOW-UP</p>
        </div>
        <p className="text-sm">
          Southern Oaks Funeral Home
          <span className="ml-2 rounded-full border border-brand-foreground/30 px-2 py-0.5 text-xs tracking-wider">
            DEMO
          </span>
        </p>
      </div>
    </header>
  )
}
