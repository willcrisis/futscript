import { describe, expect, it } from 'vitest'
import { CUP_WEEKS, generateDivisionFixtures, generateFixtures, LEAGUE_WEEKS } from './fixtures'
import { mulberry32 } from './rng'

const ids = Array.from({ length: 16 }, (_, i) => i)

describe('generateFixtures', () => {
  it('generates a valid double round-robin for 16 teams', () => {
    const fixtures = generateFixtures(ids, mulberry32(1))
    expect(fixtures).toHaveLength(240) // 16*15 ordered pairs

    for (let r = 1; r <= 30; r++) {
      const inRound = fixtures.filter(f => f.round === r)
      expect(inRound).toHaveLength(8)
      const teams = inRound.flatMap(f => [f.homeId, f.awayId])
      expect(new Set(teams).size).toBe(16) // every team plays exactly once per round
    }

    const orderedPairs = new Set(fixtures.map(f => `${f.homeId}-${f.awayId}`))
    expect(orderedPairs.size).toBe(240) // each pairing home & away exactly once

    for (const f of fixtures) {
      expect(f.homeGoals).toBeNull()
      expect(f.awayGoals).toBeNull()
    }
  })

  it('is deterministic for the same rand', () => {
    expect(generateFixtures(ids, mulberry32(5))).toEqual(generateFixtures(ids, mulberry32(5)))
  })
})

describe('calendar', () => {
  it('league weeks skip the six cup weeks', () => {
    expect(CUP_WEEKS).toEqual([4, 9, 14, 19, 24, 29])
    expect(LEAGUE_WEEKS).toHaveLength(30)
    expect(LEAGUE_WEEKS.some(w => CUP_WEEKS.includes(w))).toBe(false)
    expect(Math.max(...LEAGUE_WEEKS)).toBe(36)
  })

  it('generateDivisionFixtures schedules rounds onto league weeks', () => {
    const fixtures = generateDivisionFixtures(ids, mulberry32(1))
    expect(fixtures).toHaveLength(240)
    const weeks = new Set(fixtures.map(f => f.round))
    expect(weeks.size).toBe(30)
    for (const w of weeks) expect(CUP_WEEKS.includes(w)).toBe(false)
    // still one match per team per scheduled week
    const week5 = fixtures.filter(f => f.round === 5)
    expect(new Set(week5.flatMap(f => [f.homeId, f.awayId])).size).toBe(16)
  })
})

describe('home/away balance', () => {
  it('gives every club a near-even home split with no long streaks in the first leg', () => {
    const ids = Array.from({ length: 16 }, (_, i) => i)
    const fx = generateFixtures(ids, mulberry32(1))
    const firstLegRounds = ids.length - 1 // 15

    for (const id of ids) {
      const legGames = fx
        .filter(f => f.round <= firstLegRounds && (f.homeId === id || f.awayId === id))
        .sort((a, b) => a.round - b.round)
      expect(legGames).toHaveLength(firstLegRounds)

      const homes = legGames.filter(f => f.homeId === id).length
      // 15 games → 7 or 8 home
      expect(homes).toBeGreaterThanOrEqual(7)
      expect(homes).toBeLessThanOrEqual(8)

      // no more than two consecutive home or away
      let streak = 1
      let maxStreak = 1
      for (let i = 1; i < legGames.length; i++) {
        const prevHome = legGames[i - 1].homeId === id
        const curHome = legGames[i].homeId === id
        streak = prevHome === curHome ? streak + 1 : 1
        maxStreak = Math.max(maxStreak, streak)
      }
      expect(maxStreak).toBeLessThanOrEqual(2)
    }
  })

  it('still schedules a full double round-robin', () => {
    const ids = Array.from({ length: 16 }, (_, i) => i)
    const fx = generateFixtures(ids, mulberry32(2))
    expect(fx).toHaveLength(16 * 15) // 240 fixtures
    // each ordered pair (home, away) appears exactly once
    const seen = new Set(fx.map(f => `${f.homeId}-${f.awayId}`))
    expect(seen.size).toBe(16 * 15)
  })
})
