import type { GameState } from './types'

const KEY = 'futscript-save'

export function save(state: GameState, storage: Storage = localStorage): void {
  storage.setItem(KEY, JSON.stringify(state))
}

export function load(storage: Storage = localStorage): GameState | null {
  const raw = storage.getItem(KEY)
  if (!raw) return null
  try {
    const state = JSON.parse(raw)
    if (state?.version === 2) return state as GameState
    if (state?.version === 1) return migrateV1(state)
    return null
  } catch {
    return null
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function migrateV1(s: any): GameState {
  return {
    ...s,
    version: 2,
    players: Object.fromEntries(
      Object.values<any>(s.players).map(p => [p.id, {
        ...p, form: 0, fitness: 100, injuredForRounds: 0, suspendedForRounds: 0, yellowCards: 0,
      }]),
    ),
    teams: s.teams.map((t: any) => ({ ...t, tactic: 'normal', trainingStyle: 'normal' })),
  }
}
