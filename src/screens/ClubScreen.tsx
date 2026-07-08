import { positionOf } from '../engine/career'
import type { GameState, Player } from '../engine/types'
import { isManaged } from '../engine/types'
import { t, useLang } from '../i18n'
import Button from '../ui/Button'
import DataTable from '../ui/DataTable'
import type { Column } from '../ui/DataTable'
import Panel from '../ui/Panel'
import ScreenHeader from '../ui/ScreenHeader'

interface Props {
  state: GameState
  teamId: number
  onBack: () => void
}

export default function ClubScreen({ state, teamId, onBack }: Props) {
  useLang()
  const team = state.teams.find(tm => tm.id === teamId)!
  const manager = isManaged(state, teamId) ? state.manager.name : team.manager
  const squad = team.playerIds.map(id => state.players[id]).sort((a, b) => b.level - a.level)

  const status = (p: Player) =>
    p.injuredForRounds > 0 ? t('club.statusOut', { n: p.injuredForRounds })
    : p.suspendedForRounds > 0 ? t('club.statusBan')
    : t('club.statusFit')

  const columns: Column<Player>[] = [
    { key: 'name', label: t('common.player'), render: p => p.name },
    { key: 'position', label: t('common.position'), mono: true, render: p => p.position },
    { key: 'age', label: t('common.age'), align: 'right', mono: true, render: p => p.age },
    { key: 'level', label: t('common.level'), align: 'right', mono: true, render: p => <strong>{p.level}</strong> },
    { key: 'status', label: t('common.status'), hideOnMobile: true, render: status },
  ]

  return (
    <div>
      <ScreenHeader
        label={t('club.position', { position: positionOf(state, teamId), division: team.division })}
        title={team.name}
        actions={<Button variant="ghost" size="sm" onClick={onBack}>{t('club.back')}</Button>}
      />
      <Panel className="mb-4">
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-ink-muted">{t('club.manager')}</span>
            <span className="font-medium">{manager}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink-muted">{t('club.fanMood')}</span>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-rule">
                <div className="h-full bg-accent" style={{ width: `${team.fanMood}%` }} />
              </div>
              <span className="font-mono text-xs tabular-nums">{team.fanMood}</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink-muted">{t('club.capacity')}</span>
            <span className="font-mono text-xs tabular-nums">{t('home.seats', { n: team.capacity.toLocaleString('en-US') })}</span>
          </div>
        </div>
      </Panel>
      <Panel label={t('club.squadPanel')}>
        <DataTable columns={columns} rows={squad} rowKey={p => p.id} />
      </Panel>
    </div>
  )
}
