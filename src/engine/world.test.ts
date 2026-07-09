import { describe, expect, it } from 'vitest'
import { TEAM_NAMES } from './names'
import { LEVEL_RANGE, newGame } from './newGame'
import { isActive } from './types'

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

describe('newGame world', () => {
  it('fields 64 active clubs across four divisions of 16', () => {
    const s = newGame(1)
    const active = s.teams.filter(t => isActive(t, s.season))
    expect(active).toHaveLength(64)
    for (const d of [1, 2, 3, 4]) {
      expect(active.filter(t => t.division === d)).toHaveLength(16)
    }
  })

  it('starts the manager in a Division 4 club', () => {
    const s = newGame(7)
    const user = s.teams.find(t => t.id === s.userTeamId)!
    expect(user.division).toBe(4)
  })
})

describe('demotion pool seeding', () => {
  it('seeds four dormant clubs that rejoin in season 2', () => {
    const s = newGame(1)
    expect(s.teams).toHaveLength(68)
    const dormant = s.teams.filter(t => !isActive(t, s.season))
    expect(dormant).toHaveLength(4)
    expect(dormant.every(t => t.poolReturn === 2)).toBe(true)
    // every division still fields 16 active clubs in season 1
    for (const d of [1, 2, 3, 4]) {
      expect(s.teams.filter(t => t.division === d && isActive(t, s.season))).toHaveLength(16)
    }
  })
})
