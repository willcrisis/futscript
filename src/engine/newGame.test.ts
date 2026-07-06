import { describe, expect, it } from 'vitest'
import { newGame } from './newGame'

describe('newGame', () => {
  it('builds a full, valid world', () => {
    const state = newGame(123)
    expect(state.teams).toHaveLength(16)
    expect(Object.keys(state.players)).toHaveLength(16 * 18)
    expect(state.season).toBe(1)
    expect(state.round).toBe(1)
    expect(state.userTeamId).toBe(state.teams[0].id)
    expect(state.fixtures).toHaveLength(240)

    const teamNames = new Set(state.teams.map(t => t.name))
    expect(teamNames.size).toBe(16)

    for (const team of state.teams) {
      expect(team.playerIds).toHaveLength(18)
      expect(team.lineup).toHaveLength(11)
      for (const id of team.playerIds) {
        const p = state.players[id]
        expect(p.level).toBeGreaterThanOrEqual(30)
        expect(p.level).toBeLessThanOrEqual(70)
        expect(p.age).toBeGreaterThanOrEqual(17)
        expect(p.age).toBeLessThanOrEqual(34)
      }
    }
  })

  it('is deterministic for the same seed', () => {
    expect(newGame(99)).toEqual(newGame(99))
  })

  it('differs between seeds', () => {
    expect(newGame(1)).not.toEqual(newGame(2))
  })
})
