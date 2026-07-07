import { describe, expect, it } from 'vitest'
import { mulberry32 } from './rng'
import { newGame } from './newGame'
import { advanceRound, applyMatchConsequences, newSeason, totalRounds } from './season'
import type { MatchEvent, Player } from './types'

function makePlayer(id: number, over: Partial<Player> = {}): Player {
  return {
    id, name: `P${id}`, age: 25, position: 'MF', level: 50,
    form: 0, fitness: 100, injuredForRounds: 0, suspendedForRounds: 0, yellowCards: 0,
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
    expect(events.filter(e => e.type === 'goal').length).toBeGreaterThan(300) // ~2.7 * 240
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
    expect(s2.fixtures).toHaveLength(240)
    expect(s2.fixtures.every(f => f.homeGoals === null)).toBe(true)
    for (const p of Object.values(s2.players)) {
      expect(p.age).toBe(s.players[p.id].age + 1)
      expect(p.fitness).toBe(100)
      expect(p.yellowCards).toBe(0)
    }
  })
})
