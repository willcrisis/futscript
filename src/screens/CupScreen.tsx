import { useState } from 'react'
import { CUP_WEEKS } from '../engine/fixtures'
import type { CupFixture, GameState } from '../engine/types'
import { eventText } from './MatchScreen'

const ROUND_NAMES = ['Round 1', 'Round 2', 'Round of 16', 'Quarter-finals', 'Semi-finals', 'Final']

export default function CupScreen({ state }: { state: GameState }) {
  const [selected, setSelected] = useState<CupFixture | null>(null)
  const name = (id: number) => state.teams.find(t => t.id === id)!.name
  if (state.cupFixtures.length === 0) return <p>No cup this season.</p>
  const rounds = [...new Set(state.cupFixtures.map(f => f.cupRound))].sort((a, b) => a - b)
  const final = state.cupFixtures.reduce((a, b) => (b.cupRound > a.cupRound ? b : a))
  const champion =
    final.cupRound === CUP_WEEKS.length && final.winnerId !== null ? name(final.winnerId) : null
  return (
    <div>
      {champion && <div className="banner">🏆 {champion} win the Cup!</div>}
      {rounds.map(r => (
        <div key={r}>
          <h3>{ROUND_NAMES[r - 1]} — week {CUP_WEEKS[r - 1]}</h3>
          <table>
            <tbody>
              {state.cupFixtures.filter(f => f.cupRound === r).map((f, i) => (
                <tr
                  key={i}
                  className={[f.homeId, f.awayId].includes(state.userTeamId) ? 'user' : ''}
                  onClick={() => { if (f.homeGoals === null) return; setSelected(f !== selected ? f : null) }}
                  style={{ cursor: f.homeGoals !== null ? 'pointer' : 'default' }}
                >
                  <td className="home">{name(f.homeId)}</td>
                  <td>
                    {f.homeGoals === null ? 'vs' : `${f.homeGoals} – ${f.awayGoals}`}
                    {f.winnerId !== null && f.homeGoals === f.awayGoals ? ' (p)' : ''}
                  </td>
                  <td>{name(f.awayId)}</td>
                  <td>{f.winnerId === null ? '' : `${name(f.winnerId)} through`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {selected && (
        <div className="report">
          <h3>{name(selected.homeId)} {selected.homeGoals} – {selected.awayGoals} {name(selected.awayId)}</h3>
          <ul className="ticker">
            {(selected.events ?? []).map((e, i) => (
              <li key={i}><strong>{e.minute}'</strong> {eventText(e, state)} <em>({name(e.teamId)})</em></li>
            ))}
            {(selected.events ?? []).length === 0 && <li>No report available for this match.</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
