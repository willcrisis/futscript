import { useEffect, useState } from 'react'
import type { FC, ReactNode } from 'react'
import type { GameState } from '../engine/types'
import { totalRounds } from '../engine/season'
import Button from './Button'
import MoneyText from './MoneyText'
import ThemeToggle from './ThemeToggle'
import {
  CupIcon, FinanceIcon, FixturesIcon, HistoryIcon, HomeIcon, MoreIcon,
  SavesIcon, SquadIcon, StatsIcon, TableIcon, TransfersIcon,
} from './icons'

export type ScreenId =
  | 'home' | 'squad' | 'table' | 'fixtures' | 'cup'
  | 'stats' | 'transfers' | 'finance' | 'history' | 'saves'

export const NAV: { id: ScreenId; label: string; icon: FC<{ className?: string }> }[] = [
  { id: 'home', label: 'Home', icon: HomeIcon },
  { id: 'squad', label: 'Squad', icon: SquadIcon },
  { id: 'table', label: 'Table', icon: TableIcon },
  { id: 'fixtures', label: 'Fixtures', icon: FixturesIcon },
  { id: 'cup', label: 'Cup', icon: CupIcon },
  { id: 'stats', label: 'Stats', icon: StatsIcon },
  { id: 'transfers', label: 'Transfers', icon: TransfersIcon },
  { id: 'finance', label: 'Finance', icon: FinanceIcon },
  { id: 'history', label: 'History', icon: HistoryIcon },
  { id: 'saves', label: 'Saves', icon: SavesIcon },
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
  const [moreOpen, setMoreOpen] = useState(false)
  const user = state.teams.find(t => t.id === state.userTeamId)!
  const week = Math.min(state.round, totalRounds(state))

  useEffect(() => {
    if (!moreOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMoreOpen(false)
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
        <nav className="mt-4 flex flex-1 flex-col gap-0.5" aria-label="Sections">
          {NAV.map(({ id, label, icon: NavIcon }) => (
            <button
              key={id}
              onClick={() => navigate(id)}
              aria-current={screen === id ? 'page' : undefined}
              className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm focus-visible:ring-2 focus-visible:ring-accent ${
                screen === id ? 'bg-rule/60 font-medium text-ink' : 'text-ink-muted hover:text-ink'
              }`}
            >
              <NavIcon />
              {label}
              {attentionFor(id, state) && <span aria-label="needs attention" className="ml-auto size-1.5 rounded-full bg-accent" />}
            </button>
          ))}
        </nav>
        <div className="mt-4 border-t border-rule pt-3 text-sm">
          <div className="flex items-center justify-between gap-2 px-2">
            <div className="min-w-0">
              <div className="truncate font-medium">{user.name}</div>
              <div className="font-mono text-xs tabular-nums text-ink-muted">
                <MoneyText amount={user.cash} size="sm" /> · S{state.season} W{week}
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
      <main className="mx-auto w-full max-w-4xl px-4 pb-28 pt-6 md:ml-52 md:pb-10">
        {/* mobile vitals line */}
        <div className="mb-4 flex items-center justify-between text-xs text-ink-muted md:hidden">
          <span className="font-medium text-ink">{user.name}</span>
          <span className="font-mono tabular-nums">
            <MoneyText amount={user.cash} size="sm" /> · S{state.season} W{week}
          </span>
        </div>
        {children}
      </main>

      {/* mobile: floating advance + bottom bar */}
      <div className="fixed bottom-16 right-4 z-40 md:hidden">
        <Button variant="primary" onClick={onAdvance}>{advanceLabel}</Button>
      </div>
      <nav aria-label="Sections" className="fixed inset-x-0 bottom-0 z-40 flex border-t border-rule bg-surface-raised md:hidden">
        {MOBILE_PRIMARY.map(id => {
          const item = NAV.find(n => n.id === id)!
          const NavIcon = item.icon
          return (
            <button
              key={id}
              onClick={() => navigate(id)}
              aria-current={screen === id ? 'page' : undefined}
              className={`relative flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] ${
                screen === id ? 'text-ink' : 'text-ink-muted'
              }`}
            >
              <NavIcon />
              {item.label}
              {attentionFor(id, state) && <span className="absolute right-1/4 top-1.5 size-1.5 rounded-full bg-accent" />}
            </button>
          )
        })}
        <button
          onClick={() => setMoreOpen(true)}
          className={`flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] ${
            MOBILE_PRIMARY.includes(screen) ? 'text-ink-muted' : 'text-ink'
          }`}
        >
          <MoreIcon />
          More
        </button>
      </nav>

      {/* mobile more-sheet */}
      {moreOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="More sections">
          <div className="absolute inset-0 bg-ink/30" onClick={() => setMoreOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-xl border-t border-rule bg-surface p-4">
            <div className="grid grid-cols-3 gap-2">
              {NAV.filter(n => !MOBILE_PRIMARY.includes(n.id)).map(({ id, label, icon: NavIcon }) => (
                <button
                  key={id}
                  onClick={() => navigate(id)}
                  className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border border-rule bg-surface-raised text-xs"
                >
                  <NavIcon />
                  {label}
                </button>
              ))}
              <div className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border border-rule bg-surface-raised text-xs">
                <ThemeToggle />
                Theme
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
