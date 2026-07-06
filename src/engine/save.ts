import type { GameState } from './types'

const KEY = 'futscript-save'

export function save(state: GameState, storage: Storage = localStorage): void {
  storage.setItem(KEY, JSON.stringify(state))
}

export function load(storage: Storage = localStorage): GameState | null {
  const raw = storage.getItem(KEY)
  if (!raw) return null
  const state = JSON.parse(raw) as GameState
  return state.version === 1 ? state : null
}
