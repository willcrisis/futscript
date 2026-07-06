import { describe, expect, it } from 'vitest'
import { autoPick, swapIn } from './lineup'
import { FORMATIONS, type Player, type Position, type Team } from './types'

// 18-player squad: 2 GK, 6 DF, 6 MF, 4 FW — levels descend within each group
function makeSquad(): { team: Team; players: Record<number, Player> } {
  const positions: Position[] = [
    'GK', 'GK',
    'DF', 'DF', 'DF', 'DF', 'DF', 'DF',
    'MF', 'MF', 'MF', 'MF', 'MF', 'MF',
    'FW', 'FW', 'FW', 'FW',
  ]
  const players: Record<number, Player> = {}
  const playerIds = positions.map((position, i) => {
    const id = i + 1
    players[id] = {
      id, name: `P${id}`, age: 25, position, level: 90 - i,
      form: 0, fitness: 100, injuredForRounds: 0, suspendedForRounds: 0, yellowCards: 0,
    }
    return id
  })
  const team: Team = {
    id: 0, name: 'Test FC', playerIds, formation: '4-4-2', lineup: [],
    tactic: 'normal', trainingStyle: 'normal',
  }
  return { team, players }
}

describe('autoPick', () => {
  it('fills the formation with the highest-level player per position', () => {
    const { team, players } = makeSquad()
    const lineup = autoPick(team, players)
    expect(lineup).toHaveLength(11)
    const counts: Record<Position, number> = { GK: 0, DF: 0, MF: 0, FW: 0 }
    for (const id of lineup) counts[players[id].position]++
    expect(counts).toEqual(FORMATIONS['4-4-2'])
    // best GK is id 1 (level 90), not id 2 (level 89)
    expect(lineup).toContain(1)
    expect(lineup).not.toContain(2)
  })

  it('works for every formation with the standard squad shape', () => {
    const { team, players } = makeSquad()
    for (const formation of Object.keys(FORMATIONS) as (keyof typeof FORMATIONS)[]) {
      const lineup = autoPick({ ...team, formation }, players)
      expect(lineup).toHaveLength(11)
      expect(new Set(lineup).size).toBe(11)
    }
  })
})

describe('swapIn', () => {
  it('replaces the weakest starter of the same position', () => {
    const { team, players } = makeSquad()
    const lineup = autoPick(team, players)
    const t = { ...team, lineup }
    // GK 2 (level 89) is benched; swapping in replaces GK 1
    const next = swapIn(t, players, 2)
    expect(next).toContain(2)
    expect(next).not.toContain(1)
    expect(next).toHaveLength(11)
  })
})
