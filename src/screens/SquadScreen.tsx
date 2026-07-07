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
import { t, useLang } from '../i18n'
import type { TranslationKey } from '../i18n'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import ConfirmButton from '../ui/ConfirmButton'
import DataTable from '../ui/DataTable'
import type { Column } from '../ui/DataTable'
import { ExitIcon, PlayIcon, RenewIcon, TagIcon } from '../ui/icons'
import MoneyText from '../ui/MoneyText'
import ScreenHeader from '../ui/ScreenHeader'

const ORDER = ['GK', 'DF', 'MF', 'FW']
const TACTICS: Tactic[] = ['defensive', 'normal', 'attacking']
const TRAINING_STYLES: TrainingStyle[] = ['light', 'normal', 'intensive', 'youth']

const TACTIC_LABEL_KEYS: Record<Tactic, TranslationKey> = {
  defensive: 'squad.tacticDefensive',
  normal: 'squad.tacticNormal',
  attacking: 'squad.tacticAttacking',
}
const TRAINING_LABEL_KEYS: Record<TrainingStyle, TranslationKey> = {
  light: 'squad.trainingLight',
  normal: 'squad.trainingNormal',
  intensive: 'squad.trainingIntensive',
  youth: 'squad.trainingYouth',
}

const SELECT_CLASS = 'rounded-md border border-rule bg-surface-raised px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface'

function statusBadge(p: Player) {
  if (p.injuredForRounds > 0) return <Badge tone="danger">{t('squad.injured', { n: p.injuredForRounds })}</Badge>
  if (p.suspendedForRounds > 0) return <Badge tone="warn">{t('squad.banned', { n: p.suspendedForRounds })}</Badge>
  if (p.yellowCards > 0) return <Badge tone="muted">{t('squad.cards', { n: p.yellowCards })}</Badge>
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
  useLang()
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
      label: t('squad.nameColumn'),
      render: p => (
        <span className="inline-flex items-center gap-2">
          {p.name}
          {team.lineup.includes(p.id) && <Badge tone="accent">{t('squad.xiBadge')}</Badge>}
        </span>
      ),
    },
    { key: 'age', label: t('common.age'), mono: true, hideOnMobile: true, render: p => p.age },
    { key: 'level', label: t('common.level'), mono: true, render: p => <strong>{p.level}</strong> },
    { key: 'form', label: t('squad.formColumn'), mono: true, hideOnMobile: true, render: p => formCell(p.form) },
    {
      key: 'fit',
      label: t('squad.fitColumn'),
      mono: true,
      hideOnMobile: true,
      render: p => <span className={p.fitness < 70 ? 'text-warn' : ''}>{p.fitness}%</span>,
    },
    { key: 'status', label: t('squad.statusColumn'), render: p => statusBadge(p) },
    {
      key: 'salary',
      label: t('squad.salaryColumn'),
      mono: true,
      hideOnMobile: true,
      render: p => (
        <span className="inline-flex items-baseline gap-1">
          <MoneyText amount={p.salary} size="sm" />
          <span className="text-ink-faint">{t('squad.perWeekSuffix')}</span>
        </span>
      ),
    },
    {
      key: 'contract',
      label: t('squad.contractColumn'),
      mono: true,
      hideOnMobile: true,
      render: p => <span className={p.contractSeasons <= 1 ? 'text-warn' : ''}>{t('common.yearsShort', { n: p.contractSeasons })}</span>,
    },
    {
      key: 'value',
      label: t('squad.valueColumn'),
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
                {t('squad.listButton')}
              </Button>
              <Button variant="ghost" size="sm" aria-label={t('squad.cancelButton')} onClick={() => setSelling(null)}>
                ✕
              </Button>
            </div>
          )
        }
        return (
          <div className="flex flex-wrap items-center gap-1.5">
            {starting ? (
              <span className="text-xs text-ink-faint">{t('squad.startingTag')}</span>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                disabled={!isAvailable(p)}
                aria-label={t('squad.start')}
                title={t('squad.start')}
                onClick={() => withUserTeam((s, t) => updateTeam(s, t.id, { lineup: swapIn(t, s.players, p.id) }))}
              >
                <PlayIcon />
              </Button>
            )}
            {listed ? (
              <Badge tone="muted">{t('squad.listedBadge')}</Badge>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                aria-label={t('squad.sell')}
                title={t('squad.sell')}
                onClick={() => { setSelling(p.id); setAskingPrice(marketValue(p)) }}
              >
                <TagIcon />
              </Button>
            )}
            <ConfirmButton
              label={<ExitIcon />}
              confirmLabel={t('squad.confirmRelease', { amount: formatMoney(-severanceFor(p)) })}
              onConfirm={() => setState(s => releasePlayer(s, p.id))}
              size="sm"
              aria-label={t('squad.release')}
              title={t('squad.release')}
            />
            {p.contractSeasons <= 1 && (
              <Button
                variant="ghost"
                size="sm"
                aria-label={t('squad.renew')}
                title={t('squad.renewFor', { salary: formatMoney(renewalSalary(p)) })}
                onClick={() => setState(s => renewContract(s, p.id))}
              >
                <RenewIcon />
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
        label={t('squad.header')}
        title={team.name}
        actions={
          <>
            <select
              aria-label={t('squad.formationLabel')}
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
              aria-label={t('squad.tacticLabel')}
              value={team.tactic}
              onChange={e => {
                const tactic = e.target.value as Tactic
                withUserTeam((s, t) => updateTeam(s, t.id, { tactic }))
              }}
              className={SELECT_CLASS}
            >
              {TACTICS.map(tactic => <option key={tactic} value={tactic}>{t(TACTIC_LABEL_KEYS[tactic])}</option>)}
            </select>
            <select
              aria-label={t('squad.trainingLabel')}
              value={team.trainingStyle}
              onChange={e => {
                const trainingStyle = e.target.value as TrainingStyle
                withUserTeam((s, t) => updateTeam(s, t.id, { trainingStyle }))
              }}
              className={SELECT_CLASS}
            >
              {TRAINING_STYLES.map(style => <option key={style} value={style}>{t(TRAINING_LABEL_KEYS[style])}</option>)}
            </select>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => withUserTeam((s, t) => updateTeam(s, t.id, { lineup: autoPick(t, s.players) }))}
            >
              {t('squad.autoPick')}
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
              {t('squad.friendlies')}
            </label>
          </>
        }
      />
      <DataTable columns={columns} rows={squad} rowKey={p => p.id} groupLabel={p => p.position} />
    </div>
  )
}
