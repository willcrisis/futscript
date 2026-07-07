import { useState } from 'react'
import { totalRounds } from '../engine/season'
import type { Fixture, GameState } from '../engine/types'
import Button from '../ui/Button'
import EmptyState from '../ui/EmptyState'
import ScreenHeader from '../ui/ScreenHeader'
import { eventText } from './MatchScreen'

const ROW = 'grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-lg border border-rule bg-surface-raised px-3 py-2'
const SPINE = 'shadow-[inset_3px_0_0_0_var(--accent)]'

export default function FixturesScreen({ state }: { state: GameState }) {
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
        label="CALENDAR"
        title="Fixtures"
        actions={
          <>
            {divisions.length > 1 && (
              <select
                value={division}
                onChange={e => setDivision(Number(e.target.value))}
                className="rounded-md border border-rule bg-surface-raised px-2 py-1.5 text-sm"
                aria-label="Division"
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
                aria-label="Previous week"
              >
                ‹
              </Button>
              <span className="w-16 text-center font-mono text-sm tabular-nums">Week {round}</span>
              <Button
                variant="ghost"
                size="sm"
                disabled={round >= total}
                onClick={() => { setRound(round + 1); setSelected(null) }}
                aria-label="Next week"
              >
                ›
              </Button>
            </div>
          </>
        }
      />
      {fixtures.length === 0 ? (
        <EmptyState>Cup week — see the Cup tab.</EmptyState>
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
                  {played ? `${f.homeGoals} – ${f.awayGoals}` : <span className="text-ink-muted">vs</span>}
                </div>
                <div className="text-left">{name(f.awayId)}</div>
              </>
            )
            return played ? (
              <button
                key={i}
                type="button"
                className={`${rowClass} text-left transition-colors hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface`}
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
        <div className="report">
          <h3>{name(selected.homeId)} {selected.homeGoals} – {selected.awayGoals} {name(selected.awayId)}</h3>
          <ul className="ticker">
            {(selected.events ?? []).map((e, i) => (
              <li key={i}>
                <strong>{e.minute}'</strong> {eventText(e, state)} <em>({name(e.teamId)})</em>
              </li>
            ))}
            {(selected.events ?? []).length === 0 && <li>No report available for this match.</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
