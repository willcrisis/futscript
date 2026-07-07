import type { ReactNode } from 'react'
import SectionLabel from './SectionLabel'

interface Props {
  label?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}

export default function Panel({ label, action, children, className = '' }: Props) {
  return (
    <section className={`rounded-lg border border-rule bg-surface-raised p-4 ${className}`}>
      {(label || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {label ? <SectionLabel>{label}</SectionLabel> : <span />}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}
