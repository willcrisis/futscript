import type { GameState, SeasonRecord } from '../engine/types'
import { t, useLang } from '../i18n'
import DataTable from '../ui/DataTable'
import type { Column } from '../ui/DataTable'
import EmptyState from '../ui/EmptyState'
import ScreenHeader from '../ui/ScreenHeader'
import StatChip from '../ui/StatChip'

function columns(): Column<SeasonRecord>[] {
  return [
    { key: 'season', label: t('history.seasonColumn'), mono: true, render: h => h.season },
    { key: 'club', label: t('history.clubColumn'), render: h => h.club },
    { key: 'champions', label: t('history.championsColumn'), render: h => h.champions[0] ?? '—' },
    { key: 'cup', label: t('history.cupColumn'), render: h => h.cupWinner },
    {
      key: 'scorer',
      label: t('history.scorerColumn'),
      render: h => `${h.topScorer.player} (${h.topScorer.goals}) — ${h.topScorer.team}`,
    },
    {
      key: 'finish',
      label: t('history.finishColumn'),
      mono: true,
      render: h => t('history.divisionPosition', { division: h.userDivision, position: h.userPosition }),
    },
  ]
}

export default function HistoryScreen({ state }: { state: GameState }) {
  useLang()
  const titles = state.history.filter(h => h.champions[0] === h.club).length
  const cups = state.history.filter(h => h.cupWinner === h.club).length

  return (
    <div>
      <ScreenHeader label={t('history.header')} title={t('history.title')} />
      {state.history.length === 0 ? (
        <EmptyState>{t('history.emptyState')}</EmptyState>
      ) : (
        <>
          <div className="mb-4 grid max-w-md grid-cols-3 gap-3">
            <StatChip label={t('history.d1Titles')} value={titles} />
            <StatChip label={t('history.cups')} value={cups} />
            <StatChip label={t('history.reputation')} value={state.manager.reputation} />
          </div>
          <DataTable columns={columns()} rows={state.history.slice().reverse()} rowKey={h => h.season} />
        </>
      )}
    </div>
  )
}
