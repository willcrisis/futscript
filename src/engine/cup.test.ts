import { describe, expect, it } from 'vitest'
import { cupWinner, drawFirstCupRound, drawNextCupRound } from './cup'
import { CUP_WEEKS } from './fixtures'
import { newGame } from './newGame'
import { mulberry32 } from './rng'
import type { GameState } from './types'

describe('drawFirstCupRound', () => {
  it('below bracket size, the strongest division byes into round 2 (48 clubs -> 16 D1 byes)', () => {
    const state = newGame(1)
    const clubs = state.teams.filter(t => t.division !== 4) // 48 clubs: divisions 1-3
    const round1 = drawFirstCupRound(clubs, () => 0.5)
    expect(round1).toHaveLength(16)
    expect(round1.every(f => f.cupRound === 1 && f.week === CUP_WEEKS[0])).toBe(true)
    const entrants = round1.flatMap(f => [f.homeId, f.awayId])
    expect(new Set(entrants).size).toBe(32)
    const div1Ids = new Set(clubs.filter(t => t.division === 1).map(t => t.id))
    expect(entrants.some(id => div1Ids.has(id))).toBe(false) // division 1 got the byes
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

  it('below bracket size, byes join round 2, then halves each round to a final (48 clubs)', () => {
    const full = newGame(2)
    const clubs = full.teams.filter(t => t.division !== 4) // 48 clubs: divisions 1-3
    const rand = () => 0.42
    let state: GameState = { ...full, teams: clubs, cupFixtures: drawFirstCupRound(clubs, rand) }
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
    expect(sizes).toEqual([16, 16, 8, 4, 2, 1]) // R2 = 16 R1 winners + 16 div-1 byes
    expect(cupWinner(state)).not.toBeNull()
  })

  it('draws nothing while ties are unresolved', () => {
    const state = newGame(3)
    expect(drawNextCupRound(state, () => 0.5)).toEqual([])
  })
})

describe('cup bracket sizing', () => {
  it('a 64-club world plays a clean 32-tie first round with no byes', () => {
    const s = newGame(1) // 64 clubs
    const r1 = drawFirstCupRound(s.teams, mulberry32(9))
    expect(r1).toHaveLength(32)
    const playing = new Set(r1.flatMap(f => [f.homeId, f.awayId]))
    expect(playing.size).toBe(64) // everyone plays
  })

  it('round 2 merges winners with bye clubs to 32 competitors', () => {
    let s = newGame(2)
    const rand = mulberry32(4)
    const r1 = drawFirstCupRound(s.teams, rand)
    // decide round 1 arbitrarily: home wins every tie
    const decided = r1.map(f => ({ ...f, homeGoals: 1, awayGoals: 0, winnerId: f.homeId }))
    s = { ...s, cupFixtures: decided }
    const r2 = drawNextCupRound(s, rand)
    const competitors = new Set(r2.flatMap(f => [f.homeId, f.awayId]))
    expect(competitors.size).toBe(32)
  })
})
