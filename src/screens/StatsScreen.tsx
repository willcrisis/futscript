import type { GameState } from '../engine/types'

export default function StatsScreen({ state }: { state: GameState }) {
  const teamOf = (playerId: number) => state.teams.find(t => t.playerIds.includes(playerId))?.name ?? '—'
  const thisSeason = Object.values(state.players)
    .filter(p => p.seasonGoals > 0)
    .sort((a, b) => b.seasonGoals - a.seasonGoals)
    .slice(0, 15)
  return (
    <div>
      <h3>Top scorers — this season</h3>
      {thisSeason.length === 0 && <p>No goals yet.</p>}
      {thisSeason.length > 0 && (
        <table>
          <thead>
            <tr><th>#</th><th>Player</th><th>Club</th><th>Goals</th></tr>
          </thead>
          <tbody>
            {thisSeason.map((p, i) => (
              <tr key={p.id}>
                <td>{i + 1}</td><td>{p.name}</td><td>{teamOf(p.id)}</td><td><strong>{p.seasonGoals}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h3>All-time top scorers</h3>
      {state.allTimeScorers.length === 0 && <p>The record books open at the end of the first season.</p>}
      {state.allTimeScorers.length > 0 && (
        <table>
          <thead>
            <tr><th>#</th><th>Player</th><th>Last club</th><th>Goals</th></tr>
          </thead>
          <tbody>
            {state.allTimeScorers.slice(0, 20).map((e, i) => (
              <tr key={e.playerId}>
                <td>{i + 1}</td><td>{e.player}</td><td>{e.team}</td><td><strong>{e.goals}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
