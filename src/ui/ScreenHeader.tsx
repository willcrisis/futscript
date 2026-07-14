import type { ReactNode } from 'react'
import SectionLabel from './SectionLabel'
import { BackIcon } from './icons'
import { t } from '../i18n'

export default function ScreenHeader({
  label, title, actions, onBack,
}: { label: string; title: string; actions?: ReactNode; onBack?: () => void }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-center gap-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label={t('common.back')}
            className="rounded-md p-1.5 text-ink-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <BackIcon />
          </button>
        )}
        <div>
          <SectionLabel>{label}</SectionLabel>
          <h1 className="mt-0.5 text-xl font-semibold tracking-tight">{title}</h1>
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
