import { describe, expect, it } from 'vitest'
import { salaryFor, STARTING_CASH } from './finance'
import { newGame } from './newGame'

describe('newGame', () => {
  it('builds a full, valid world', () => {
    const state = newGame(123)
    expect(state.teams).toHaveLength(16)
    expect(Object.keys(state.players)).toHaveLength(16 * 18)
    expect(state.season).toBe(1)
    expect(state.round).toBe(1)
    expect(state.userTeamId).toBe(state.teams[0].id)
    expect(state.fixtures).toHaveLength(240)

    const teamNames = new Set(state.teams.map(t => t.name))
    expect(teamNames.size).toBe(16)

    for (const team of state.teams) {
      expect(team.playerIds).toHaveLength(18)
      expect(team.lineup).toHaveLength(11)
      for (const id of team.playerIds) {
        const p = state.players[id]
        expect(p.level).toBeGreaterThanOrEqual(30)
        expect(p.level).toBeLessThanOrEqual(70)
        expect(p.age).toBeGreaterThanOrEqual(17)
        expect(p.age).toBeLessThanOrEqual(34)
      }
    }
  })

  it('is deterministic for the same seed', () => {
    expect(newGame(99)).toEqual(newGame(99))
  })

  it('differs between seeds', () => {
    expect(newGame(1)).not.toEqual(newGame(2))
  })

  it('gives every player a salary and contract, and every club starting cash', () => {
    const state = newGame(123)
    for (const p of Object.values(state.players)) {
      expect(p.salary).toBe(salaryFor(p.level))
      expect(p.contractSeasons).toBeGreaterThanOrEqual(1)
      expect(p.contractSeasons).toBeLessThanOrEqual(3)
    }
    for (const t of state.teams) expect(t.cash).toBe(STARTING_CASH)
    expect(state.transferList).toEqual([])
    expect(state.incomingOffers).toEqual([])
    expect(state.loanBalance).toBe(0)
    expect(state.brokeRounds).toBe(0)
    expect(state.gameOver).toBe(false)
    expect(state.finances).toEqual([])
  })
})
