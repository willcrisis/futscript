import { describe, expect, it } from 'vitest'
import { newGame } from './newGame'
import { advanceRound, newSeason, totalRounds } from './season'
import { exportSave, migrateToCurrent } from './save'
import { MIN_SQUAD } from './transfers'
import type { GameState } from './types'

// Headless career smoke: 3 full seasons from a fresh save, simulated the same way the
// UI drives it (advanceRound to season end, then newSeason). Guards against regressions
// that only show up over many rounds — squad floors, confidence clamping, manager churn,
// and the save/migration round-trip — none of which single-round unit tests can catch.
describe('career smoke (3 seasons)', () => {
  it('keeps every club fielding a squad, confidence in range, manager churn happening, and the save round-tripping', () => {
    let s: GameState = newGame(1)
    const observedNewsTypes = new Set<string>()

    const assertInvariants = (state: GameState) => {
      for (const team of state.teams) expect(team.playerIds.length).toBeGreaterThanOrEqual(MIN_SQUAD)
      expect(state.manager.confidence).toBeGreaterThanOrEqual(0)
      expect(state.manager.confidence).toBeLessThanOrEqual(100)
      for (const item of state.news) observedNewsTypes.add(item.type)
    }

    for (let season = 0; season < 3; season++) {
      // the world keeps simulating even after the user's own manager gets sacked mid-run
      while (s.round <= totalRounds(s)) {
        s = advanceRound(s)
        assertInvariants(s)
      }
      s = newSeason(s)
      assertInvariants(s)
    }

    expect(s.season).toBe(4)
    expect(observedNewsTypes.has('managerSacked') || observedNewsTypes.has('managerHired')).toBe(true)

    const roundTripped = migrateToCurrent(JSON.parse(exportSave(s)))
    expect(roundTripped).toEqual(s)
  })
})
