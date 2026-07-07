import { describe, expect, it } from 'vitest'
import { cupWinner, drawFirstCupRound, drawNextCupRound } from './cup'
import { CUP_WEEKS } from './fixtures'
import { newGame } from './newGame'
import type { GameState } from './types'

describe('drawFirstCupRound', () => {
  it('pairs the 32 non-top-flight clubs at the first cup week', () => {
    const state = newGame(1)
    const round1 = state.cupFixtures
    expect(round1).toHaveLength(16)
    expect(round1.every(f => f.cupRound === 1 && f.week === CUP_WEEKS[0])).toBe(true)
    const entrants = round1.flatMap(f => [f.homeId, f.awayId])
    expect(new Set(entrants).size).toBe(32)
    const div1Ids = new Set(state.teams.filter(t => t.division === 1).map(t => t.id))
    expect(entrants.some(id => div1Ids.has(id))).toBe(false)
  })

  it('returns no fixtures when there are no lower divisions', () => {
    const state = newGame(1)
    const div1Only = state.teams.filter(t => t.division === 1)
    expect(drawFirstCupRound(div1Only, () => 0.5)).toEqual([])
  })
})

describe('drawNextCupRound', () => {
  function resolve(state: GameState, cupRound: number): GameState {
    return {
      ...state,
      cupFixtures: state.cupFixtures.map(f =>
        f.cupRound === cupRound ? { ...f, homeGoals: 1, awayGoals: 0, winnerId: f.homeId } : f,
      ),
    }
  }

  it('adds the top flight in round 2, then halves each round to a final', () => {
    let state = newGame(2)
    const rand = () => 0.42
    const sizes: number[] = [state.cupFixtures.length]
    for (let round = 1; round <= 6; round++) {
      state = resolve(state, round)
      const next = drawNextCupRound(state, rand)
      if (round < 6) {
        state = { ...state, cupFixtures: [...state.cupFixtures, ...next] }
        sizes.push(next.length)
        expect(next.every(f => f.cupRound === round + 1 && f.week === CUP_WEEKS[round])).toBe(true)
      } else {
        expect(next).toEqual([]) // final resolved → nothing left to draw
      }
    }
    expect(sizes).toEqual([16, 16, 8, 4, 2, 1]) // R2 = 16 R1 winners + 16 div-1 clubs
    expect(cupWinner(state)).not.toBeNull()
  })

  it('draws nothing while ties are unresolved', () => {
    const state = newGame(3)
    expect(drawNextCupRound(state, () => 0.5)).toEqual([])
  })
})
