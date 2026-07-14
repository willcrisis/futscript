import { describe, expect, it } from 'vitest'
import { newGame } from '../engine/newGame'
import { buildScoutRows, applyScoutFilters } from './ScoutScreen'

describe('scout filters', () => {
  it('excludes the user\'s own players', () => {
    const s = newGame(1)
    const rows = buildScoutRows(s)
    expect(rows.some(r => r.team.id === s.userTeamId)).toBe(false)
  })

  it('composes position + min level filters', () => {
    const s = newGame(1)
    const rows = buildScoutRows(s)
    const filtered = applyScoutFilters(rows, { name: '', position: 'FW', minLevel: 60, maxValue: null, division: null })
    expect(filtered.every(r => r.player.position === 'FW' && r.player.level >= 60)).toBe(true)
  })

  it('caps by max value', () => {
    const s = newGame(1)
    const rows = buildScoutRows(s)
    const filtered = applyScoutFilters(rows, { name: '', position: 'all', minLevel: 0, maxValue: 500_000, division: null })
    expect(filtered.every(r => r.value <= 500_000)).toBe(true)
  })
})
