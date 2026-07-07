import { describe, expect, it } from 'vitest'
import { standings } from './standings'
import type { Fixture, GameState, Team } from './types'

function makeState(fixtures: Fixture[]): GameState {
  const teams: Team[] = [0, 1, 2].map(id => ({
    id, name: `T${id}`, playerIds: [], formation: '4-4-2', lineup: [],
    tactic: 'normal', trainingStyle: 'normal', cash: 1_000_000,
  }))
  return {
    version: 3, seed: 1, rngState: 1, season: 1, round: 1,
    userTeamId: 0, players: {}, teams, fixtures,
    transferList: [], incomingOffers: [], loanBalance: 0,
    brokeRounds: 0, gameOver: false, finances: [],
  }
}

describe('standings', () => {
  it('awards 3/1/0 points and sorts by points, GD, GF', () => {
    const state = makeState([
      { round: 1, homeId: 0, awayId: 1, homeGoals: 3, awayGoals: 0 }, // 0 beats 1
      { round: 1, homeId: 2, awayId: 0, homeGoals: 1, awayGoals: 1 }, // 2 draws 0
      { round: 2, homeId: 1, awayId: 2, homeGoals: 0, awayGoals: 2 }, // 2 beats 1
      { round: 2, homeId: 0, awayId: 2, homeGoals: null, awayGoals: null }, // unplayed — ignored
    ])
    const rows = standings(state)
    expect(rows.map(r => r.teamId)).toEqual([0, 2, 1]) // 0: 4pts GD+3; 2: 4pts GD+2; 1: 0pts
    expect(rows[0]).toEqual({
      teamId: 0, played: 2, won: 1, drawn: 1, lost: 0,
      goalsFor: 4, goalsAgainst: 1, points: 4,
    })
    expect(rows[2].points).toBe(0)
  })

  it('lists every team even before any match', () => {
    const rows = standings(makeState([]))
    expect(rows).toHaveLength(3)
    expect(rows.every(r => r.played === 0 && r.points === 0)).toBe(true)
  })
})
