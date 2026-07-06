import { FORMATIONS, type GameState, type Player, type Position, type Team } from './types'

export function autoPick(team: Team, players: Record<number, Player>): number[] {
  const squad = team.playerIds.map(id => players[id])
  const lineup: number[] = []
  for (const [position, count] of Object.entries(FORMATIONS[team.formation])) {
    const best = squad
      .filter(p => p.position === position)
      .sort((a, b) => b.level - a.level)
      .slice(0, count)
    lineup.push(...best.map(p => p.id))
  }
  return lineup
}

// ponytail: bench player always replaces the WEAKEST same-position starter;
// free slot-choice UI can come later if this annoys anyone
export function swapIn(team: Team, players: Record<number, Player>, benchPlayerId: number): number[] {
  const bench = players[benchPlayerId]
  const weakest = team.lineup
    .map(id => players[id])
    .filter(p => p.position === bench.position)
    .sort((a, b) => a.level - b.level)[0]
  return team.lineup.map(id => (id === weakest.id ? benchPlayerId : id))
}

export function updateTeam(state: GameState, teamId: number, patch: Partial<Team>): GameState {
  return { ...state, teams: state.teams.map(t => (t.id === teamId ? { ...t, ...patch } : t)) }
}
