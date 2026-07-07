import type { Fixture } from './types'

// 30 league rounds + 6 cup weeks = a 36-week season
export const CUP_WEEKS = [4, 9, 14, 19, 24, 29]
export const TOTAL_WEEKS = 36
export const LEAGUE_WEEKS = Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1)
  .filter(w => !CUP_WEEKS.includes(w))

// Circle method: one team fixed, the rest rotate one seat per round.
export function generateFixtures(teamIds: number[], rand: () => number): Fixture[] {
  const ids = [...teamIds]
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
  }

  const n = ids.length
  const half = n / 2
  const rounds = n - 1
  const fixtures: Fixture[] = []
  let rot = ids.slice(1)

  for (let r = 0; r < rounds; r++) {
    const left = [ids[0], ...rot.slice(0, half - 1)]
    const right = rot.slice(half - 1).reverse()
    for (let m = 0; m < half; m++) {
      // alternate sides so no team hogs home games
      const [homeId, awayId] = (r + m) % 2 === 0 ? [left[m], right[m]] : [right[m], left[m]]
      fixtures.push({ round: r + 1, homeId, awayId, homeGoals: null, awayGoals: null })
      fixtures.push({ round: r + 1 + rounds, homeId: awayId, awayId: homeId, homeGoals: null, awayGoals: null })
    }
    rot = [rot[rot.length - 1], ...rot.slice(0, -1)]
  }
  return fixtures.sort((a, b) => a.round - b.round)
}

export function generateDivisionFixtures(teamIds: number[], rand: () => number): Fixture[] {
  return generateFixtures(teamIds, rand).map(f => ({ ...f, round: LEAGUE_WEEKS[f.round - 1] }))
}
