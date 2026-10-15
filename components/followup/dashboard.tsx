import type { HomeContext, Section } from '@/lib/types'
import { AppHeader } from './app-header'
import { SectionNav } from './section-nav'
import { FamiliesSection } from './sections/families'
import { InboxSection } from './sections/inbox'
import { OverviewSection } from './sections/overview'
import { ReportsSection } from './sections/reports'
import { ScheduleSection } from './sections/schedule'
import { SettingsSection } from './sections/settings'
import { TemplatesSection } from './sections/templates'

const TITLES: Record<Section, string> = {
  Overview: 'Overview',
  Inbox: 'Family Messages',
  Families: 'Families',
  Schedule: 'Scheduled Messages',
  Templates: 'Follow-Up Templates',
  Reports: 'Reports',
  Settings: 'Settings',
}

type DashboardProps = {
  ctx: HomeContext
  section: Section
  familyId?: string
}

export function Dashboard({ ctx, section, familyId }: DashboardProps) {
  return (
    <>
      <AppHeader ctx={ctx} />
      <div className="mx-auto flex max-w-[1350px] flex-col md:flex-row">
        <SectionNav active={section} />
        <main className="min-w-0 flex-1 px-5 py-6 md:px-6">
          <p className="text-xs tracking-wider text-muted-foreground">
            {ctx.home.name.toUpperCase()} / {section.toUpperCase()}
          </p>
          <h1 className="mt-4 font-serif text-4xl text-balance">{TITLES[section]}</h1>
          <p className="mt-3 text-muted-foreground">A thoughtful way to stay connected with the families you serve.</p>

          <div className="mt-7">
            {section === 'Overview' && <OverviewSection ctx={ctx} />}
            {section === 'Inbox' && <InboxSection ctx={ctx} familyId={familyId} />}
            {section === 'Families' && <FamiliesSection ctx={ctx} />}
            {section === 'Schedule' && <ScheduleSection ctx={ctx} />}
            {section === 'Templates' && <TemplatesSection ctx={ctx} />}
            {section === 'Reports' && <ReportsSection ctx={ctx} />}
            {section === 'Settings' && <SettingsSection ctx={ctx} />}
          </div>

          <p className="mt-7 text-xs leading-relaxed text-muted-foreground">
            TEXTING DISABLED · Outgoing messages are simulated and never leave this app.
          </p>
        </main>
      </div>
    </>
  )
}
