import type { Dispatch, SetStateAction } from 'react'
import { borrow, formatMoney, LOAN_CAP, MAINTENANCE_PER_SEAT, repayLoan, wageBill } from '../engine/finance'
import { EXPANSION, expandStadium, setTicketPrice } from '../engine/stadium'
import type { GameState } from '../engine/types'
import Button from '../ui/Button'
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

const ledgerColumns: Column<LedgerRow>[] = [
  { key: 'item', label: 'Item', render: r => r.label },
  { key: 'amount', label: 'Amount', align: 'right', render: r => <MoneyText amount={r.amount} signed /> },
]

export default function FinanceScreen({ state, setState }: Props) {
  const user = state.teams.find(t => t.id === state.userTeamId)!
  const ledgerRows: LedgerRow[] = state.finances.slice(-50).reverse().map((e, i) => ({ ...e, key: i }))

  return (
    <div>
      <ScreenHeader label="THE BOOKS" title="Finance" />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatChip label="Cash" value={<MoneyText amount={user.cash} />} />
        <StatChip label="Weekly wages" value={formatMoney(wageBill(user.id, state))} />
        <StatChip label="Loan" value={formatMoney(state.loanBalance)} hint={`cap ${formatMoney(LOAN_CAP)}`} />
        {state.brokeRounds > 0 && (
          <StatChip
            label="Board patience"
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
          Borrow {formatMoney(STEP)}
        </Button>
        <Button variant="ghost" disabled={state.loanBalance === 0} onClick={() => setState(s => repayLoan(s, STEP))}>
          Repay {formatMoney(STEP)}
        </Button>
      </div>

      <div className="mt-4 flex flex-col gap-4">
        <Panel label="Stadium">
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-ink-muted">Capacity</span>
              <span className="font-mono text-xs tabular-nums">{user.capacity.toLocaleString('en-US')} seats</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-muted">Fan mood</span>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-rule">
                  <div className="h-full bg-accent" style={{ width: `${user.fanMood}%` }} />
                </div>
                <span className="font-mono text-xs tabular-nums">{user.fanMood}</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-muted">Maintenance</span>
              <span className="font-mono text-xs tabular-nums">
                {formatMoney(Math.round(user.capacity * MAINTENANCE_PER_SEAT))}/wk
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-rule pt-3">
              <label htmlFor="ticket-price" className="text-ink-muted">
                Ticket price
              </label>
              <input
                id="ticket-price"
                type="number"
                min={5}
                max={60}
                value={user.ticketPrice}
                onChange={e => setState(s => setTicketPrice(s, Number(e.target.value)))}
                className="w-24 rounded-md border border-rule bg-surface px-2 py-1 text-xs font-mono"
              />
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-rule pt-3">
              {state.construction ? (
                <span className="text-sm text-ink-muted">
                  🏗 +{state.construction.addedCapacity.toLocaleString('en-US')} seats ready in{' '}
                  {state.construction.weeksLeft} week{state.construction.weeksLeft > 1 ? 's' : ''}
                </span>
              ) : (
                <Button
                  variant="primary"
                  disabled={user.cash < EXPANSION.cost}
                  onClick={() => setState(s => expandStadium(s))}
                >
                  Expand +{EXPANSION.seats.toLocaleString('en-US')} seats ({formatMoney(EXPANSION.cost)},{' '}
                  {EXPANSION.weeks} wks)
                </Button>
              )}
            </div>
          </div>
        </Panel>

        <Panel label="Ledger">
          <DataTable
            columns={ledgerColumns}
            rows={ledgerRows}
            rowKey={r => r.key}
            groupLabel={r => `S${r.season} · W${r.round}`}
            empty={<EmptyState>No transactions yet.</EmptyState>}
          />
        </Panel>
      </div>
    </div>
  )
}
