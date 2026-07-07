import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { formatMoney } from '../engine/finance'
import { acceptOffer, counterOffer, placeBid, rejectOffer, requiredBid } from '../engine/transfers'
import type { GameState } from '../engine/types'

interface Props {
  state: GameState
  setState: Dispatch<SetStateAction<GameState>>
}

export default function TransfersScreen({ state, setState }: Props) {
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const name = (id: number) => state.teams.find(t => t.id === id)!.name
  const user = state.teams.find(t => t.id === state.userTeamId)!

  return (
    <div>
      <h3>Offers for your players</h3>
      {state.incomingOffers.length === 0 && <p>No offers on the table.</p>}
      {state.incomingOffers.map(o => {
        const p = state.players[o.playerId]
        return (
          <p key={`${o.playerId}-${o.bidderTeamId}`} className="offer">
            {name(o.bidderTeamId)} offer <strong>{formatMoney(o.amount)}</strong> for {p.name} ({p.position} {p.level})
            — expires in {o.roundsLeft} round{o.roundsLeft > 1 ? 's' : ''}{' '}
            <button onClick={() => setState(s => acceptOffer(s, o.playerId, o.bidderTeamId))}>Accept</button>{' '}
            <button onClick={() => setState(s => counterOffer(s, o.playerId, o.bidderTeamId))}>
              Counter (list at {formatMoney(Math.round(o.amount * 1.2))})
            </button>{' '}
            <button onClick={() => setState(s => rejectOffer(s, o.playerId, o.bidderTeamId))}>Reject</button>
          </p>
        )
      })}

      <h3>Transfer list — your cash: {formatMoney(user.cash)}</h3>
      <table>
        <thead>
          <tr>
            <th>Player</th><th>Pos</th><th>Lvl</th><th>Age</th><th>Seller</th>
            <th>Min price</th><th>Top bid</th><th>Ends</th><th></th>
          </tr>
        </thead>
        <tbody>
          {state.transferList.map(l => {
            const p = state.players[l.playerId]
            const mine = l.sellerTeamId === state.userTeamId
            const leading = l.currentBidderId === state.userTeamId
            const floor = requiredBid(l)
            return (
              <tr key={l.playerId} className={mine ? 'user' : ''}>
                <td>{p.name}</td><td>{p.position}</td><td>{p.level}</td><td>{p.age}</td>
                <td>{name(l.sellerTeamId)}</td>
                <td>{formatMoney(l.minPrice)}</td>
                <td>{l.currentBid === null ? '—' : `${formatMoney(l.currentBid)} (${name(l.currentBidderId!)})`}</td>
                <td>{l.roundsLeft}</td>
                <td>
                  {mine ? 'your listing' : leading ? 'you lead' : (
                    <>
                      <input
                        type="number"
                        style={{ width: '7rem' }}
                        value={drafts[l.playerId] ?? floor}
                        onChange={e => setDrafts({ ...drafts, [l.playerId]: e.target.value })}
                      />
                      <button
                        disabled={floor > user.cash}
                        onClick={() => setState(s => placeBid(s, l.playerId, Number(drafts[l.playerId] ?? floor)))}
                      >
                        Bid
                      </button>
                    </>
                  )}
                </td>
              </tr>
            )
          })}
          {state.transferList.length === 0 && (
            <tr><td colSpan={9}>Nobody is for sale this week.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
