import type { ReactNode } from 'react'
import SectionLabel from './SectionLabel'

interface Props {
  label: string
  value: ReactNode
  delta?: number
  hint?: string
}

export default function StatChip({ label, value, delta, hint }: Props) {
  return (
    <div className="rounded-lg border border-rule bg-surface-raised px-4 py-3">
      <SectionLabel>{label}</SectionLabel>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-mono text-xl font-semibold tabular-nums">{value}</span>
        {delta !== undefined && delta !== 0 && (
          <span className={`font-mono text-xs tabular-nums ${delta > 0 ? 'text-accent-strong' : 'text-danger'}`}>
            {delta > 0 ? '+' : ''}{delta.toLocaleString('en-US')}
          </span>
        )}
      </div>
      {hint && <div className="mt-0.5 text-xs text-ink-faint">{hint}</div>}
    </div>
  )
}
