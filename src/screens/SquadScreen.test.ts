import { describe, expect, it } from 'vitest'
import { statusKind } from './SquadScreen'
import type { Player } from '../engine/types'

function player(over: Partial<Player>): Player {
  return {
    id: 1, name: 'P', age: 25, position: 'MF', level: 50, form: 0, fitness: 100,
    injuredForRounds: 0, suspendedForRounds: 0, yellowCards: 0, salary: 5000, contractSeasons: 2, seasonGoals: 0,
    ...over,
  }
}

describe('statusKind', () => {
  it('returns null when the player is fully available', () => {
    expect(statusKind(player({}))).toBeNull()
  })
  it('injury outranks suspension and cards', () => {
    expect(statusKind(player({ injuredForRounds: 2, suspendedForRounds: 1, yellowCards: 2 }))).toBe('injured')
  })
  it('suspension outranks cards', () => {
    expect(statusKind(player({ suspendedForRounds: 1, yellowCards: 2 }))).toBe('suspended')
  })
  it('reports cards when only yellows are pending', () => {
    expect(statusKind(player({ yellowCards: 2 }))).toBe('cards')
  })
})
