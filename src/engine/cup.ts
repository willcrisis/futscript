import { CUP_WEEKS } from './fixtures'
import type { CupFixture, GameState, Team } from './types'

const BRACKET_SLOTS = 2 ** CUP_WEEKS.length // 64: a 6-round knockout

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

// Round 1: fill a 64-slot bracket. The strongest clubs bye when there are fewer than 64 entrants.
export function drawFirstCupRound(teams: Team[], rand: () => number): CupFixture[] {
  const active = teams.filter(t => t.poolReturn == null) // newGame/newSeason pass post-rollover teams; dormant excluded
  if (active.length < 2) return []
  // strongest first: top division first (player levels aren't threaded here, division is the proxy)
  const seeded = [...active].sort((a, b) => a.division - b.division).map(t => t.id)
  const byes = Math.max(0, BRACKET_SLOTS - seeded.length)
  const round1 = seeded.slice(byes) // the rest play round 1
  return pairUp(round1, 1, CUP_WEEKS[0], rand)
}

export function drawNextCupRound(state: GameState, rand: () => number): CupFixture[] {
  const lastRound = Math.max(0, ...state.cupFixtures.map(f => f.cupRound))
  if (lastRound === 0 || lastRound >= CUP_WEEKS.length) return []
  const ties = state.cupFixtures.filter(f => f.cupRound === lastRound)
  if (ties.some(f => f.winnerId === null)) return []
  let entrants = ties.map(f => f.winnerId!)
  if (lastRound === 1) {
    // bye clubs = active clubs that played no round-1 tie
    const played = new Set(state.cupFixtures.filter(f => f.cupRound === 1).flatMap(f => [f.homeId, f.awayId]))
    const byes = state.teams
      .filter(t => (t.poolReturn == null || t.poolReturn <= state.season) && !played.has(t.id))
      .map(t => t.id)
    entrants = [...entrants, ...byes]
  }
  if (entrants.length < 2) return []
  return pairUp(entrants, lastRound + 1, CUP_WEEKS[lastRound], rand)
}

export function cupWinner(state: GameState): number | null {
  if (state.cupFixtures.length === 0) return null
  const final = state.cupFixtures.reduce((a, b) => (b.cupRound > a.cupRound ? b : a))
  return final.cupRound === CUP_WEEKS.length ? final.winnerId : null
}
