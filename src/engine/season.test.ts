import { describe, expect, it } from 'vitest'
import { newGame } from './newGame'
import { advanceRound, newSeason, totalRounds } from './season'

describe('advanceRound', () => {
  it('plays exactly the current round and advances', () => {
    const s0 = newGame(123)
    const s1 = advanceRound(s0)
    expect(s1.round).toBe(2)
    expect(s1.fixtures.filter(f => f.round === 1).every(f => f.homeGoals !== null)).toBe(true)
    expect(s1.fixtures.filter(f => f.round === 2).every(f => f.homeGoals === null)).toBe(true)
    expect(s0.round).toBe(1) // input state untouched
  })

  it('is deterministic', () => {
    const s0 = newGame(123)
    expect(advanceRound(s0)).toEqual(advanceRound(s0))
  })

  it('plays a whole season and then no-ops', () => {
    let s = newGame(7)
    for (let i = 0; i < totalRounds(s); i++) s = advanceRound(s)
    expect(s.round).toBe(totalRounds(s) + 1)
    expect(s.fixtures.every(f => f.homeGoals !== null)).toBe(true)
    expect(advanceRound(s)).toEqual(s)
  })
})

describe('newSeason', () => {
  it('resets the calendar and bumps the season', () => {
    let s = newGame(7)
    for (let i = 0; i < totalRounds(s); i++) s = advanceRound(s)
    const s2 = newSeason(s)
    expect(s2.season).toBe(2)
    expect(s2.round).toBe(1)
    expect(s2.fixtures).toHaveLength(240)
    expect(s2.fixtures.every(f => f.homeGoals === null)).toBe(true)
    expect(s2.teams).toEqual(s.teams) // squads carry over
  })
})
