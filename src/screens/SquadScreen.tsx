import type { Dispatch, SetStateAction } from 'react'
import { autoPick, swapIn, updateTeam } from '../engine/lineup'
import { FORMATIONS, type FormationName, type GameState, type Position } from '../engine/types'

const ORDER: Position[] = ['GK', 'DF', 'MF', 'FW']

interface Props {
  state: GameState
  setState: Dispatch<SetStateAction<GameState>>
}

export default function SquadScreen({ state, setState }: Props) {
  const team = state.teams.find(t => t.id === state.userTeamId)!
  const squad = team.playerIds
    .map(id => state.players[id])
    .sort((a, b) => ORDER.indexOf(a.position) - ORDER.indexOf(b.position) || b.level - a.level)

  const withUserTeam = (fn: (s: GameState, t: typeof team) => GameState) =>
    setState(s => fn(s, s.teams.find(t => t.id === s.userTeamId)!))

  return (
    <div>
      <div className="controls">
        <label>
          Formation:{' '}
          <select
            value={team.formation}
            onChange={e => {
              const formation = e.target.value as FormationName
              withUserTeam((s, t) => {
                const next = { ...t, formation }
                return updateTeam(s, t.id, { formation, lineup: autoPick(next, s.players) })
              })
            }}
          >
            {Object.keys(FORMATIONS).map(f => <option key={f}>{f}</option>)}
          </select>
        </label>{' '}
        <button onClick={() => withUserTeam((s, t) => updateTeam(s, t.id, { lineup: autoPick(t, s.players) }))}>
          Auto-pick
        </button>
      </div>
      <table>
        <thead>
          <tr><th>Pos</th><th>Name</th><th>Age</th><th>Level</th><th></th></tr>
        </thead>
        <tbody>
          {squad.map(p => {
            const starting = team.lineup.includes(p.id)
            return (
              <tr key={p.id} className={starting ? 'starting' : ''}>
                <td>{p.position}</td>
                <td>{p.name}</td>
                <td>{p.age}</td>
                <td>{p.level}</td>
                <td>
                  {starting
                    ? 'Starting'
                    : <button onClick={() => withUserTeam((s, t) => updateTeam(s, t.id, { lineup: swapIn(t, s.players, p.id) }))}>
                        Start
                      </button>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
