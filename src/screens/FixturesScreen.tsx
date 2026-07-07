import { useState } from 'react'
import { totalRounds } from '../engine/season'
import type { Fixture, GameState } from '../engine/types'
import { eventText } from './MatchScreen'

export default function FixturesScreen({ state }: { state: GameState }) {
  const total = totalRounds(state)
  const [round, setRound] = useState(() => Math.min(Math.max(state.round - 1, 1), total))
  const [selected, setSelected] = useState<Fixture | null>(null)
  const name = (id: number) => state.teams.find(t => t.id === id)!.name
  const fixtures = state.fixtures.filter(f => f.round === round)

  return (
    <div>
      <div className="round-nav">
        <button disabled={round <= 1} onClick={() => { setRound(round - 1); setSelected(null) }}>‹</button>
        <span>Round {round}</span>
        <button disabled={round >= total} onClick={() => { setRound(round + 1); setSelected(null) }}>›</button>
      </div>
      <table>
        <tbody>
          {fixtures.map((f, i) => (
            <tr
              key={i}
              className={f === selected ? 'selected' : ''}
              onClick={() => { if (f.homeGoals !== null) setSelected(f === selected ? null : f) }}
              style={{ cursor: f.homeGoals !== null ? 'pointer' : 'default' }}
            >
              <td className="home">{name(f.homeId)}</td>
              <td>{f.homeGoals === null ? 'vs' : `${f.homeGoals} – ${f.awayGoals}`}</td>
              <td>{name(f.awayId)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {selected && fixtures.includes(selected) && (
        <div className="report">
          <h3>{name(selected.homeId)} {selected.homeGoals} – {selected.awayGoals} {name(selected.awayId)}</h3>
          <ul className="ticker">
            {(selected.events ?? []).map((e, i) => (
              <li key={i}>
                <strong>{e.minute}'</strong> {eventText(e, state)} <em>({name(e.teamId)})</em>
              </li>
            ))}
            {(selected.events ?? []).length === 0 && <li>No report available for this match.</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
