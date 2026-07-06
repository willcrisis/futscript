import { describe, expect, it } from 'vitest'
import { generateFixtures } from './fixtures'
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
