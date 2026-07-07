import type { GameState } from '../engine/types'

export default function HistoryScreen({ state }: { state: GameState }) {
  const userName = state.teams.find(t => t.id === state.userTeamId)!.name
  const titles = state.history.filter(h => h.champions[0] === userName).length
  const cups = state.history.filter(h => h.cupWinner === userName).length
  if (state.history.length === 0) {
    return <p>No completed seasons yet — history is written at each season's end.</p>
  }
  return (
    <div>
      <p>
        Your honours: <strong>{titles}</strong> Division 1 title{titles === 1 ? '' : 's'} ·{' '}
        <strong>{cups}</strong> cup{cups === 1 ? '' : 's'}
      </p>
      <table>
        <thead>
          <tr><th>Season</th><th>D1 champions</th><th>Cup winners</th><th>Top scorer</th><th>Your finish</th></tr>
        </thead>
        <tbody>
          {state.history.slice().reverse().map(h => (
            <tr key={h.season}>
              <td>{h.season}</td>
              <td>{h.champions[0] ?? '—'}</td>
              <td>{h.cupWinner}</td>
              <td>{h.topScorer.player} ({h.topScorer.goals}) — {h.topScorer.team}</td>
              <td>Division {h.userDivision}, P{h.userPosition}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
