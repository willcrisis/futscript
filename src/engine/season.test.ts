import { describe, expect, it } from 'vitest'
import { mulberry32 } from './rng'
import { newGame } from './newGame'
import { advanceRound, applyMatchConsequences, newSeason, totalRounds } from './season'
import { standings } from './standings'
import { salaryFor } from './finance'
import type { MatchEvent, Player } from './types'

function makePlayer(id: number, over: Partial<Player> = {}): Player {
  return {
    id, name: `P${id}`, age: 25, position: 'MF', level: 50,
    form: 0, fitness: 100, injuredForRounds: 0, suspendedForRounds: 0, yellowCards: 0,
    salary: 5000, contractSeasons: 2, seasonGoals: 0,
    ...over,
  }
}

describe('applyMatchConsequences', () => {
  const yellow = (playerId: number): MatchEvent => ({ minute: 10, type: 'yellow', teamId: 0, playerId })
  const red = (playerId: number): MatchEvent => ({ minute: 10, type: 'red', teamId: 0, playerId })
  const injury = (playerId: number): MatchEvent => ({ minute: 10, type: 'injury', teamId: 0, playerId })

  it('accumulates yellows and bans on the third', () => {
    const rand = mulberry32(1)
    const one = applyMatchConsequences({ 1: makePlayer(1) }, [yellow(1)], rand)
    expect(one[1]).toMatchObject({ yellowCards: 1, suspendedForRounds: 0 })
    const third = applyMatchConsequences({ 1: makePlayer(1, { yellowCards: 2 }) }, [yellow(1)], rand)
    expect(third[1]).toMatchObject({ yellowCards: 0, suspendedForRounds: 1 })
  })

  it('bans a red card 1-2 rounds', () => {
    const rand = mulberry32(2)
    const next = applyMatchConsequences({ 1: makePlayer(1) }, [red(1)], rand)
    expect(next[1].suspendedForRounds).toBeGreaterThanOrEqual(1)
    expect(next[1].suspendedForRounds).toBeLessThanOrEqual(2)
  })

  it('injures 1-6 rounds and costs levels only when serious', () => {
    const rand = mulberry32(3)
    for (let i = 0; i < 50; i++) {
      const next = applyMatchConsequences({ 1: makePlayer(1) }, [injury(1)], rand)
      const rounds = next[1].injuredForRounds
      expect(rounds).toBeGreaterThanOrEqual(1)
      expect(rounds).toBeLessThanOrEqual(6)
      if (rounds >= 4) {
        expect(next[1].level).toBeGreaterThanOrEqual(48)
        expect(next[1].level).toBeLessThanOrEqual(49)
      } else {
        expect(next[1].level).toBe(50)
      }
    }
  })
})

describe('advanceRound', () => {
  it('plays the current round, stores events, and advances', () => {
    const s0 = newGame(123)
    const s1 = advanceRound(s0)
    expect(s1.round).toBe(2)
    const played = s1.fixtures.filter(f => f.round === 1)
    expect(played.every(f => f.homeGoals !== null && Array.isArray(f.events))).toBe(true)
    // score matches stored events
    for (const f of played) {
      expect(f.homeGoals).toBe(f.events!.filter(e => e.type === 'goal' && e.teamId === f.homeId).length)
    }
    expect(s0.round).toBe(1) // input untouched
  })

  it('is deterministic', () => {
    const s0 = newGame(123)
    expect(advanceRound(s0)).toEqual(advanceRound(s0))
  })

  it('never fields injured or suspended players', () => {
    let s = newGame(7)
    // pre-suspend a user starter and an AI starter
    const userStarter = s.teams[0].lineup[3]
    const aiStarter = s.teams[5].lineup[3]
    s = {
      ...s,
      players: {
        ...s.players,
        [userStarter]: { ...s.players[userStarter], suspendedForRounds: 2 },
        [aiStarter]: { ...s.players[aiStarter], injuredForRounds: 2 },
      },
    }
    const s1 = advanceRound(s)
    expect(s1.teams[0].lineup).not.toContain(userStarter)
    expect(s1.teams[5].lineup).not.toContain(aiStarter)
    // counters ticked down
    expect(s1.players[userStarter].suspendedForRounds).toBe(1)
    expect(s1.players[aiStarter].injuredForRounds).toBe(1)
  })

  it('keeps the user lineup otherwise intact but re-picks AI teams', () => {
    const s0 = newGame(9)
    const userLineup = [...s0.teams[0].lineup]
    const s1 = advanceRound(s0)
    expect(s1.teams[0].lineup).toEqual(userLineup) // nobody unavailable yet
  })

  it('no-ops once the season is over', () => {
    let s = newGame(7)
    for (let i = 0; i < totalRounds(s); i++) s = advanceRound(s)
    expect(s.round).toBe(totalRounds(s) + 1)
    expect(s.fixtures.every(f => f.homeGoals !== null)).toBe(true)
    expect(advanceRound(s)).toEqual(s)
  })

  it('produces discipline and squad churn over a full season', () => {
    let s = newGame(31)
    for (let i = 0; i < totalRounds(s); i++) s = advanceRound(s)
    const events = s.fixtures.flatMap(f => f.events ?? [])
    // Since Task 6, the market/finance pipeline can end a season early (board patience runs
    // out), so scale the goal floor to fixtures actually played rather than assuming all 240 ran.
    const played = s.fixtures.filter(f => f.homeGoals !== null).length
    expect(events.filter(e => e.type === 'goal').length).toBeGreaterThan(played * 1.25) // ~2.7/match, floored for variance
    expect(events.filter(e => e.type === 'yellow').length).toBeGreaterThan(100)
    expect(events.filter(e => e.type === 'injury').length).toBeGreaterThan(5)
    // training moved at least someone
    const s0 = newGame(31)
    const levelsChanged = Object.values(s.players).some(p => p.level !== s0.players[p.id].level)
    expect(levelsChanged).toBe(true)
  })
})

describe('newSeason', () => {
  it('resets the calendar, bumps the season, and ages squads', () => {
    let s = newGame(7)
    for (let i = 0; i < totalRounds(s); i++) s = advanceRound(s)
    const s2 = newSeason(s)
    expect(s2.season).toBe(2)
    expect(s2.round).toBe(1)
    expect(s2.fixtures).toHaveLength(720)
    expect(s2.fixtures.every(f => f.homeGoals === null)).toBe(true)
    for (const p of Object.values(s2.players)) {
      expect(p.age).toBe(s.players[p.id].age + 1)
      expect(p.fitness).toBe(100)
      expect(p.yellowCards).toBe(0)
    }
  })
})

describe('advanceRound — market and money', () => {
  it('no-ops when the game is over', () => {
    const s = { ...newGame(1), gameOver: true }
    expect(advanceRound(s)).toEqual(s)
  })

  it('moves money every round', () => {
    const s1 = advanceRound(newGame(1))
    expect(s1.finances.length).toBeGreaterThan(0)
    expect(s1.teams.some(t => t.cash !== 1_000_000)).toBe(true)
  })

  it('keeps the economy alive over a full season', () => {
    let s = newGame(31)
    for (let i = 0; i < totalRounds(s); i++) s = advanceRound(s)
    // the market moved players between clubs at least once
    expect(s.teams.some(t => t.playerIds.length !== 18)).toBe(true)
    // a mid-table club does not spiral into oblivion in one season
    const userCash = s.teams.find(t => t.id === s.userTeamId)!.cash
    expect(userCash).toBeGreaterThan(-2_000_000)
  })
})

describe('newSeason — money and contracts', () => {
  function playSeason(seed: number) {
    let s = newGame(seed)
    for (let i = 0; i < totalRounds(s); i++) s = advanceRound(s)
    return s
  }

  it('pays prize money by final position', () => {
    const s = playSeason(7)
    const table = standings(s)
    const s2 = newSeason(s)
    const champion = table[0].teamId
    const last = table[15].teamId
    const cashDelta = (id: number) =>
      s2.teams.find(t => t.id === id)!.cash - s.teams.find(t => t.id === id)!.cash
    expect(cashDelta(champion)).toBe(1_500_000)
    expect(cashDelta(last)).toBe(1_500_000 - 15 * 75_000)
  })

  it('settles contracts: AI renews, unrenewed user players leave', () => {
    const s = playSeason(7)
    const userTeam = s.teams.find(t => t.id === s.userTeamId)!
    const leaving = userTeam.playerIds.find(id => s.players[id].contractSeasons === 1)
    const aiTeam = s.teams.find(t => t.id !== s.userTeamId)!
    const aiExpiring = aiTeam.playerIds.find(id => s.players[id].contractSeasons === 1)
    const s2 = newSeason(s)
    if (leaving) {
      expect(s2.players[leaving]).toBeUndefined()
      expect(s2.teams.find(t => t.id === s.userTeamId)!.playerIds).not.toContain(leaving)
    }
    if (aiExpiring) {
      expect(s2.players[aiExpiring].contractSeasons).toBeGreaterThanOrEqual(1)
      expect(s2.players[aiExpiring].salary).toBeGreaterThanOrEqual(salaryFor(s.players[aiExpiring].level))
    }
    // everyone else is one season shorter
    const survivor = userTeam.playerIds.find(id => s.players[id].contractSeasons === 3)
    if (survivor) expect(s2.players[survivor].contractSeasons).toBe(2)
  })

  it('clears the market at season end', () => {
    const s = playSeason(7)
    const s2 = newSeason(s)
    expect(s2.transferList).toEqual([])
    expect(s2.incomingOffers).toEqual([])
    expect(s2.brokeRounds).toBe(0)
  })
})
