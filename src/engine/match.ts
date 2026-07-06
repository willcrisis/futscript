import type { Player, Team } from './types'

export function teamStrength(team: Team, players: Record<number, Player>): number {
  return team.lineup.reduce((sum, id) => sum + players[id].level, 0)
}

// Knuth's method — fine for lambda < ~10
function poisson(lambda: number, rand: () => number): number {
  const limit = Math.exp(-lambda)
  let k = 0
  let p = 1
  do {
    k++
    p *= rand()
  } while (p > limit)
  return k - 1
}

const AVG_TOTAL_GOALS = 2.7

// ponytail: whole-team strength ratio, squared to reward quality gaps.
// Attack/defense split, home advantage, and form arrive in Phase 2.
export function simulateMatch(
  home: Team,
  away: Team,
  players: Record<number, Player>,
  rand: () => number,
): { homeGoals: number; awayGoals: number } {
  const sh = teamStrength(home, players) ** 2
  const sa = teamStrength(away, players) ** 2
  const homeShare = sh / (sh + sa)
  return {
    homeGoals: poisson(AVG_TOTAL_GOALS * homeShare, rand),
    awayGoals: poisson(AVG_TOTAL_GOALS * (1 - homeShare), rand),
  }
}
