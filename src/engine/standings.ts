import type { GameState } from './types'

export interface Standing {
  teamId: number
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  points: number
}

export function standings(state: GameState): Standing[] {
  const rows = new Map<number, Standing>()
  for (const t of state.teams) {
    rows.set(t.id, {
      teamId: t.id, played: 0, won: 0, drawn: 0, lost: 0,
      goalsFor: 0, goalsAgainst: 0, points: 0,
    })
  }
  for (const f of state.fixtures) {
    if (f.homeGoals === null || f.awayGoals === null) continue
    const h = rows.get(f.homeId)!
    const a = rows.get(f.awayId)!
    h.played++; a.played++
    h.goalsFor += f.homeGoals; h.goalsAgainst += f.awayGoals
    a.goalsFor += f.awayGoals; a.goalsAgainst += f.homeGoals
    if (f.homeGoals > f.awayGoals) { h.won++; h.points += 3; a.lost++ }
    else if (f.homeGoals < f.awayGoals) { a.won++; a.points += 3; h.lost++ }
    else { h.drawn++; a.drawn++; h.points++; a.points++ }
  }
  return [...rows.values()].sort(
    (x, y) =>
      y.points - x.points ||
      (y.goalsFor - y.goalsAgainst) - (x.goalsFor - x.goalsAgainst) ||
      y.goalsFor - x.goalsFor,
  )
}
