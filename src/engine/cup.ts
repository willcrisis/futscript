import { CUP_WEEKS } from './fixtures'
import type { CupFixture, GameState, Team } from './types'

function pairUp(teamIds: number[], cupRound: number, week: number, rand: () => number): CupFixture[] {
  const ids = [...teamIds]
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
  }
  const fixtures: CupFixture[] = []
  for (let m = 0; m < Math.floor(ids.length / 2); m++) {
    fixtures.push({
      week, cupRound,
      homeId: ids[2 * m], awayId: ids[2 * m + 1],
      homeGoals: null, awayGoals: null, winnerId: null,
    })
  }
  return fixtures
}

// Round 1: the 32 clubs outside the top flight. Division 1 enters in round 2.
export function drawFirstCupRound(teams: Team[], rand: () => number): CupFixture[] {
  const entrants = teams.filter(t => t.division !== 1).map(t => t.id)
  if (entrants.length < 2) return [] // migrated 16-team world: no cup until expansion
  return pairUp(entrants, 1, CUP_WEEKS[0], rand)
}

export function drawNextCupRound(state: GameState, rand: () => number): CupFixture[] {
  const lastRound = Math.max(0, ...state.cupFixtures.map(f => f.cupRound))
  if (lastRound === 0 || lastRound >= CUP_WEEKS.length) return []
  const ties = state.cupFixtures.filter(f => f.cupRound === lastRound)
  if (ties.some(f => f.winnerId === null)) return []
  let entrants = ties.map(f => f.winnerId!)
  if (lastRound === 1) {
    entrants = [...entrants, ...state.teams.filter(t => t.division === 1).map(t => t.id)]
  }
  if (entrants.length < 2) return []
  return pairUp(entrants, lastRound + 1, CUP_WEEKS[lastRound], rand)
}

export function cupWinner(state: GameState): number | null {
  if (state.cupFixtures.length === 0) return null
  const final = state.cupFixtures.reduce((a, b) => (b.cupRound > a.cupRound ? b : a))
  return final.cupRound === CUP_WEEKS.length ? final.winnerId : null
}
