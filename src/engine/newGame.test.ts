import { describe, expect, it } from 'vitest'
import { salaryFor, STARTING_CASH } from './finance'
import { newGame } from './newGame'

describe('newGame', () => {
  it('builds a full, valid world', () => {
    const state = newGame(123)
    expect(state.teams).toHaveLength(64)
    expect(Object.keys(state.players)).toHaveLength(64 * 18)
    expect(state.season).toBe(1)
    expect(state.round).toBe(1)
    expect(state.teams.some(t => t.id === state.userTeamId)).toBe(true)
    expect(state.fixtures).toHaveLength(960)

    const teamNames = new Set(state.teams.map(t => t.name))
    expect(teamNames.size).toBe(64)

    for (const team of state.teams) {
      expect(team.playerIds).toHaveLength(18)
      expect(team.lineup).toHaveLength(11)
      for (const id of team.playerIds) {
        const p = state.players[id]
        expect(p.level).toBeGreaterThanOrEqual(30)
        expect(p.level).toBeLessThanOrEqual(80)
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
    expect(state.finances).toEqual([])
  })

  it('builds a four-division world with the user at the bottom', () => {
    const state = newGame(123)
    expect(state.teams).toHaveLength(64)
    expect(Object.keys(state.players)).toHaveLength(64 * 18)
    for (const division of [1, 2, 3, 4]) {
      expect(state.teams.filter(t => t.division === division)).toHaveLength(16)
    }
    expect(state.teams[0].division).toBe(4)
    const userTeam = state.teams.find(t => t.id === state.userTeamId)!
    expect(userTeam.division).toBe(4)
    expect(state.fixtures).toHaveLength(960) // 240 per division
    expect(state.cupFixtures).toHaveLength(32) // 64 clubs fill the bracket exactly: 0 byes, 32 round-1 ties
    // level bands per division
    for (const team of state.teams) {
      for (const id of team.playerIds) {
        const level = state.players[id].level
        if (team.division === 1) { expect(level).toBeGreaterThanOrEqual(58); expect(level).toBeLessThanOrEqual(80) }
        if (team.division === 2) { expect(level).toBeGreaterThanOrEqual(46); expect(level).toBeLessThanOrEqual(66) }
        if (team.division === 3) { expect(level).toBeGreaterThanOrEqual(40); expect(level).toBeLessThanOrEqual(52) }
        if (team.division === 4) { expect(level).toBeGreaterThanOrEqual(30); expect(level).toBeLessThanOrEqual(40) }
      }
    }
    const names = new Set(state.teams.map(t => t.name))
    expect(names.size).toBe(64)
  })

  it('assigns different starting clubs across seeds (random Division 4 draw)', () => {
    const clubs = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(seed => newGame(seed).userTeamId))
    expect(clubs.size).toBeGreaterThan(1) // 8 seeds landing on one club: (1/16)^7 — a broken draw, not luck
    for (const seed of [1, 2]) {
      const s = newGame(seed)
      expect(s.teams.find(t => t.id === s.userTeamId)!.division).toBe(4)
    }
  })

  it('v7: every club has a manager, the user has a career, the pool starts empty', () => {
    const state = newGame(7)
    expect(state.version).toBe(7)
    for (const team of state.teams) {
      expect(team.manager).toMatch(/\S+ \S+/) // "First Last" — \S so accented names (André, ...) still match
      expect(team.managerHiredSeason).toBe(0)
    }
    expect(state.manager).toMatchObject({ reputation: 30, confidence: 60, employed: true, hiredSeason: 0, jobOffers: [] })
    expect(state.manager.name).toMatch(/\S+ \S+/)
    expect(state.unemployedPool).toEqual([])
    expect('gameOver' in state).toBe(false)
  })

  it('v7: the user club draw is still the last thing the seed decides', () => {
    // same seed → identical world (teams, players, fixtures) regardless of which club the user got
    const a = newGame(42)
    const b = newGame(42)
    expect(a.userTeamId).toBe(b.userTeamId)
    expect(a.teams.map(t => t.manager)).toEqual(b.teams.map(t => t.manager))
  })
})
