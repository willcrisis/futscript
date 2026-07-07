import type { GameState } from '../engine/types'
import DataTable from '../ui/DataTable'
import type { Column } from '../ui/DataTable'
import EmptyState from '../ui/EmptyState'
import Panel from '../ui/Panel'
import ScreenHeader from '../ui/ScreenHeader'

interface ScorerRow {
  key: number
  rank: number
  player: string
  club: string
  goals: number
}

const columns: Column<ScorerRow>[] = [
  { key: 'rank', label: '#', mono: true, render: r => r.rank },
  { key: 'player', label: 'Player', render: r => r.player },
  { key: 'club', label: 'Club', render: r => r.club },
  { key: 'goals', label: 'Goals', align: 'right', mono: true, render: r => <strong>{r.goals}</strong> },
]

const allTimeColumns: Column<ScorerRow>[] = [
  { key: 'rank', label: '#', mono: true, render: r => r.rank },
  { key: 'player', label: 'Player', render: r => r.player },
  { key: 'club', label: 'Last club', render: r => r.club },
  { key: 'goals', label: 'Goals', align: 'right', mono: true, render: r => <strong>{r.goals}</strong> },
]

export default function StatsScreen({ state }: { state: GameState }) {
  const teamOf = (playerId: number) => state.teams.find(t => t.playerIds.includes(playerId))?.name ?? '—'
  const thisSeason: ScorerRow[] = Object.values(state.players)
    .filter(p => p.seasonGoals > 0)
    .sort((a, b) => b.seasonGoals - a.seasonGoals)
    .slice(0, 15)
    .map((p, i) => ({ key: p.id, rank: i + 1, player: p.name, club: teamOf(p.id), goals: p.seasonGoals }))
  const allTime: ScorerRow[] = state.allTimeScorers.slice(0, 20).map((e, i) => ({
    key: e.playerId, rank: i + 1, player: e.player, club: e.team, goals: e.goals,
  }))

  return (
    <div>
      <ScreenHeader label="SCORERS" title="Stats" />
      <div className="flex flex-col gap-4">
        <Panel label="This season">
          <DataTable
            columns={columns}
            rows={thisSeason}
            rowKey={r => r.key}
            empty={<EmptyState>No goals yet.</EmptyState>}
          />
        </Panel>
        <Panel label="All-time">
          <DataTable
            columns={allTimeColumns}
            rows={allTime}
            rowKey={r => r.key}
            empty={<EmptyState>The record books open at the end of the first season.</EmptyState>}
          />
        </Panel>
      </div>
    </div>
  )
}
