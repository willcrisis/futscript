import { describe, expect, it } from 'vitest'
import { mulberry32 } from './rng'
import { ageSquads, applyWeeklyUpdates } from './training'
import type { Player, Team, TrainingStyle } from './types'

function makePlayer(id: number, age: number, over: Partial<Player> = {}): Player {
  return {
    id, name: `P${id}`, age, position: 'MF', level: 50, peakLevel: 50, injuryCount: 0,
    form: 0, fitness: 100, injuredForRounds: 0, suspendedForRounds: 0, yellowCards: 0,
    salary: 5000, contractSeasons: 2, seasonGoals: 0,
    ...over,
  }
}

function makeTeam(playerIds: number[], trainingStyle: TrainingStyle): Team {
  return {
    id: 0, name: 'T', playerIds, formation: '4-4-2', lineup: [],
    tactic: 'normal', trainingStyle, cash: 1_000_000, division: 1,
    capacity: 9_000, ticketPrice: 15, fanMood: 50,
    manager: 'AI Manager', managerHiredSeason: 0,
  }
}

// run many weekly updates and count level gains for one player
function gains(age: number, style: TrainingStyle, weeks: number, seed: number): number {
  const rand = mulberry32(seed)
  let total = 0
  for (let w = 0; w < weeks; w++) {
    const players: Record<number, Player> = { 1: makePlayer(1, age) }
    const next = applyWeeklyUpdates(players, [makeTeam([1], style)], new Set(), rand)
    total += next[1]!.level - 50
  }
  return total
}

describe('applyWeeklyUpdates — training', () => {
  it('young players grow, 30+ players do not', () => {
    expect(gains(19, 'normal', 400, 1)).toBeGreaterThan(0)
    expect(gains(31, 'normal', 400, 1)).toBe(0)
  })

  it('intensive trains faster than light', () => {
    expect(gains(19, 'intensive', 400, 2)).toBeGreaterThan(gains(19, 'light', 400, 2))
  })

  it('youth focus boosts U21 and slows veterans vs normal', () => {
    expect(gains(19, 'youth', 400, 3)).toBeGreaterThan(gains(19, 'normal', 400, 3))
    expect(gains(26, 'youth', 400, 3)).toBeLessThan(gains(26, 'normal', 400, 3))
  })

  it('level never exceeds 99', () => {
    const rand = mulberry32(4)
    let players: Record<number, Player> = { 1: makePlayer(1, 18, { level: 99, peakLevel: 99 }) }
    for (let w = 0; w < 50; w++) players = applyWeeklyUpdates(players, [makeTeam([1], 'intensive')], new Set(), rand)
    expect(players[1]!.level).toBe(99)
  })
})

describe('applyWeeklyUpdates — fitness and form', () => {
  it('starters lose net fitness, resters recover, both clamped to 0-100', () => {
    const rand = mulberry32(5)
    const players: Record<number, Player> = {
      1: makePlayer(1, 25, { fitness: 100 }),
      2: makePlayer(2, 25, { fitness: 40 }),
    }
    const next = applyWeeklyUpdates(players, [makeTeam([1, 2], 'normal')], new Set([1]), rand)
    expect(next[1]!.fitness).toBe(95) // 100 - 25 + 20
    expect(next[2]!.fitness).toBe(60) // 40 + 20
  })

  it('form drifts but stays within -3..3', () => {
    const rand = mulberry32(6)
    let players: Record<number, Player> = { 1: makePlayer(1, 25) }
    const seen = new Set<number>()
    for (let w = 0; w < 200; w++) {
      players = applyWeeklyUpdates(players, [makeTeam([1], 'normal')], new Set(), rand)
      seen.add(players[1]!.form)
      expect(players[1]!.form).toBeGreaterThanOrEqual(-3)
      expect(players[1]!.form).toBeLessThanOrEqual(3)
    }
    expect(seen.size).toBeGreaterThan(1) // it actually moves
  })
})

describe('ageSquads', () => {
  it('ages everyone, declines 30+, resets season fields', () => {
    const rand = mulberry32(7)
    const players: Record<number, Player> = {
      1: makePlayer(1, 22, { form: 2, fitness: 55, yellowCards: 2, injuredForRounds: 3, suspendedForRounds: 1, seasonGoals: 7 }),
      2: makePlayer(2, 31, { level: 60, peakLevel: 60 }),
    }
    const next = ageSquads(players, rand)
    expect(next[1]!.age).toBe(23)
    expect(next[1]!.level).toBe(50) // under 30: no decline
    expect(next[1]).toMatchObject({ form: 0, fitness: 100, yellowCards: 0, injuredForRounds: 0, suspendedForRounds: 0 })
    expect(next[1]!.seasonGoals).toBe(0)
    expect(next[2]!.age).toBe(32)
    expect(next[2]!.level).toBeGreaterThanOrEqual(57)
    expect(next[2]!.level).toBeLessThanOrEqual(59) // declined 1-3
  })
})
