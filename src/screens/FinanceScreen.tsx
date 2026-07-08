import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { borrow, formatMoney, LOAN_CAP, MAINTENANCE_PER_SEAT, repayLoan, wageBill } from '../engine/finance'
import { EXPANSION, expandStadium, setTicketPrice } from '../engine/stadium'
import type { FinanceEntry, GameState } from '../engine/types'
import { t, useLang } from '../i18n'
import type { TranslationKey } from '../i18n'
import { describeLedger } from '../i18n/ledger'
import type { LedgerCategory } from '../i18n/ledger'
import Button from '../ui/Button'
import ConfirmButton from '../ui/ConfirmButton'
import DataTable from '../ui/DataTable'
import type { Column } from '../ui/DataTable'
import EmptyState from '../ui/EmptyState'
import MoneyText from '../ui/MoneyText'
import Panel from '../ui/Panel'
import ScreenHeader from '../ui/ScreenHeader'
import StatChip from '../ui/StatChip'

const STEP = 100_000

interface Props {
  state: GameState
  setState: Dispatch<SetStateAction<GameState>>
}

interface LedgerRow {
  key: number
  season: number
  round: number
  label: string
  amount: number
}

const CATEGORY_KEYS: Record<LedgerCategory, TranslationKey> = {
  gate: 'category.gate',
  sponsors: 'category.sponsors',
  prize: 'category.prize',
  wages: 'category.wages',
  maintenance: 'category.maintenance',
  interest: 'category.interest',
  loan: 'category.loan',
  transfers: 'category.transfers',
  stadium: 'category.stadium',
  other: 'category.other',
}

export interface CategoryTotal {
  category: LedgerCategory
  total: number
}

/** Group a week's ledger entries by their display category, income-first by absolute size. */
export function summarizeByCategory(entries: FinanceEntry[]): CategoryTotal[] {
  const totals = new Map<LedgerCategory, number>()
  for (const e of entries) {
    const { category } = describeLedger(e.label)
    totals.set(category, (totals.get(category) ?? 0) + e.amount)
  }
  return [...totals.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => {
      const aIsIncome = a.total > 0 ? 0 : 1
      const bIsIncome = b.total > 0 ? 0 : 1
      return aIsIncome !== bIsIncome ? aIsIncome - bIsIncome : Math.abs(b.total) - Math.abs(a.total)
    })
}

export default function FinanceScreen({ state, setState }: Props) {
  useLang()
  const user = state.teams.find(t => t.id === state.userTeamId)!
  const ledgerRows: LedgerRow[] = state.finances.slice(-50).reverse().map((e, i) => ({ ...e, key: i }))
  const [showLedger, setShowLedger] = useState(false)
  const ledgerColumns: Column<LedgerRow>[] = [
    { key: 'item', label: t('finance.itemColumn'), render: r => describeLedger(r.label).text },
    { key: 'amount', label: t('finance.amountColumn'), align: 'right', render: r => <MoneyText amount={r.amount} signed /> },
  ]

  // "This week" = the last played week's entries, matching HomeScreen's weekDelta scoping.
  const lastWeekPlayed = state.round - 1
  const weekEntries = state.finances.filter(e => e.season === state.season && e.round === lastWeekPlayed)
  const income = weekEntries.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0)
  const expenses = weekEntries.filter(e => e.amount < 0).reduce((s, e) => s + e.amount, 0)
  const net = income + expenses
  const categoryTotals = summarizeByCategory(weekEntries)
  const hasGate = categoryTotals.some(c => c.category === 'gate')
  // gate receipts only come from home matches (league or cup) — read the user's fixtures for the week
  const hadHomeMatch =
    state.fixtures.some(f => f.round === lastWeekPlayed && f.homeId === user.id && f.homeGoals !== null) ||
    state.cupFixtures.some(f => f.week === lastWeekPlayed && f.homeId === user.id && f.homeGoals !== null)

  return (
    <div>
      <ScreenHeader label={t('finance.header')} title={t('finance.title')} />

      <Panel label={t('finance.thisWeek')} className="mb-4">
        {weekEntries.length === 0 ? (
          <EmptyState>{t('finance.noWeekYet')}</EmptyState>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <StatChip label={t('finance.income')} value={<MoneyText amount={income} />} />
              <StatChip label={t('finance.expenses')} value={<MoneyText amount={expenses} />} />
              <StatChip label={t('finance.net')} value={<MoneyText amount={net} signed />} />
            </div>
            <div className="mt-4 flex flex-col gap-1.5 border-t border-rule pt-3 text-sm">
              {categoryTotals.map(c => (
                <div key={c.category} className="flex items-center justify-between">
                  <span className="text-ink-muted">
                    {t(CATEGORY_KEYS[c.category])}
                    {c.category === 'gate' && <span className="ml-1.5 text-ink-faint">· {t('finance.gateHint')}</span>}
                  </span>
                  <MoneyText amount={c.total} signed />
                </div>
              ))}
              {!hasGate && !hadHomeMatch && (
                <div className="flex items-center justify-between">
                  <span className="text-ink-muted">{t('category.gate')}</span>
                  <span className="text-xs text-ink-faint">{t('finance.awayWeek')}</span>
                </div>
              )}
            </div>
          </>
        )}
      </Panel>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatChip label={t('finance.cash')} value={<MoneyText amount={user.cash} />} />
        <StatChip label={t('finance.weeklyWages')} value={formatMoney(wageBill(user.id, state))} />
        <StatChip
          label={t('finance.loan')}
          value={formatMoney(state.loanBalance)}
          hint={t('finance.loanCapHint', { amount: formatMoney(LOAN_CAP) })}
        />
        {state.brokeRounds > 0 && (
          <StatChip
            label={t('finance.boardPatience')}
            value={
              state.brokeRounds >= 6
                ? <span className="text-danger">{state.brokeRounds}/8</span>
                : `${state.brokeRounds}/8`
            }
          />
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="ghost"
          disabled={state.loanBalance + STEP > LOAN_CAP}
          onClick={() => setState(s => borrow(s, STEP))}
        >
          {t('finance.borrowButton', { amount: formatMoney(STEP) })}
        </Button>
        <Button variant="ghost" disabled={state.loanBalance === 0} onClick={() => setState(s => repayLoan(s, STEP))}>
          {t('finance.repayButton', { amount: formatMoney(STEP) })}
        </Button>
      </div>

      <div className="mt-4 flex flex-col gap-4">
        <Panel label={t('finance.stadium')}>
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-ink-muted">{t('finance.capacity')}</span>
              <span className="font-mono text-xs tabular-nums">
                {t('finance.seatsValue', { n: user.capacity.toLocaleString('en-US') })}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-muted">{t('finance.fanMood')}</span>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-rule">
                  <div className="h-full bg-accent" style={{ width: `${user.fanMood}%` }} />
                </div>
                <span className="font-mono text-xs tabular-nums">{user.fanMood}</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-muted">{t('finance.maintenance')}</span>
              <span className="font-mono text-xs tabular-nums">
                {formatMoney(Math.round(user.capacity * MAINTENANCE_PER_SEAT))}{t('finance.perWeekSuffix')}
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-rule pt-3">
              <label htmlFor="ticket-price" className="text-ink-muted">
                {t('finance.ticketPrice')}
              </label>
              <input
                id="ticket-price"
                type="number"
                min={5}
                max={60}
                value={user.ticketPrice}
                onChange={e => setState(s => setTicketPrice(s, Number(e.target.value)))}
                className="w-24 rounded-md border border-rule bg-surface px-2 py-1 text-xs font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              />
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-rule pt-3">
              {state.construction ? (
                <span className="text-sm text-ink-muted">
                  {t('finance.constructionReady', {
                    seats: state.construction.addedCapacity.toLocaleString('en-US'),
                    weeks: state.construction.weeksLeft,
                  })}
                </span>
              ) : (
                <ConfirmButton
                  label={t('finance.expandButton', {
                    seats: EXPANSION.seats.toLocaleString('en-US'),
                    cost: formatMoney(EXPANSION.cost),
                    weeks: EXPANSION.weeks,
                  })}
                  confirmLabel={t('finance.expandConfirm', { amount: formatMoney(EXPANSION.cost) })}
                  onConfirm={() => setState(s => expandStadium(s))}
                  disabled={user.cash < EXPANSION.cost}
                />
              )}
            </div>
          </div>
        </Panel>

        <Panel
          label={t('finance.ledger')}
          action={
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={showLedger}
              onClick={() => setShowLedger(v => !v)}
            >
              {showLedger ? t('finance.hideDetails') : t('finance.showDetails')}
            </Button>
          }
        >
          {showLedger && (
            <DataTable
              columns={ledgerColumns}
              rows={ledgerRows}
              rowKey={r => r.key}
              groupLabel={r => t('shell.seasonWeek', { season: r.season, week: r.round })}
              empty={<EmptyState>{t('finance.noTransactions')}</EmptyState>}
            />
          )}
        </Panel>
      </div>
    </div>
  )
}
