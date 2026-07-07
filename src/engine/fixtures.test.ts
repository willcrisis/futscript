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
