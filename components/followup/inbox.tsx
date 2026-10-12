'use client'

import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { FUNERAL_HOME_SENDER, type Family } from '@/lib/sample-data'

type InboxProps = {
  families: Family[]
  onDemoSend: () => void
}

export function Inbox({ families, onDemoSend }: InboxProps) {
  const [selectedIndex, setSelectedIndex] = useState(1)
  const [draft, setDraft] = useState('')
  const family = families[selectedIndex]

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onDemoSend()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault()
  }

  return (
    <div className="mt-7 flex flex-wrap gap-5">
      <section aria-labelledby="conversations-heading" className="flex-[1_1_250px] overflow-hidden rounded-xl bg-card">
        <h2 id="conversations-heading" className="px-5 py-4 font-semibold">
          Conversations
        </h2>
        <ul>
          {families.map((f, i) => (
            <li key={f.name}>
              <button
                type="button"
                onClick={() => setSelectedIndex(i)}
                aria-pressed={selectedIndex === i}
                className={cn(
                  'block w-full border-t px-5 py-5 text-left transition-colors hover:bg-secondary',
                  selectedIndex === i && 'bg-secondary',
                )}
              >
                <span className="block font-semibold">{f.name}</span>
                <span className="mt-1.5 block text-xs text-muted-foreground">{f.status}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-label={`Conversation with ${family.name}`}
        className="flex min-h-[440px] flex-[2_1_350px] flex-col rounded-xl bg-card"
      >
        <div className="border-b px-5 py-5">
          <p className="font-semibold">{family.name}</p>
          <p className="text-xs text-muted-foreground">Private family conversation · Sample data</p>
        </div>

        <ol className="flex flex-1 flex-col gap-3.5 p-5">
          {family.messages.map((message, i) => {
            const fromHome = message.sender === FUNERAL_HOME_SENDER
            return (
              <li
                key={i}
                className={cn(
                  'max-w-[78%] rounded-xl p-4',
                  fromHome ? 'ml-auto bg-accent' : 'bg-muted',
                )}
              >
                <p className="text-xs text-muted-foreground">{message.sender}</p>
                <p className="mt-1.5 leading-relaxed">{message.body}</p>
              </li>
            )
          })}
        </ol>

        <form onSubmit={handleSubmit} className="flex gap-2 border-t p-4">
          <label htmlFor="reply" className="sr-only">
            Reply to {family.name}
          </label>
          <input
            id="reply"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Write a reply..."
            className="min-w-20 flex-1 rounded-md border bg-background px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button type="submit" size="lg" className="h-auto px-5">
            Send
          </Button>
        </form>
      </section>
    </div>
  )
}
