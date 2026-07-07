import { describe, expect, it } from 'vitest'
import { autoPick, isAvailable, patchLineup, swapIn } from './lineup'
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

  it('replaces the weakest starter overall when the lineup has no player of the bench player position', () => {
    const { team, players } = makeSquad()
    // both GKs injured — autoPick back-fills the hole with an outfielder
    players[1] = { ...players[1], injuredForRounds: 2 }
    players[2] = { ...players[2], injuredForRounds: 2 }
    const lineup = autoPick(team, players)
    expect(lineup.some(id => players[id].position === 'GK')).toBe(false)
    const t = { ...team, lineup }
    // GK 2 recovers and the user clicks his Start button
    const recovered: Record<number, Player> = { ...players, 2: { ...players[2], injuredForRounds: 0 } }
    let next: number[] = []
    expect(() => {
      next = swapIn(t, recovered, 2)
    }).not.toThrow()
    expect(next).toHaveLength(11)
    expect(next).toContain(2)
    expect(new Set(next).size).toBe(11)
  })
})

describe('availability', () => {
  it('isAvailable is true only when neither injured nor suspended', () => {
    const { players } = makeSquad()
    expect(isAvailable(players[1])).toBe(true)
    expect(isAvailable({ ...players[1], injuredForRounds: 2 })).toBe(false)
    expect(isAvailable({ ...players[1], suspendedForRounds: 1 })).toBe(false)
  })

  it('autoPick skips injured and suspended players', () => {
    const { team, players } = makeSquad()
    players[1] = { ...players[1], injuredForRounds: 3 } // best GK out
    players[3] = { ...players[3], suspendedForRounds: 1 } // best DF out
    const lineup = autoPick(team, players)
    expect(lineup).toHaveLength(11)
    expect(lineup).not.toContain(1)
    expect(lineup).not.toContain(3)
    expect(lineup).toContain(2) // backup GK steps in
  })

  it('autoPick back-fills from other positions when a group runs dry', () => {
    const { team, players } = makeSquad()
    players[1] = { ...players[1], injuredForRounds: 2 }
    players[2] = { ...players[2], injuredForRounds: 2 } // both GKs out
    const lineup = autoPick(team, players)
    expect(lineup).toHaveLength(11) // still fields 11, someone deputizes
    expect(lineup).not.toContain(1)
    expect(lineup).not.toContain(2)
  })

  it('patchLineup keeps available starters and replaces unavailable ones', () => {
    const { team, players } = makeSquad()
    const original = autoPick(team, players)
    const t = { ...team, lineup: original }
    const starter = original.find(id => players[id].position === 'MF')!
    players[starter] = { ...players[starter], suspendedForRounds: 1 }
    const patched = patchLineup(t, players)
    expect(patched).toHaveLength(11)
    expect(patched).not.toContain(starter)
    // every other starter kept
    for (const id of original) if (id !== starter) expect(patched).toContain(id)
    // replacement is the best benched MF (all MFs available: ids 9-14, 9-12 start in 4-4-2 → 13 is next)
    expect(patched).toContain(13)
  })

  it('patchLineup returns the lineup unchanged when everyone is available', () => {
    const { team, players } = makeSquad()
    const original = autoPick(team, players)
    expect(patchLineup({ ...team, lineup: original }, players)).toEqual(original)
  })

  it('patchLineup restores formation shape once a back-filled hole recovers', () => {
    const { team, players } = makeSquad()
    // both GKs injured — autoPick fields 11 with no GK, an outfielder deputizes
    players[1] = { ...players[1], injuredForRounds: 2 }
    players[2] = { ...players[2], injuredForRounds: 2 }
    const backfilled = autoPick(team, players)
    expect(backfilled.some(id => players[id].position === 'GK')).toBe(false)
    const t = { ...team, lineup: backfilled }
    // both GKs recover
    const recovered: Record<number, Player> = {
      ...players,
      1: { ...players[1], injuredForRounds: 0 },
      2: { ...players[2], injuredForRounds: 0 },
    }
    const patched = patchLineup(t, recovered)
    expect(patched).toHaveLength(11)
    expect(patched.some(id => recovered[id].position === 'GK')).toBe(true)
    const counts: Record<Position, number> = { GK: 0, DF: 0, MF: 0, FW: 0 }
    for (const id of patched) counts[recovered[id].position]++
    expect(counts).toEqual(FORMATIONS['4-4-2'])
  })
})

describe('degraded squads (fewer than 11 available)', () => {
  it('autoPick and patchLineup return all available players without crashing', () => {
    const { team, players } = makeSquad()
    const injured = { ...players }
    for (const id of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      injured[id] = { ...injured[id], injuredForRounds: 3 }
    }
    const available = Object.values(injured).filter(isAvailable)
    expect(available.length).toBeLessThan(11)

    const picked = autoPick(team, injured)
    expect(picked).toHaveLength(available.length)
    expect(picked.every(id => isAvailable(injured[id]))).toBe(true)
    expect(new Set(picked).size).toBe(picked.length)

    const t = { ...team, lineup: picked }
    const patched = patchLineup(t, injured)
    expect(patched).toHaveLength(available.length)
    expect(patched.every(id => isAvailable(injured[id]))).toBe(true)
    expect(new Set(patched).size).toBe(patched.length)
  })
})
