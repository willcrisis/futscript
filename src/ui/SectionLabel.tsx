import type { ReactNode } from 'react'

export default function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{children}</div>
  )
}
