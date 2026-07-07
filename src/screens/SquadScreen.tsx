import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { formatMoney, marketValue, severanceFor } from '../engine/finance'
import { autoPick, isAvailable, swapIn, updateTeam } from '../engine/lineup'
import { listPlayer, releasePlayer, renewalSalary, renewContract } from '../engine/transfers'
import {
  FORMATIONS,
  type FormationName,
  type GameState,
  type Player,
  type Tactic,
  type TrainingStyle,
} from '../engine/types'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import ConfirmButton from '../ui/ConfirmButton'
import DataTable from '../ui/DataTable'
import type { Column } from '../ui/DataTable'
import MoneyText from '../ui/MoneyText'
import ScreenHeader from '../ui/ScreenHeader'

const ORDER = ['GK', 'DF', 'MF', 'FW']
const TACTICS: Tactic[] = ['defensive', 'normal', 'attacking']
const TRAINING_STYLES: TrainingStyle[] = ['light', 'normal', 'intensive', 'youth']

const SELECT_CLASS = 'rounded-md border border-rule bg-surface-raised px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface'

function statusBadge(p: Player) {
  if (p.injuredForRounds > 0) return <Badge tone="danger">Injured · {p.injuredForRounds}w</Badge>
  if (p.suspendedForRounds > 0) return <Badge tone="warn">Banned · {p.suspendedForRounds}w</Badge>
  if (p.yellowCards > 0) return <Badge tone="muted">Cards · {p.yellowCards}</Badge>
  return null
}

function formCell(form: number) {
  if (form > 0) return <span className="text-accent-strong">▲{form}</span>
  if (form < 0) return <span className="text-danger">▼{-form}</span>
  return <span className="text-ink-faint">–</span>
}

interface Props {
  state: GameState
  setState: Dispatch<SetStateAction<GameState>>
}

export default function SquadScreen({ state, setState }: Props) {
  const [selling, setSelling] = useState<number | null>(null)
  const [askingPrice, setAskingPrice] = useState(0)
  const team = state.teams.find(t => t.id === state.userTeamId)!
  const squad = team.playerIds
    .map(id => state.players[id])
    .sort((a, b) => ORDER.indexOf(a.position) - ORDER.indexOf(b.position) || b.level - a.level)

  const withUserTeam = (fn: (s: GameState, t: typeof team) => GameState) =>
    setState(s => fn(s, s.teams.find(t => t.id === s.userTeamId)!))

  const columns: Column<Player>[] = [
    {
      key: 'name',
      label: 'Name',
      render: p => (
        <span className="inline-flex items-center gap-2">
          {p.name}
          {team.lineup.includes(p.id) && <Badge tone="accent">XI</Badge>}
        </span>
      ),
    },
    { key: 'age', label: 'Age', mono: true, hideOnMobile: true, render: p => p.age },
    { key: 'level', label: 'Lvl', mono: true, render: p => <strong>{p.level}</strong> },
    { key: 'form', label: 'Form', mono: true, hideOnMobile: true, render: p => formCell(p.form) },
    {
      key: 'fit',
      label: 'Fit',
      mono: true,
      hideOnMobile: true,
      render: p => <span className={p.fitness < 70 ? 'text-warn' : ''}>{p.fitness}%</span>,
    },
    { key: 'status', label: 'Status', render: p => statusBadge(p) },
    {
      key: 'salary',
      label: 'Salary',
      mono: true,
      hideOnMobile: true,
      render: p => (
        <span className="inline-flex items-baseline gap-1">
          <MoneyText amount={p.salary} size="sm" />
          <span className="text-ink-faint">/wk</span>
        </span>
      ),
    },
    {
      key: 'contract',
      label: 'Contract',
      mono: true,
      hideOnMobile: true,
      render: p => <span className={p.contractSeasons <= 1 ? 'text-warn' : ''}>{p.contractSeasons}y</span>,
    },
    {
      key: 'value',
      label: 'Value',
      mono: true,
      hideOnMobile: true,
      render: p => <MoneyText amount={marketValue(p)} size="sm" />,
    },
    {
      key: 'actions',
      label: '',
      fullWidthOnMobile: true,
      render: p => {
        const starting = team.lineup.includes(p.id)
        const listed = state.transferList.some(l => l.playerId === p.id)
        if (selling === p.id) {
          return (
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                value={askingPrice}
                onChange={e => setAskingPrice(Number(e.target.value))}
                className="w-24 rounded-md border border-rule bg-surface px-2 py-1 text-xs font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              />
              <Button
                variant="primary"
                size="sm"
                onClick={() => { setState(s => listPlayer(s, p.id, askingPrice)); setSelling(null) }}
              >
                List
              </Button>
              <Button variant="ghost" size="sm" aria-label="Cancel" onClick={() => setSelling(null)}>
                ✕
              </Button>
            </div>
          )
        }
        return (
          <div className="flex flex-wrap items-center gap-1.5">
            {starting ? (
              <span className="text-xs text-ink-faint">Starting</span>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                disabled={!isAvailable(p)}
                onClick={() => withUserTeam((s, t) => updateTeam(s, t.id, { lineup: swapIn(t, s.players, p.id) }))}
              >
                Start
              </Button>
            )}
            {listed ? (
              <Badge tone="muted">Listed</Badge>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => { setSelling(p.id); setAskingPrice(marketValue(p)) }}>
                Sell
              </Button>
            )}
            <ConfirmButton
              label="Release"
              confirmLabel={`Confirm ${formatMoney(-severanceFor(p))}`}
              onConfirm={() => setState(s => releasePlayer(s, p.id))}
              size="sm"
            />
            {p.contractSeasons <= 1 && (
              <Button variant="ghost" size="sm" onClick={() => setState(s => renewContract(s, p.id))}>
                Renew ({formatMoney(renewalSalary(p))}/wk)
              </Button>
            )}
          </div>
        )
      },
    },
  ]

  return (
    <div>
      <ScreenHeader
        label="SQUAD"
        title={team.name}
        actions={
          <>
            <select
              aria-label="Formation"
              value={team.formation}
              onChange={e => {
                const formation = e.target.value as FormationName
                withUserTeam((s, t) => {
                  const next = { ...t, formation }
                  return updateTeam(s, t.id, { formation, lineup: autoPick(next, s.players) })
                })
              }}
              className={SELECT_CLASS}
            >
              {Object.keys(FORMATIONS).map(f => <option key={f}>{f}</option>)}
            </select>
            <select
              aria-label="Tactic"
              value={team.tactic}
              onChange={e => {
                const tactic = e.target.value as Tactic
                withUserTeam((s, t) => updateTeam(s, t.id, { tactic }))
              }}
              className={SELECT_CLASS}
            >
              {TACTICS.map(t => <option key={t}>{t}</option>)}
            </select>
            <select
              aria-label="Training"
              value={team.trainingStyle}
              onChange={e => {
                const trainingStyle = e.target.value as TrainingStyle
                withUserTeam((s, t) => updateTeam(s, t.id, { trainingStyle }))
              }}
              className={SELECT_CLASS}
            >
              {TRAINING_STYLES.map(t => <option key={t}>{t}</option>)}
            </select>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => withUserTeam((s, t) => updateTeam(s, t.id, { lineup: autoPick(t, s.players) }))}
            >
              Auto-pick
            </Button>
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={state.playFriendlies}
                onChange={e => {
                  const playFriendlies = e.target.checked
                  setState(s => ({ ...s, playFriendlies }))
                }}
                className="accent-accent size-4"
              />
              Friendlies
            </label>
          </>
        }
      />
      <DataTable columns={columns} rows={squad} rowKey={p => p.id} groupLabel={p => p.position} />
    </div>
  )
}
