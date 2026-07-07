import type { ReactNode } from 'react'

const TONES = {
  danger: 'text-danger',
  warn: 'text-warn',
  accent: 'text-accent-strong',
  muted: 'text-ink-faint',
}

export default function Badge({ tone, children }: { tone: keyof typeof TONES; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${TONES[tone]}`}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  )
}
