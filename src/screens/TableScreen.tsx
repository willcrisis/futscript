import { useState } from 'react'
import { standings } from '../engine/standings'
import type { GameState } from '../engine/types'

export default function TableScreen({ state }: { state: GameState }) {
  const userDivision = state.teams.find(t => t.id === state.userTeamId)!.division
  const [division, setDivision] = useState(userDivision)
  const divisions = [...new Set(state.teams.map(t => t.division))].sort()
  const rows = standings(state, division)
  const name = (id: number) => state.teams.find(t => t.id === id)!.name
  return (
    <div>
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
        <thead>
          <tr>
            <th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th>
            <th>GF</th><th>GA</th><th>GD</th><th>Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.teamId} className={r.teamId === state.userTeamId ? 'user' : ''}>
              <td>{i + 1}</td>
              <td>{name(r.teamId)}</td>
              <td>{r.played}</td><td>{r.won}</td><td>{r.drawn}</td><td>{r.lost}</td>
              <td>{r.goalsFor}</td><td>{r.goalsAgainst}</td>
              <td>{r.goalsFor - r.goalsAgainst}</td>
              <td><strong>{r.points}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
