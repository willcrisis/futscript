import { describe, expect, it } from 'vitest'
import { salaryFor, STARTING_CASH } from './finance'
import { newGame } from './newGame'

describe('newGame', () => {
  it('builds a full, valid world', () => {
    const state = newGame(123)
    expect(state.teams).toHaveLength(48)
    expect(Object.keys(state.players)).toHaveLength(48 * 18)
    expect(state.season).toBe(1)
    expect(state.round).toBe(1)
    expect(state.userTeamId).toBe(state.teams[0].id)
    expect(state.fixtures).toHaveLength(720)

    const teamNames = new Set(state.teams.map(t => t.name))
    expect(teamNames.size).toBe(48)

    for (const team of state.teams) {
      expect(team.playerIds).toHaveLength(18)
      expect(team.lineup).toHaveLength(11)
      for (const id of team.playerIds) {
        const p = state.players[id]
        expect(p.level).toBeGreaterThanOrEqual(30)
        expect(p.level).toBeLessThanOrEqual(75)
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

  it('builds a three-division world with the user at the bottom', () => {
    const state = newGame(123)
    expect(state.teams).toHaveLength(48)
    expect(Object.keys(state.players)).toHaveLength(48 * 18)
    for (const division of [1, 2, 3]) {
      expect(state.teams.filter(t => t.division === division)).toHaveLength(16)
    }
    expect(state.teams[0].division).toBe(3)
    expect(state.userTeamId).toBe(state.teams[0].id)
    expect(state.fixtures).toHaveLength(720) // 240 per division
    expect(state.cupFixtures).toHaveLength(16)
    // level bands per division
    for (const team of state.teams) {
      for (const id of team.playerIds) {
        const level = state.players[id].level
        if (team.division === 1) { expect(level).toBeGreaterThanOrEqual(45); expect(level).toBeLessThanOrEqual(75) }
        if (team.division === 2) { expect(level).toBeGreaterThanOrEqual(38); expect(level).toBeLessThanOrEqual(68) }
        if (team.division === 3) { expect(level).toBeGreaterThanOrEqual(30); expect(level).toBeLessThanOrEqual(60) }
      }
    }
    const names = new Set(state.teams.map(t => t.name))
    expect(names.size).toBe(48)
  })
})
