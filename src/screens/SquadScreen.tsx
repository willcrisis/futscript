import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { formatMoney, marketValue, severanceFor } from '../engine/finance'
import { autoPick, isAvailable, toggleStarter, updateTeam } from '../engine/lineup'
import { delistPlayer, listPlayer, releasePlayer, renewalSalary, renewContract } from '../engine/transfers'
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
import Button from '../ui/Button'
import ConfirmButton from '../ui/ConfirmButton'
import DataTable from '../ui/DataTable'
import type { Column } from '../ui/DataTable'
import { DelistIcon, ExitIcon, MinusIcon, PlayIcon, PlusIcon, RenewIcon, TagIcon, YellowCardIcon } from '../ui/icons'
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

export function statusKind(p: Player): 'injured' | 'suspended' | 'cards' | null {
  if (p.injuredForRounds > 0) return 'injured'
  if (p.suspendedForRounds > 0) return 'suspended'
  if (p.yellowCards > 0) return 'cards'
  return null
}

function statusCell(p: Player) {
  const kind = statusKind(p)
  if (kind === 'injured') return (
    <span className="inline-flex items-center gap-1 text-danger" title={t('squad.injured', { n: p.injuredForRounds })}>
      <PlusIcon className="size-3.5" />{t('common.weeksShort', { n: p.injuredForRounds })}
    </span>
  )
  if (kind === 'suspended') return (
    <span className="inline-flex items-center gap-1 text-warn" title={t('squad.banned', { n: p.suspendedForRounds })}>
      <MinusIcon className="size-3.5" />{t('common.weeksShort', { n: p.suspendedForRounds })}
    </span>
  )
  if (kind === 'cards') return (
    <span className="inline-flex items-center gap-1" title={t('squad.cards', { n: p.yellowCards })}>
      <YellowCardIcon />{p.yellowCards}
    </span>
  )
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
          {team.lineup.includes(p.id) && (
            <span className="size-2 shrink-0 rounded-full bg-accent" aria-label={t('squad.startingXi')} title={t('squad.startingXi')} />
          )}
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
    { key: 'status', label: t('squad.statusColumn'), render: p => statusCell(p) },
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
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={starting}
              disabled={!starting && !isAvailable(p)}
              aria-label={starting ? t('squad.bench') : t('squad.start')}
              title={starting ? t('squad.bench') : t('squad.start')}
              className={starting ? 'border-accent! text-accent-strong!' : ''}
              onClick={() => withUserTeam((s, t) => updateTeam(s, t.id, { lineup: toggleStarter(t, p.id) }))}
            >
              <PlayIcon />
            </Button>
            {listed ? (
              <Button
                variant="ghost"
                size="sm"
                aria-label={t('squad.delist')}
                title={t('squad.delist')}
                onClick={() => setState(s => delistPlayer(s, p.id))}
              >
                <DelistIcon />
              </Button>
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
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{t('squad.formation')}</span>
              <select
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
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{t('squad.tactic')}</span>
              <select
                value={team.tactic}
                onChange={e => {
                  const tactic = e.target.value as Tactic
                  withUserTeam((s, t) => updateTeam(s, t.id, { tactic }))
                }}
                className={SELECT_CLASS}
              >
                {TACTICS.map(tactic => <option key={tactic} value={tactic}>{t(TACTIC_LABEL_KEYS[tactic])}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{t('squad.training')}</span>
              <select
                value={team.trainingStyle}
                onChange={e => {
                  const trainingStyle = e.target.value as TrainingStyle
                  withUserTeam((s, t) => updateTeam(s, t.id, { trainingStyle }))
                }}
                className={SELECT_CLASS}
              >
                {TRAINING_STYLES.map(style => <option key={style} value={style}>{t(TRAINING_LABEL_KEYS[style])}</option>)}
              </select>
            </label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => withUserTeam((s, t) => updateTeam(s, t.id, { lineup: autoPick(t, s.players) }))}
            >
              {t('squad.autoPick')}
            </Button>
            <label className="flex items-center gap-1.5 text-sm" title={t('squad.friendliesHint')}>
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
