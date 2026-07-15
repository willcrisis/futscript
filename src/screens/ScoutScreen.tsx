import { useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { marketValue } from '../engine/finance'
import { PRONE_THRESHOLD } from '../engine/match'
import { makeOffer } from '../engine/transfers'
import type { GameState, Player, Position, Team } from '../engine/types'
import { t, useLang } from '../i18n'
import Button from '../ui/Button'
import ClubLink from '../ui/ClubLink'
import DataTable from '../ui/DataTable'
import type { Column } from '../ui/DataTable'
import EmptyState from '../ui/EmptyState'
import MoneyText from '../ui/MoneyText'
import PlayerLink from '../ui/PlayerLink'
import ScreenHeader from '../ui/ScreenHeader'

const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

export interface ScoutRow { player: Player; team: Team; value: number }
export interface ScoutFilters {
  name: string
  position: Position | 'all'
  minLevel: number
  maxValue: number | null
  division: number | null
}

export function buildScoutRows(state: GameState): ScoutRow[] {
  const rows: ScoutRow[] = []
  for (const team of state.teams) {
    if (team.id === state.userTeamId) continue // own players live in Squad
    if (team.poolReturn != null && team.poolReturn > state.season) continue // dormant clubs
    for (const id of team.playerIds) {
      const player = state.players[id]
      rows.push({ player, team, value: marketValue(player) })
    }
  }
  return rows
}

export function applyScoutFilters(rows: ScoutRow[], f: ScoutFilters): ScoutRow[] {
  const needle = fold(f.name.trim())
  return rows.filter(r =>
    (needle === '' || fold(r.player.name).includes(needle)) &&
    (f.position === 'all' || r.player.position === f.position) &&
    r.player.level >= f.minLevel &&
    (f.maxValue == null || r.value <= f.maxValue) &&
    (f.division == null || r.team.division === f.division),
  )
}

const SELECT = 'rounded-md border border-rule bg-surface-raised px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface'
const POSITIONS: Position[] = ['GK', 'DF', 'MF', 'FW']

export default function ScoutScreen({ state, setState }: { state: GameState; setState: Dispatch<SetStateAction<GameState>> }) {
  useLang()
  const [name, setName] = useState('')
  const [position, setPosition] = useState<Position | 'all'>('all')
  const [minLevel, setMinLevel] = useState(0)
  const [maxValue, setMaxValue] = useState<number | null>(null)
  const [division, setDivision] = useState<number | null>(null)
  const [offering, setOffering] = useState<number | null>(null)
  const [bid, setBid] = useState(0)

  const divisions = [...new Set(state.teams.map(tm => tm.division))].sort((a, b) => a - b)
  const rows = useMemo(() => buildScoutRows(state), [state])
  const filtered = useMemo(
    () => applyScoutFilters(rows, { name, position, minLevel, maxValue, division }).sort((a, b) => b.player.level - a.player.level),
    [rows, name, position, minLevel, maxValue, division],
  )
  const pending = (id: number) => state.outgoingOffers.some(o => o.playerId === id)

  const columns: Column<ScoutRow>[] = [
    {
      key: 'name',
      label: t('common.player'),
      render: r => (
        <span className="inline-flex items-center gap-2">
          <PlayerLink playerId={r.player.id}>{r.player.name}</PlayerLink>
          {r.player.injuryCount >= PRONE_THRESHOLD && (
            <span className="text-danger" title={t('squad.injuryProne')} aria-label={t('squad.injuryProne')}>⚠</span>
          )}
        </span>
      ),
    },
    { key: 'club', label: t('scout.clubColumn'), hideOnMobile: true, render: r => <ClubLink teamId={r.team.id}>{r.team.name}</ClubLink> },
    { key: 'pos', label: t('common.position'), mono: true, render: r => r.player.position },
    { key: 'age', label: t('common.age'), mono: true, hideOnMobile: true, render: r => r.player.age },
    { key: 'level', label: t('common.level'), mono: true, render: r => (
      <span className="inline-flex items-baseline gap-1">
        <strong>{r.player.level}</strong>
        {r.player.level < r.player.peakLevel && (
          <span className="text-[10px] text-ink-faint" title={t('squad.recoveringTo', { n: r.player.peakLevel })}>↑{r.player.peakLevel}</span>
        )}
      </span>
    ) },
    { key: 'value', label: t('squad.valueColumn'), mono: true, align: 'right', render: r => <MoneyText amount={r.value} size="sm" /> },
    {
      key: 'offer', label: '', fullWidthOnMobile: true, render: r => {
        if (pending(r.player.id)) return <span className="text-xs text-ink-faint">{t('scout.offerPending')}</span>
        if (offering === r.player.id) return (
          <div className="flex items-center gap-1.5">
            <input
              type="number" value={bid} onChange={e => setBid(Number(e.target.value))}
              aria-label={t('scout.makeOffer')}
              className="w-24 rounded-md border border-rule bg-surface px-2 py-1 text-xs font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            />
            <Button variant="primary" size="sm" onClick={() => { setState(s => makeOffer(s, r.player.id, Math.round(bid))); setOffering(null) }}>
              {t('scout.sendOffer')}
            </Button>
            <Button variant="ghost" size="sm" aria-label={t('common.cancel')} onClick={() => setOffering(null)}>✕</Button>
          </div>
        )
        return (
          <Button variant="ghost" size="sm" onClick={() => { setOffering(r.player.id); setBid(r.value) }}>
            {t('scout.makeOffer')}
          </Button>
        )
      },
    },
  ]

  return (
    <div>
      <ScreenHeader label={t('scout.header')} title={t('scout.title')} />
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <input
          type="search" value={name} onChange={e => setName(e.target.value)} placeholder={t('scout.searchPlaceholder')}
          className={`${SELECT} w-40`} aria-label={t('scout.searchPlaceholder')}
        />
        <select value={position} onChange={e => setPosition(e.target.value as Position | 'all')} className={SELECT} aria-label={t('common.position')}>
          <option value="all">{t('scout.allPositions')}</option>
          {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{t('scout.minLevel')}</span>
          <input type="number" min={0} max={99} value={minLevel} onChange={e => setMinLevel(Number(e.target.value))} className={`${SELECT} w-20`} />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{t('scout.maxValue')}</span>
          <input type="number" min={0} step={100000} value={maxValue ?? ''} onChange={e => setMaxValue(e.target.value === '' ? null : Number(e.target.value))} className={`${SELECT} w-28`} />
        </label>
        {divisions.length > 1 && (
          <select value={division ?? ''} onChange={e => setDivision(e.target.value === '' ? null : Number(e.target.value))} className={SELECT} aria-label={t('common.division')}>
            <option value="">{t('scout.allDivisions')}</option>
            {divisions.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
      </div>
      <DataTable columns={columns} rows={filtered} rowKey={r => r.player.id} empty={<EmptyState>{t('scout.noMatch')}</EmptyState>} />
    </div>
  )
}
