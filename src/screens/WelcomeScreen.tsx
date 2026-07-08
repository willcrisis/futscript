import { useEffect, useRef, useState } from 'react'
import type { FC } from 'react'
import type { GameState } from '../engine/types'
import { t, useLang } from '../i18n'
import type { TranslationKey } from '../i18n'
import Button from '../ui/Button'
import { CupIcon, FinanceIcon, SquadIcon, TableIcon, TransfersIcon } from '../ui/icons'

const FEATURES: { icon: FC<{ className?: string }>; key: TranslationKey }[] = [
  { icon: SquadIcon, key: 'welcome.featureSquad' },
  { icon: TransfersIcon, key: 'welcome.featureMarket' },
  { icon: FinanceIcon, key: 'welcome.featureFinance' },
  { icon: TableIcon, key: 'welcome.featureClimb' },
  { icon: CupIcon, key: 'welcome.featureCup' },
]

export default function WelcomeScreen({ state, onDismiss }: { state: GameState; onDismiss: (managerName: string) => void }) {
  useLang()
  const dialogRef = useRef<HTMLDivElement>(null)
  const user = state.teams.find(t => t.id === state.userTeamId)!
  const [managerName, setManagerName] = useState(state.manager.name)
  // Escape fires from a listener captured at mount, so it can't close over each
  // keystroke — a ref mirrors the latest value for it to read instead.
  const nameRef = useRef(managerName)
  nameRef.current = managerName

  useEffect(() => {
    // move focus into the takeover (the primary button), mirroring Shell's More-sheet pattern
    dialogRef.current?.querySelector('button')?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onDismiss(nameRef.current) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDismiss])

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={t('welcome.title')}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-y-auto bg-surface px-6 py-10"
    >
      <div className="flex w-full max-w-md flex-col gap-6">
        <div className="font-mono text-3xl font-bold tracking-tight">FUT_</div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('welcome.title')}</h1>
          <p className="mt-2 text-ink-muted">
            {t('welcome.yourClub', { club: user.name, division: user.division })}
          </p>
        </div>
        <ul className="flex flex-col gap-3 border-t border-rule pt-5">
          {FEATURES.map(({ icon: FeatureIcon, key }) => (
            <li key={key} className="flex items-start gap-3 text-sm">
              <span className="mt-0.5 text-accent-strong"><FeatureIcon /></span>
              <span>{t(key)}</span>
            </li>
          ))}
        </ul>
        <label className="flex flex-col gap-1 border-t border-rule pt-5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{t('welcome.managerName')}</span>
          <input
            type="text"
            value={managerName}
            onChange={e => setManagerName(e.target.value)}
            maxLength={40}
            className="rounded-md border border-rule bg-surface-raised px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </label>
        <Button variant="primary" className="w-full" onClick={() => onDismiss(managerName)}>
          {t('welcome.start')}
        </Button>
      </div>
    </div>
  )
}
