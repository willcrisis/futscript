import { useState } from 'react'
import { CUP_WEEKS } from '../engine/fixtures'
import type { CupFixture, GameState } from '../engine/types'
import Badge from '../ui/Badge'
import EmptyState from '../ui/EmptyState'
import EventFeed from '../ui/EventFeed'
import Panel from '../ui/Panel'
import ScreenHeader from '../ui/ScreenHeader'
import SectionLabel from '../ui/SectionLabel'

const ROUND_NAMES = ['Round 1', 'Round 2', 'Round of 16', 'Quarter-finals', 'Semi-finals', 'Final']

const ROW = 'grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-lg border border-rule bg-surface-raised px-3 py-2'
const SPINE = 'shadow-[inset_3px_0_0_0_var(--accent)]'

function TieRow({
  f, name, isUser, onToggle,
}: {
  f: CupFixture
  name: (id: number) => string
  isUser: boolean
  onToggle: () => void
}) {
  const played = f.homeGoals !== null
  const penalties = f.winnerId !== null && f.homeGoals === f.awayGoals
  const loser = (id: number) => f.winnerId !== null && f.winnerId !== id
  const rowClass = `${ROW} ${isUser ? SPINE : ''}`
  const content = (
    <>
      <div className={`flex items-center justify-end gap-2 text-right ${loser(f.homeId) ? 'text-ink-faint' : ''}`}>
        {f.winnerId === f.homeId && <Badge tone="accent">through</Badge>}
        {name(f.homeId)}
      </div>
      <div className="text-center font-mono text-sm tabular-nums">
        {played ? `${f.homeGoals} – ${f.awayGoals}` : <span className="text-ink-muted">vs</span>}
        {penalties && <span className="text-ink-faint"> (p)</span>}
      </div>
      <div className={`flex items-center gap-2 text-left ${loser(f.awayId) ? 'text-ink-faint' : ''}`}>
        {name(f.awayId)}
        {f.winnerId === f.awayId && <Badge tone="accent">through</Badge>}
      </div>
    </>
  )
  return played ? (
    <button
      type="button"
      className={`${rowClass} text-left transition-colors hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface`}
      onClick={onToggle}
    >
      {content}
    </button>
  ) : (
    <div className={rowClass}>{content}</div>
  )
}

export default function CupScreen({ state }: { state: GameState }) {
  const [selected, setSelected] = useState<CupFixture | null>(null)
  const name = (id: number) => state.teams.find(t => t.id === id)!.name
  if (state.cupFixtures.length === 0) {
    return (
      <div>
        <ScreenHeader label="NATIONAL CUP" title="Cup" />
        <EmptyState>No cup this season.</EmptyState>
      </div>
    )
  }
  const rounds = [...new Set(state.cupFixtures.map(f => f.cupRound))].sort((a, b) => a - b)
  const final = state.cupFixtures.reduce((a, b) => (b.cupRound > a.cupRound ? b : a))
  const champion =
    final.cupRound === CUP_WEEKS.length && final.winnerId !== null ? name(final.winnerId) : null
  return (
    <div>
      <ScreenHeader label="NATIONAL CUP" title="Cup" />
      {champion && (
        <Panel className="mb-4">
          <p className="text-lg font-semibold">🏆 {champion} win the Cup!</p>
        </Panel>
      )}
      <div className="flex flex-col gap-6">
        {rounds.map(r => (
          <div key={r}>
            <SectionLabel>{ROUND_NAMES[r - 1]} — Week {CUP_WEEKS[r - 1]}</SectionLabel>
            <div className="mt-2 flex flex-col gap-2">
              {state.cupFixtures.filter(f => f.cupRound === r).map((f, i) => (
                <TieRow
                  key={i}
                  f={f}
                  name={name}
                  isUser={[f.homeId, f.awayId].includes(state.userTeamId)}
                  onToggle={() => { if (f.homeGoals === null) return; setSelected(f !== selected ? f : null) }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      {selected && (
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
