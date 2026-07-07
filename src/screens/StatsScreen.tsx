import type { GameState } from '../engine/types'
import { t, useLang } from '../i18n'
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

function columnsFor(lastClub: boolean): Column<ScorerRow>[] {
  return [
    { key: 'rank', label: t('common.pos'), mono: true, render: r => r.rank },
    { key: 'player', label: t('common.player'), render: r => r.player },
    { key: 'club', label: lastClub ? t('stats.lastClub') : t('common.club'), render: r => r.club },
    { key: 'goals', label: t('stats.goals'), align: 'right', mono: true, render: r => <strong>{r.goals}</strong> },
  ]
}

export default function StatsScreen({ state }: { state: GameState }) {
  useLang()
  const columns = columnsFor(false)
  const allTimeColumns = columnsFor(true)
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
      <ScreenHeader label={t('stats.header')} title={t('stats.title')} />
      <div className="flex flex-col gap-4">
        <Panel label={t('stats.thisSeason')}>
          <DataTable
            columns={columns}
            rows={thisSeason}
            rowKey={r => r.key}
            empty={<EmptyState>{t('stats.noGoalsYet')}</EmptyState>}
          />
        </Panel>
        <Panel label={t('stats.allTime')}>
          <DataTable
            columns={allTimeColumns}
            rows={allTime}
            rowKey={r => r.key}
            empty={<EmptyState>{t('stats.recordBooksEmpty')}</EmptyState>}
          />
        </Panel>
      </div>
    </div>
  )
}
