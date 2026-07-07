import { useState } from 'react'
import { totalRounds } from '../engine/season'
import type { Fixture, GameState } from '../engine/types'
import { t, useLang } from '../i18n'
import Button from '../ui/Button'
import EmptyState from '../ui/EmptyState'
import EventFeed from '../ui/EventFeed'
import Panel from '../ui/Panel'
import ScreenHeader from '../ui/ScreenHeader'

const ROW = 'grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-lg border border-rule bg-surface-raised px-3 py-2'
const SPINE = 'shadow-[inset_3px_0_0_0_var(--accent)]'

export default function FixturesScreen({ state }: { state: GameState }) {
  useLang()
  const total = totalRounds(state)
  const [round, setRound] = useState(() => Math.min(Math.max(state.round - 1, 1), total))
  const [selected, setSelected] = useState<Fixture | null>(null)
  const name = (id: number) => state.teams.find(t => t.id === id)!.name
  const userDivision = state.teams.find(t => t.id === state.userTeamId)!.division
  const [division, setDivision] = useState(userDivision)
  const divisions = [...new Set(state.teams.map(t => t.division))].sort()
  const divisionOf = (teamId: number) => state.teams.find(t => t.id === teamId)!.division
  const fixtures = state.fixtures.filter(f => f.round === round && divisionOf(f.homeId) === division)

  return (
    <div>
      <ScreenHeader
        label={t('fixtures.header')}
        title={t('fixtures.title')}
        actions={
          <>
            {divisions.length > 1 && (
              <select
                value={division}
                onChange={e => setDivision(Number(e.target.value))}
                className="rounded-md border border-rule bg-surface-raised px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                aria-label={t('common.division')}
              >
                {divisions.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            )}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={round <= 1}
                onClick={() => { setRound(round - 1); setSelected(null) }}
                aria-label={t('fixtures.previousWeek')}
              >
                ‹
              </Button>
              <span className="w-16 text-center font-mono text-sm tabular-nums">{t('fixtures.weekLabel', { n: round })}</span>
              <Button
                variant="ghost"
                size="sm"
                disabled={round >= total}
                onClick={() => { setRound(round + 1); setSelected(null) }}
                aria-label={t('fixtures.nextWeek')}
              >
                ›
              </Button>
            </div>
          </>
        }
      />
      {fixtures.length === 0 ? (
        <EmptyState>{t('fixtures.cupWeekEmpty')}</EmptyState>
      ) : (
        <div className="flex flex-col gap-2">
          {fixtures.map((f, i) => {
            const played = f.homeGoals !== null
            const isUser = f.homeId === state.userTeamId || f.awayId === state.userTeamId
            const rowClass = `${ROW} ${isUser ? SPINE : ''}`
            const content = (
              <>
                <div className="text-right">{name(f.homeId)}</div>
                <div className="text-center font-mono text-sm tabular-nums">
                  {played ? `${f.homeGoals} – ${f.awayGoals}` : <span className="text-ink-muted">{t('common.vs')}</span>}
                </div>
                <div className="text-left">{name(f.awayId)}</div>
              </>
            )
            return played ? (
              <button
                key={i}
                type="button"
                className={`${rowClass} text-left transition-colors hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${f === selected ? 'border-ink/40!' : ''}`}
                onClick={() => setSelected(f === selected ? null : f)}
              >
                {content}
              </button>
            ) : (
              <div key={i} className={rowClass}>{content}</div>
            )
          })}
        </div>
      )}
      {selected && fixtures.includes(selected) && (
        <Panel className="mt-4">
          <h3 className="mb-2 font-semibold">
            {name(selected.homeId)} {selected.homeGoals} – {selected.awayGoals} {name(selected.awayId)}
          </h3>
          <EventFeed events={selected.events ?? []} state={state} />
        </Panel>
      )}
    </div>
  )
}
