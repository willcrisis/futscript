import { useState } from 'react'
import { totalRounds } from '../engine/season'
import type { Fixture, GameState } from '../engine/types'
import { eventText } from './MatchScreen'

export default function FixturesScreen({ state }: { state: GameState }) {
  const total = totalRounds(state)
  const [round, setRound] = useState(() => Math.min(Math.max(state.round - 1, 1), total))
  const [selected, setSelected] = useState<Fixture | null>(null)
  const name = (id: number) => state.teams.find(t => t.id === id)!.name
  const userDivision = state.teams.find(t => t.id === state.userTeamId)!.division
  const [division, setDivision] = useState(userDivision)
  const divisions = [...new Set(state.teams.map(t => t.division))].sort()
  const divisionOf = (teamId: number) => state.teams.find(t => t.id === teamId)!.division
  const fixtures = state.fixtures.filter(f => f.round === round && divisionOf(f.homeId) === division)

  return (
    <div>
      <div className="round-nav">
        <button disabled={round <= 1} onClick={() => { setRound(round - 1); setSelected(null) }}>‹</button>
        <span>Week {round}</span>
        <button disabled={round >= total} onClick={() => { setRound(round + 1); setSelected(null) }}>›</button>
      </div>
      {divisions.length > 1 && (
        <div className="controls">
          <label>
            Division:{' '}
            <select value={division} onChange={e => setDivision(Number(e.target.value))}>
              {divisions.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
        </div>
      )}
      <table>
        <tbody>
          {fixtures.length === 0 && (
            <tr><td colSpan={3}>Cup week — see the Cup tab.</td></tr>
          )}
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
