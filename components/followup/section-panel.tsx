import {
  FOLLOW_UP_TEMPLATES,
  SETTINGS,
  type Family,
  type Section,
} from '@/lib/sample-data'

type SectionPanelProps = {
  section: Exclude<Section, 'Inbox'>
  families: Family[]
}

export function SectionPanel({ section, families }: SectionPanelProps) {
  return <section className="mt-7 rounded-xl bg-card p-6 md:p-7">{renderContent(section, families)}</section>
}

function renderContent(section: SectionPanelProps['section'], families: Family[]) {
  switch (section) {
    case 'Templates':
      return (
        <>
          <h2 className="font-serif text-2xl">Five follow-up messages</h2>
          <ol className="mt-4 divide-y">
            {FOLLOW_UP_TEMPLATES.map((t) => (
              <li key={t.timing} className="flex gap-3 py-3">
                <span className="w-20 shrink-0 text-sm text-muted-foreground">{t.timing}</span>
                <span>{t.title}</span>
              </li>
            ))}
          </ol>
        </>
      )
    case 'Families':
      return (
        <ul className="divide-y">
          {families.map((f) => (
            <li key={f.name} className="flex justify-between gap-3 py-3">
              <span>{f.name}</span>
              <span className="text-sm text-muted-foreground">{f.status}</span>
            </li>
          ))}
        </ul>
      )
    case 'Settings':
      return (
        <dl className="divide-y">
          {SETTINGS.map((s) => (
            <div key={s.label} className="flex flex-wrap justify-between gap-2 py-3">
              <dt>{s.label}</dt>
              <dd className="text-sm text-muted-foreground">{s.value}</dd>
            </div>
          ))}
        </dl>
      )
    default:
      return <p className="text-muted-foreground">This section is ready for database and messaging integration.</p>
  }
}
