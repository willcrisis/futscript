import { describe, expect, it } from 'vitest'
import { TEAM_NAMES } from './names'
import { LEVEL_RANGE } from './newGame'

describe('world constants', () => {
  it('supplies 68 unique team names', () => {
    expect(TEAM_NAMES).toHaveLength(68)
    expect(new Set(TEAM_NAMES).size).toBe(68)
  })

  it('has a level range for all four divisions, narrower down low', () => {
    for (const d of [1, 2, 3, 4]) expect(LEVEL_RANGE[d]).toBeDefined()
    const span = (d: number) => LEVEL_RANGE[d][1] - LEVEL_RANGE[d][0]
    expect(span(4)).toBeLessThan(span(1))
    expect(span(3)).toBeLessThan(span(2))
  })
})
