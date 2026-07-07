import type { Dispatch, SetStateAction } from 'react'
import { borrow, formatMoney, LOAN_CAP, MAINTENANCE_PER_SEAT, repayLoan, wageBill } from '../engine/finance'
import { EXPANSION, expandStadium, setTicketPrice } from '../engine/stadium'
import type { GameState } from '../engine/types'

const STEP = 100_000

interface Props {
  state: GameState
  setState: Dispatch<SetStateAction<GameState>>
}

export default function FinanceScreen({ state, setState }: Props) {
  const user = state.teams.find(t => t.id === state.userTeamId)!
  return (
    <div>
      <p>
        Cash: <strong>{formatMoney(user.cash)}</strong> · Weekly wages: {formatMoney(wageBill(user.id, state))} ·
        Loan: {formatMoney(state.loanBalance)} (cap {formatMoney(LOAN_CAP)})
      </p>
      {state.brokeRounds > 0 && (
        <p className="banner">⚠ The board is losing patience: {state.brokeRounds}/8 weeks in the red.</p>
      )}
      <div className="controls">
        <button
          disabled={state.loanBalance + STEP > LOAN_CAP}
          onClick={() => setState(s => borrow(s, STEP))}
        >
          Borrow {formatMoney(STEP)}
        </button>{' '}
        <button disabled={state.loanBalance === 0} onClick={() => setState(s => repayLoan(s, STEP))}>
          Repay {formatMoney(STEP)}
        </button>
      </div>
      <h3>Stadium</h3>
      <p>
        Capacity: <strong>{user.capacity.toLocaleString('en-US')}</strong> seats ·
        Fan mood: {user.fanMood}/100 ·
        Maintenance: {formatMoney(Math.round(user.capacity * MAINTENANCE_PER_SEAT))}/wk
      </p>
      <div className="controls">
        <label>
          Ticket price:{' '}
          <input
            type="number"
            min={5}
            max={60}
            value={user.ticketPrice}
            style={{ width: '4rem' }}
            onChange={e => {
              const price = Number(e.target.value)
              setState(s => setTicketPrice(s, price))
            }}
          />
        </label>{' '}
        {state.construction ? (
          <span>
            🏗 +{state.construction.addedCapacity.toLocaleString('en-US')} seats ready in{' '}
            {state.construction.weeksLeft} week{state.construction.weeksLeft > 1 ? 's' : ''}
          </span>
        ) : (
          <button
            disabled={user.cash < EXPANSION.cost}
            onClick={() => setState(s => expandStadium(s))}
          >
            Expand +{EXPANSION.seats.toLocaleString('en-US')} seats ({formatMoney(EXPANSION.cost)}, {EXPANSION.weeks} wks)
          </button>
        )}
      </div>
      <table>
        <thead>
          <tr><th>Season</th><th>Week</th><th>Item</th><th>Amount</th></tr>
        </thead>
        <tbody>
          {state.finances.slice(-50).reverse().map((e, i) => (
            <tr key={i}>
              <td>{e.season}</td><td>{e.round}</td><td>{e.label}</td>
              <td className={e.amount < 0 ? 'neg' : 'pos'}>{formatMoney(e.amount)}</td>
            </tr>
          ))}
          {state.finances.length === 0 && <tr><td colSpan={4}>No transactions yet.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
