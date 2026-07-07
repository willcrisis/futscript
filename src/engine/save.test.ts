import { describe, expect, it } from 'vitest'
import { salaryFor } from './finance'
import { newGame } from './newGame'
import { load, save } from './save'

function fakeStorage(): Storage {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() { return m.size },
  } as Storage
}

describe('save/load', () => {
  it('round-trips a game state', () => {
    const storage = fakeStorage()
    const state = newGame(7)
    save(state, storage)
    expect(load(storage)).toEqual(state)
  })

  it('returns null when nothing is saved', () => {
    expect(load(fakeStorage())).toBeNull()
  })

  it('returns null on version mismatch', () => {
    const storage = fakeStorage()
    storage.setItem('futscript-save', JSON.stringify({ version: 999 }))
    expect(load(storage)).toBeNull()
  })

  it('returns null on corrupted JSON', () => {
    const storage = fakeStorage()
    storage.setItem('futscript-save', '{not json')
    expect(load(storage)).toBeNull()
  })

  it('returns null on literal null', () => {
    const storage = fakeStorage()
    storage.setItem('futscript-save', 'null')
    expect(load(storage)).toBeNull()
  })

  it('migrates a v1 save all the way to v4', () => {
    const storage = fakeStorage()
    const v1 = {
      version: 1, seed: 1, rngState: 1, season: 1, round: 5, userTeamId: 0,
      players: { 1: { id: 1, name: 'P1', age: 25, position: 'GK', level: 50 } },
      teams: [{ id: 0, name: 'T0', playerIds: [1], formation: '4-4-2', lineup: [1] }],
      fixtures: [],
    }
    storage.setItem('futscript-save', JSON.stringify(v1))
    const state = load(storage)
    expect(state!.version).toBe(4)
    expect(state!.players[1]).toMatchObject({
      form: 0, fitness: 100, yellowCards: 0, salary: salaryFor(50), contractSeasons: 2, seasonGoals: 0,
    })
    expect(state!.teams[0]).toMatchObject({ tactic: 'normal', trainingStyle: 'normal', cash: 1_000_000, division: 1 })
    expect(state!.transferList).toEqual([])
    expect(state!.gameOver).toBe(false)
  })

  it('migrates a v2 save to v4', () => {
    const storage = fakeStorage()
    const v2 = {
      version: 2, seed: 1, rngState: 1, season: 1, round: 5, userTeamId: 0,
      players: { 1: {
        id: 1, name: 'P1', age: 25, position: 'GK', level: 50,
        form: 1, fitness: 80, injuredForRounds: 2, suspendedForRounds: 0, yellowCards: 1,
      } },
      teams: [{ id: 0, name: 'T0', playerIds: [1], formation: '4-4-2', lineup: [1], tactic: 'attacking', trainingStyle: 'youth' }],
      fixtures: [],
    }
    storage.setItem('futscript-save', JSON.stringify(v2))
    const state = load(storage)
    expect(state!.version).toBe(4)
    expect(state!.players[1]).toMatchObject({ form: 1, fitness: 80, salary: salaryFor(50), contractSeasons: 2 })
    expect(state!.teams[0]).toMatchObject({ tactic: 'attacking', cash: 1_000_000 })
    expect(state!.loanBalance).toBe(0)
  })

  it('migrates a v3 save to v4', () => {
    const storage = fakeStorage()
    const v3 = {
      version: 3, seed: 1, rngState: 1, season: 2, round: 9, userTeamId: 0,
      players: { 1: {
        id: 1, name: 'P1', age: 25, position: 'GK', level: 50,
        form: 1, fitness: 80, injuredForRounds: 0, suspendedForRounds: 0, yellowCards: 1,
        salary: 6250, contractSeasons: 2,
      } },
      teams: [{ id: 0, name: 'T0', playerIds: [1], formation: '4-4-2', lineup: [1], tactic: 'normal', trainingStyle: 'normal', cash: 500_000 }],
      fixtures: [],
      transferList: [], incomingOffers: [], loanBalance: 100_000, brokeRounds: 2, gameOver: false, finances: [],
    }
    storage.setItem('futscript-save', JSON.stringify(v3))
    const state = load(storage)
    expect(state!.version).toBe(4)
    expect(state!.season).toBe(2) // progress preserved
    expect(state!.round).toBe(9)
    expect(state!.loanBalance).toBe(100_000)
    expect(state!.players[1].seasonGoals).toBe(0)
    expect(state!.teams[0].division).toBe(1) // migrated world lives in Division 1 until expansion
    expect(state!.cupFixtures).toEqual([])
    expect(state!.history).toEqual([])
    expect(state!.playFriendlies).toBe(false)
  })
})
