import { describe, expect, it } from 'vitest'
import { simulateMatch, teamStrength } from './match'
import { mulberry32 } from './rng'
import type { Player, Position, Team } from './types'

function makeTeam(id: number, level: number, players: Record<number, Player>): Team {
  const positions: Position[] = ['GK', 'DF', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'MF', 'FW', 'FW']
  const lineup = positions.map((position, i) => {
    const pid = id * 100 + i
    players[pid] = { id: pid, name: `P${pid}`, age: 25, position, level }
    return pid
  })
  return { id, name: `T${id}`, playerIds: [...lineup], formation: '4-4-2', lineup }
}

describe('teamStrength', () => {
  it('sums lineup levels', () => {
    const players: Record<number, Player> = {}
    const team = makeTeam(1, 50, players)
    expect(teamStrength(team, players)).toBe(550)
  })
})

describe('simulateMatch', () => {
  it('is deterministic for the same rand', () => {
    const players: Record<number, Player> = {}
    const a = makeTeam(1, 60, players)
    const b = makeTeam(2, 55, players)
    expect(simulateMatch(a, b, players, mulberry32(9))).toEqual(simulateMatch(a, b, players, mulberry32(9)))
  })

  it('produces sane scorelines', () => {
    const players: Record<number, Player> = {}
    const a = makeTeam(1, 60, players)
    const b = makeTeam(2, 55, players)
    const rand = mulberry32(3)
    for (let i = 0; i < 500; i++) {
      const { homeGoals, awayGoals } = simulateMatch(a, b, players, rand)
      expect(homeGoals).toBeGreaterThanOrEqual(0)
      expect(homeGoals).toBeLessThanOrEqual(12)
      expect(awayGoals).toBeGreaterThanOrEqual(0)
      expect(awayGoals).toBeLessThanOrEqual(12)
    }
  })

  it('lets the clearly stronger team win far more often', () => {
    const players: Record<number, Player> = {}
    const strong = makeTeam(1, 90, players)
    const weak = makeTeam(2, 40, players)
    const rand = mulberry32(42)
    let strongWins = 0
    let weakWins = 0
    for (let i = 0; i < 500; i++) {
      const { homeGoals, awayGoals } = simulateMatch(strong, weak, players, rand)
      if (homeGoals > awayGoals) strongWins++
      if (awayGoals > homeGoals) weakWins++
    }
    expect(strongWins).toBeGreaterThan(weakWins * 2)
  })
})
