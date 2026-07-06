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
})
