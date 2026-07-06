import { useState } from 'react'
import { totalRounds } from '../engine/season'
import type { GameState } from '../engine/types'

export default function FixturesScreen({ state }: { state: GameState }) {
  const total = totalRounds(state)
  const [round, setRound] = useState(() => Math.min(Math.max(state.round - 1, 1), total))
  const name = (id: number) => state.teams.find(t => t.id === id)!.name
  const fixtures = state.fixtures.filter(f => f.round === round)
  return (
    <div>
      <div className="round-nav">
        <button disabled={round <= 1} onClick={() => setRound(round - 1)}>‹</button>
        <span>Round {round}</span>
        <button disabled={round >= total} onClick={() => setRound(round + 1)}>›</button>
      </div>
      <table>
        <tbody>
          {fixtures.map((f, i) => (
            <tr key={i}>
              <td className="home">{name(f.homeId)}</td>
              <td>{f.homeGoals === null ? 'vs' : `${f.homeGoals} – ${f.awayGoals}`}</td>
              <td>{name(f.awayId)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
