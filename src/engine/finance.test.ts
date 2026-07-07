import { describe, expect, it } from 'vitest'
import { formatMoney, marketValue, salaryFor, severanceFor } from './finance'
import type { Player } from './types'

export function makePlayer(id: number, over: Partial<Player> = {}): Player {
  return {
    id, name: `P${id}`, age: 25, position: 'MF', level: 50,
    form: 0, fitness: 100, injuredForRounds: 0, suspendedForRounds: 0, yellowCards: 0,
    salary: salaryFor(50), contractSeasons: 2,
    ...over,
  }
}

describe('money formulas', () => {
  it('salary scales with the square of level', () => {
    expect(salaryFor(50)).toBe(6250)
    expect(salaryFor(70)).toBe(12250)
    expect(salaryFor(70)).toBeGreaterThan(salaryFor(50) * 1.5)
  })

  it('market value rewards youth and punishes age', () => {
    const prime = makePlayer(1, { age: 26, level: 50 })
    const young = makePlayer(2, { age: 20, level: 50 })
    const old = makePlayer(3, { age: 32, level: 50 })
    expect(marketValue(prime)).toBe(300_000)
    expect(marketValue(young)).toBe(450_000)
    expect(marketValue(old)).toBe(150_000)
  })

  it('severance grows with contract length', () => {
    const p = makePlayer(1, { salary: 5000, contractSeasons: 2 })
    expect(severanceFor(p)).toBe(5000 * 12 * 2)
    expect(severanceFor({ ...p, contractSeasons: 0 })).toBe(5000 * 12) // floor of one season
  })

  it('formats money', () => {
    expect(formatMoney(1_234_567)).toBe('$1,234,567')
    expect(formatMoney(-500)).toBe('-$500')
  })
})
