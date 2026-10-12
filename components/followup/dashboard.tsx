'use client'

import { useState } from 'react'
import { AppHeader } from './app-header'
import { SectionNav } from './section-nav'
import { Inbox } from './inbox'
import { SectionPanel } from './section-panel'
import { SAMPLE_FAMILIES, type Section } from '@/lib/sample-data'

export function Dashboard() {
  const [section, setSection] = useState<Section>('Inbox')
  const [notice, setNotice] = useState('')

  function selectSection(next: Section) {
    setSection(next)
    setNotice('')
  }

  return (
    <>
      <AppHeader />
      <div className="mx-auto flex max-w-[1350px] flex-col md:flex-row">
        <SectionNav active={section} onSelect={selectSection} />
        <main className="min-w-0 flex-1 px-5 py-6 md:px-6">
          <p className="text-xs tracking-wider text-muted-foreground">
            NAVA MEMORIAL / {section.toUpperCase()}
          </p>
          <h1 className="mt-4 font-serif text-4xl text-balance">
            {section === 'Inbox' ? 'Family Messages' : section}
          </h1>
          <p className="mt-3 text-muted-foreground">
            A thoughtful way to stay connected with the families you serve.
          </p>

          {section === 'Inbox' ? (
            <Inbox families={SAMPLE_FAMILIES} onDemoSend={() => setNotice('Demo only. No message was sent.')} />
          ) : (
            <SectionPanel section={section} families={SAMPLE_FAMILIES} />
          )}

          <div aria-live="polite">
            {notice && <p className="mt-4 rounded-lg bg-notice p-4 text-notice-foreground">{notice}</p>}
          </div>

          <p className="mt-7 text-xs text-muted-foreground">
            PROTOTYPE ONLY · Sample families · No real texts or emails are sent.
          </p>
        </main>
      </div>
    </>
  )
}
