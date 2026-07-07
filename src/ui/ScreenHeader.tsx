import type { ReactNode } from 'react'
import SectionLabel from './SectionLabel'

export default function ScreenHeader({ label, title, actions }: { label: string; title: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <SectionLabel>{label}</SectionLabel>
        <h1 className="mt-0.5 text-xl font-semibold tracking-tight">{title}</h1>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
