import { describe, expect, it } from 'vitest'
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

  it('migrates a v1 save to v2 with default new fields', () => {
    const storage = fakeStorage()
    const v1 = {
      version: 1, seed: 1, rngState: 1, season: 1, round: 5, userTeamId: 0,
      players: { 1: { id: 1, name: 'P1', age: 25, position: 'GK', level: 50 } },
      teams: [{ id: 0, name: 'T0', playerIds: [1], formation: '4-4-2', lineup: [1] }],
      fixtures: [],
    }
    storage.setItem('futscript-save', JSON.stringify(v1))
    const state = load(storage)
    expect(state).not.toBeNull()
    expect(state!.version).toBe(2)
    expect(state!.round).toBe(5) // progress preserved
    expect(state!.players[1]).toMatchObject({
      level: 50, form: 0, fitness: 100, injuredForRounds: 0, suspendedForRounds: 0, yellowCards: 0,
    })
    expect(state!.teams[0]).toMatchObject({ tactic: 'normal', trainingStyle: 'normal' })
  })
})
