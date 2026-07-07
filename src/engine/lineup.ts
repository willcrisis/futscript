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

function positionCounts(ids: number[], players: Record<number, Player>): Record<Position, number> {
  const counts: Record<Position, number> = { GK: 0, DF: 0, MF: 0, FW: 0 }
  for (const id of ids) counts[players[id].position]++
  return counts
}

function matchesShape(
  ids: number[],
  players: Record<number, Player>,
  formation: Record<Position, number>,
): boolean {
  const counts = positionCounts(ids, players)
  return (Object.keys(formation) as Position[]).every(pos => counts[pos] === formation[pos])
}

// Swap available bench players into position groups that are under the
// formation's target count, displacing the weakest starter from a group
// that's over target (a prior back-fill always leaves one over, since the
// total stays at 11). Gives up gracefully on a position it can't fix — no
// bench player of that position, or no over-target group left to raid —
// leaving the caller with the best-effort shape.
function reshapeToFormation(
  lineup: number[],
  bench: Player[], // available, not already in lineup, sorted best level first
  players: Record<number, Player>,
  formation: Record<Position, number>,
): number[] {
  let result = [...lineup]
  for (const position of Object.keys(formation) as Position[]) {
    const needed = formation[position]
    while (positionCounts(result, players)[position] < needed) {
      const counts = positionCounts(result, players)
      const candidate = bench.find(p => p.position === position && !result.includes(p.id))
      if (!candidate) break // no available bench player of this position
      const overTarget = (Object.keys(formation) as Position[]).filter(p => counts[p] > formation[p])
      const weakest = result
        .map(id => players[id])
        .filter(p => overTarget.includes(p.position))
        .sort((a, b) => a.level - b.level)[0]
      if (!weakest) break // nothing spare to drop for this position
      result = result.map(id => (id === weakest.id ? candidate.id : id))
    }
  }
  return result
}

// Repair the user's hand-picked lineup: keep available starters, fill holes
// with the best available bench player (same position first), then reshape
// to the formation's position counts in case a stale back-fill (from an
// earlier hole) left the XI complete but lopsided — e.g. both GKs recovered
// but an outfielder is still deputizing in goal.
export function patchLineup(team: Team, players: Record<number, Player>): number[] {
  const formation = FORMATIONS[team.formation]
  const kept = team.lineup.filter(id => isAvailable(players[id]))
  if (kept.length === 11 && matchesShape(kept, players, formation)) return kept

  const bench = team.playerIds
    .map(id => players[id])
    .filter(p => isAvailable(p) && !kept.includes(p.id))
    .sort((a, b) => b.level - a.level)

  let lineup = [...kept]
  if (lineup.length < 11) {
    const counts = positionCounts(lineup, players)
    for (const [position, needed] of Object.entries(formation) as [Position, number][]) {
      const fill = bench
        .filter(p => p.position === position && !lineup.includes(p.id))
        .slice(0, Math.max(0, needed - counts[position]))
      lineup.push(...fill.map(p => p.id))
    }
    if (lineup.length < 11) {
      const rest = bench.filter(p => !lineup.includes(p.id))
      lineup.push(...rest.slice(0, 11 - lineup.length).map(p => p.id))
    }
  }

  return reshapeToFormation(lineup, bench, players, formation)
}

// ponytail: bench player always replaces the WEAKEST same-position starter;
// if the lineup holds none of that position (a back-filled hole), replace the
// weakest starter overall instead so a recovered player can always come on.
// Free slot-choice UI can come later if this annoys anyone.
export function swapIn(team: Team, players: Record<number, Player>, benchPlayerId: number): number[] {
  const bench = players[benchPlayerId]
  const starters = team.lineup.map(id => players[id])
  const samePosition = starters.filter(p => p.position === bench.position).sort((a, b) => a.level - b.level)
  const weakest = samePosition[0] ?? [...starters].sort((a, b) => a.level - b.level)[0]
  return team.lineup.map(id => (id === weakest.id ? benchPlayerId : id))
}

export function updateTeam(state: GameState, teamId: number, patch: Partial<Team>): GameState {
  return { ...state, teams: state.teams.map(t => (t.id === teamId ? { ...t, ...patch } : t)) }
}
