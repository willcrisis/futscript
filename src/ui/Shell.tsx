import { useEffect, useRef, useState } from 'react'
import type { FC, ReactNode } from 'react'
import type { GameState } from '../engine/types'
import { totalRounds } from '../engine/season'
import { t, useLang } from '../i18n'
import type { TranslationKey } from '../i18n'
import Button from './Button'
import MoneyText from './MoneyText'
import NewsRail from './NewsRail'
import SectionLabel from './SectionLabel'
import ThemeToggle from './ThemeToggle'
import {
  CupIcon, FinanceIcon, FixturesIcon, HistoryIcon, HomeIcon, MoreIcon,
  SavesIcon, SquadIcon, StatsIcon, TableIcon, TransfersIcon,
} from './icons'

export type ScreenId =
  | 'home' | 'squad' | 'table' | 'fixtures' | 'cup'
  | 'stats' | 'transfers' | 'finance' | 'history' | 'saves'

export const NAV: { id: ScreenId; labelKey: TranslationKey; icon: FC<{ className?: string }> }[] = [
  { id: 'home', labelKey: 'nav.home', icon: HomeIcon },
  { id: 'squad', labelKey: 'nav.squad', icon: SquadIcon },
  { id: 'table', labelKey: 'nav.table', icon: TableIcon },
  { id: 'fixtures', labelKey: 'nav.fixtures', icon: FixturesIcon },
  { id: 'cup', labelKey: 'nav.cup', icon: CupIcon },
  { id: 'stats', labelKey: 'nav.stats', icon: StatsIcon },
  { id: 'transfers', labelKey: 'nav.transfers', icon: TransfersIcon },
  { id: 'finance', labelKey: 'nav.finance', icon: FinanceIcon },
  { id: 'history', labelKey: 'nav.history', icon: HistoryIcon },
  { id: 'saves', labelKey: 'nav.saves', icon: SavesIcon },
]

const MOBILE_PRIMARY: ScreenId[] = ['home', 'squad', 'table', 'finance']

interface Props {
  screen: ScreenId
  onNavigate: (s: ScreenId) => void
  state: GameState
  advanceLabel: string
  onAdvance: () => void
  children: ReactNode
}

function attentionFor(id: ScreenId, state: GameState): boolean {
  if (id === 'transfers') return state.incomingOffers.length > 0
  if (id === 'finance') return state.brokeRounds > 0
  return false
}

export default function Shell({ screen, onNavigate, state, advanceLabel, onAdvance, children }: Props) {
  useLang() // subscribes Shell to language changes; re-renders nav/labels below
  const [moreOpen, setMoreOpen] = useState(false)
  const moreButtonRef = useRef<HTMLButtonElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const user = state.teams.find(t => t.id === state.userTeamId)!
  const week = Math.min(state.round, totalRounds(state))

  const closeMore = () => {
    setMoreOpen(false)
    moreButtonRef.current?.focus()
  }

  useEffect(() => {
    if (!moreOpen) return
    const focusables = Array.from(sheetRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
    focusables[0]?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeMore()
        return
      }
      if (e.key !== 'Tab' || focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [moreOpen])

  const navigate = (id: ScreenId) => {
    setMoreOpen(false)
    onNavigate(id)
  }

  return (
    <div className="min-h-dvh md:flex">
      {/* desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-52 flex-col border-r border-rule bg-surface-raised p-3 md:flex">
        <div className="px-2 py-1 font-mono text-sm font-bold tracking-tight">FUT_</div>
        <nav className="mt-4 flex flex-1 flex-col gap-0.5" aria-label={t('nav.sections')}>
          {NAV.map(({ id, labelKey, icon: NavIcon }) => (
            <button
              key={id}
              onClick={() => navigate(id)}
              aria-current={screen === id ? 'page' : undefined}
              className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm focus-visible:ring-2 focus-visible:ring-accent ${
                screen === id ? 'bg-rule/60 font-medium text-ink' : 'text-ink-muted hover:text-ink'
              }`}
            >
              <NavIcon />
              {t(labelKey)}
              {attentionFor(id, state) && <span aria-label={t('nav.needsAttention')} className="ml-auto size-1.5 rounded-full bg-accent" />}
            </button>
          ))}
        </nav>
        <div className="mt-4 border-t border-rule pt-3 text-sm">
          <div className="flex items-center justify-between gap-2 px-2">
            <div className="min-w-0">
              <div className="truncate font-medium">{user.name}</div>
              <div className="font-mono text-xs tabular-nums text-ink-muted">
                <MoneyText amount={user.cash} size="sm" /> · {t('shell.seasonWeek', { season: state.season, week })}
              </div>
            </div>
            <ThemeToggle />
          </div>
          <Button variant="primary" className="mt-3 w-full" onClick={onAdvance}>
            {advanceLabel}
          </Button>
        </div>
      </aside>

      {/* content */}
      <main className="mx-auto w-full max-w-4xl px-4 pb-28 pt-6 md:ml-52 md:pb-10 xl:mr-72">
        {/* mobile vitals line */}
        <div className="mb-4 flex items-center justify-between text-xs text-ink-muted md:hidden">
          <span className="font-medium text-ink">{user.name}</span>
          <span className="font-mono tabular-nums">
            <MoneyText amount={user.cash} size="sm" /> · {t('shell.seasonWeek', { season: state.season, week })}
          </span>
        </div>
        {children}
      </main>

      {/* news rail — wide screens only */}
      <aside
        aria-label={t('news.title')}
        className="fixed inset-y-0 right-0 hidden w-72 flex-col overflow-y-auto border-l border-rule bg-surface-raised p-4 xl:flex"
      >
        <SectionLabel>{t('news.title')}</SectionLabel>
        <div className="mt-2">
          <NewsRail state={state} />
        </div>
      </aside>

      {/* mobile: floating advance + bottom bar */}
      <div className="fixed bottom-16 right-4 z-40 mb-[env(safe-area-inset-bottom)] md:hidden">
        <Button variant="primary" onClick={onAdvance}>{advanceLabel}</Button>
      </div>
      <nav aria-label={t('nav.sections')} className="fixed inset-x-0 bottom-0 z-40 flex border-t border-rule bg-surface-raised pb-[env(safe-area-inset-bottom)] md:hidden">
        {MOBILE_PRIMARY.map(id => {
          const item = NAV.find(n => n.id === id)!
          const NavIcon = item.icon
          return (
            <button
              key={id}
              onClick={() => navigate(id)}
              aria-current={screen === id ? 'page' : undefined}
              className={`relative flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                screen === id ? 'text-ink' : 'text-ink-muted'
              }`}
            >
              <NavIcon />
              {t(item.labelKey)}
              {attentionFor(id, state) && <span className="absolute right-1/4 top-1.5 size-1.5 rounded-full bg-accent" />}
            </button>
          )
        })}
        <button
          ref={moreButtonRef}
          onClick={() => setMoreOpen(true)}
          aria-expanded={moreOpen}
          className={`flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
            MOBILE_PRIMARY.includes(screen) ? 'text-ink-muted' : 'text-ink'
          }`}
        >
          <MoreIcon />
          {t('nav.more')}
        </button>
      </nav>

      {/* mobile more-sheet */}
      {moreOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label={t('nav.moreSections')}>
          <div className="absolute inset-0 bg-ink/30" onClick={closeMore} />
          <div ref={sheetRef} className="absolute inset-x-0 bottom-0 rounded-t-xl border-t border-rule bg-surface p-4">
            <div className="grid grid-cols-3 gap-2">
              {NAV.filter(n => !MOBILE_PRIMARY.includes(n.id)).map(({ id, labelKey, icon: NavIcon }) => (
                <button
                  key={id}
                  onClick={() => navigate(id)}
                  className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border border-rule bg-surface-raised text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                >
                  <NavIcon />
                  {t(labelKey)}
                </button>
              ))}
              <div className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border border-rule bg-surface-raised text-xs">
                <ThemeToggle />
                {t('shell.theme')}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
