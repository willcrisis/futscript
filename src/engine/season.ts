import { generateFixtures } from './fixtures'
import { simulateMatch } from './match'
import { mulberry32, randInt } from './rng'
import type { GameState } from './types'

export function totalRounds(state: GameState): number {
  return (state.teams.length - 1) * 2
}

export function advanceRound(state: GameState): GameState {
  if (state.round > totalRounds(state)) return state
  const rand = mulberry32(state.rngState)
  const fixtures = state.fixtures.map(f => {
    if (f.round !== state.round) return f
    const home = state.teams.find(t => t.id === f.homeId)!
    const away = state.teams.find(t => t.id === f.awayId)!
    const result = simulateMatch(home, away, state.players, rand)
    return { ...f, homeGoals: result.homeGoals, awayGoals: result.awayGoals }
  })
  return { ...state, fixtures, round: state.round + 1, rngState: randInt(rand, 1, 2 ** 31 - 1) }
}

export function newSeason(state: GameState): GameState {
  const rand = mulberry32(state.rngState)
  return {
    ...state,
    season: state.season + 1,
    round: 1,
    fixtures: generateFixtures(state.teams.map(t => t.id), rand),
    rngState: randInt(rand, 1, 2 ** 31 - 1),
  }
}
