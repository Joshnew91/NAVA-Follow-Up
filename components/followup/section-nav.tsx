import Link from 'next/link'
import { cn } from '@/lib/utils'
import { SECTIONS, type Section } from '@/lib/types'

export function SectionNav({ active }: { active: Section }) {
  return (
    <nav aria-label="Dashboard sections" className="md:w-48 md:shrink-0">
      <ul className="flex gap-1 overflow-x-auto px-4 py-3 md:flex-col md:px-4 md:py-5">
        {SECTIONS.map((section) => {
          const isActive = section === active
          return (
            <li key={section}>
              <Link
                href={`/?section=${section}`}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'block w-full whitespace-nowrap rounded-lg px-4 py-3 text-left text-sm text-brand transition-colors hover:bg-accent/60 focus-visible:outline-2 focus-visible:outline-ring',
                  isActive && 'bg-accent font-medium hover:bg-accent',
                )}
              >
                {section}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
