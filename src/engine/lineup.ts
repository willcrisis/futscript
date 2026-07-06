import { FORMATIONS, type GameState, type Player, type Position, type Team } from './types'

export function isAvailable(p: Player): boolean {
  return p.injuredForRounds === 0 && p.suspendedForRounds === 0
}

export function autoPick(team: Team, players: Record<number, Player>): number[] {
  const squad = team.playerIds.map(id => players[id]).filter(isAvailable)
  const lineup: number[] = []
  for (const [position, count] of Object.entries(FORMATIONS[team.formation])) {
    const best = squad
      .filter(p => p.position === position)
      .sort((a, b) => b.level - a.level)
      .slice(0, count)
    lineup.push(...best.map(p => p.id))
  }
  // ponytail: a dried-up position group is filled by the best available anyone —
  // no out-of-position penalty; the wrong shape is penalty enough
  if (lineup.length < 11) {
    const rest = squad
      .filter(p => !lineup.includes(p.id))
      .sort((a, b) => b.level - a.level)
    lineup.push(...rest.slice(0, 11 - lineup.length).map(p => p.id))
  }
  return lineup
}

// Repair the user's hand-picked lineup: keep available starters,
// fill holes with the best available bench player (same position first).
export function patchLineup(team: Team, players: Record<number, Player>): number[] {
  const kept = team.lineup.filter(id => isAvailable(players[id]))
  if (kept.length === 11) return kept
  const bench = team.playerIds
    .map(id => players[id])
    .filter(p => isAvailable(p) && !kept.includes(p.id))
    .sort((a, b) => b.level - a.level)
  const counts: Record<Position, number> = { GK: 0, DF: 0, MF: 0, FW: 0 }
  for (const id of kept) counts[players[id].position]++
  const lineup = [...kept]
  for (const [position, needed] of Object.entries(FORMATIONS[team.formation]) as [Position, number][]) {
    const fill = bench
      .filter(p => p.position === position && !lineup.includes(p.id))
      .slice(0, Math.max(0, needed - counts[position]))
    lineup.push(...fill.map(p => p.id))
  }
  if (lineup.length < 11) {
    const rest = bench.filter(p => !lineup.includes(p.id))
    lineup.push(...rest.slice(0, 11 - lineup.length).map(p => p.id))
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
