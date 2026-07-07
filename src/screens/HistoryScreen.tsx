import type { GameState, SeasonRecord } from '../engine/types'
import DataTable from '../ui/DataTable'
import type { Column } from '../ui/DataTable'
import EmptyState from '../ui/EmptyState'
import ScreenHeader from '../ui/ScreenHeader'
import StatChip from '../ui/StatChip'

const columns: Column<SeasonRecord>[] = [
  { key: 'season', label: 'Season', mono: true, render: h => h.season },
  { key: 'champions', label: 'D1 champions', render: h => h.champions[0] ?? '—' },
  { key: 'cup', label: 'Cup winners', render: h => h.cupWinner },
  {
    key: 'scorer',
    label: 'Top scorer',
    render: h => `${h.topScorer.player} (${h.topScorer.goals}) — ${h.topScorer.team}`,
  },
  { key: 'finish', label: 'Your finish', mono: true, render: h => `Div ${h.userDivision} · P${h.userPosition}` },
]

export default function HistoryScreen({ state }: { state: GameState }) {
  const userName = state.teams.find(t => t.id === state.userTeamId)!.name
  const titles = state.history.filter(h => h.champions[0] === userName).length
  const cups = state.history.filter(h => h.cupWinner === userName).length

  return (
    <div>
      <ScreenHeader label="THE LONG GAME" title="History" />
      {state.history.length === 0 ? (
        <EmptyState>No completed seasons yet — history is written at each season's end.</EmptyState>
      ) : (
        <>
          <div className="mb-4 grid max-w-md grid-cols-2 gap-3">
            <StatChip label="D1 titles" value={titles} />
            <StatChip label="Cups" value={cups} />
          </div>
          <DataTable columns={columns} rows={state.history.slice().reverse()} rowKey={h => h.season} />
        </>
      )}
    </div>
  )
}
