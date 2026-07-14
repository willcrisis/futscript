import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { positionOf } from '../engine/career'
import { marketValue } from '../engine/finance'
import { makeOffer } from '../engine/transfers'
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
  setState: Dispatch<SetStateAction<GameState>>
  teamId: number
  onBack: () => void
}

export default function ClubScreen({ state, setState, teamId, onBack }: Props) {
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

  const canOffer = state.manager.employed && teamId !== state.userTeamId
  const userCash = state.teams.find(tm => tm.id === state.userTeamId)!.cash
  const [offering, setOffering] = useState<number | null>(null)
  const [bid, setBid] = useState(0)
  const pending = (id: number) => state.outgoingOffers.some(o => o.playerId === id)

  const offerColumn: Column<Player> = {
    key: 'offer', label: '', fullWidthOnMobile: true, render: p => {
      if (pending(p.id)) return <span className="text-xs text-ink-faint">{t('club.offerPending')}</span>
      if (offering === p.id) return (
        <div className="flex items-center gap-1.5">
          <input
            type="number" value={bid} onChange={e => setBid(Number(e.target.value))}
            className="w-24 rounded-md border border-rule bg-surface px-2 py-1 text-xs font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          />
          <Button
            variant="primary" size="sm" disabled={bid <= 0 || bid > userCash}
            onClick={() => { setState(s => makeOffer(s, p.id, bid)); setOffering(null) }}
          >
            {t('club.sendOffer')}
          </Button>
          <Button variant="ghost" size="sm" aria-label={t('common.cancel')} onClick={() => setOffering(null)}>✕</Button>
        </div>
      )
      return (
        <Button variant="ghost" size="sm" onClick={() => { setOffering(p.id); setBid(marketValue(p)) }}>
          {t('club.makeOffer')}
        </Button>
      )
    },
  }
  const squadColumns = canOffer ? [...columns, offerColumn] : columns

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
        <DataTable columns={squadColumns} rows={squad} rowKey={p => p.id} />
      </Panel>
    </div>
  )
}
