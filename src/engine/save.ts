import { salaryFor } from './finance'
import type { GameState } from './types'

const KEY = 'futscript-save'

export function save(state: GameState, storage: Storage = localStorage): void {
  storage.setItem(KEY, JSON.stringify(state))
}

export function load(storage: Storage = localStorage): GameState | null {
  const raw = storage.getItem(KEY)
  if (!raw) return null
  try {
    let state = JSON.parse(raw)
    if (state?.version === 1) state = migrateV1(state)
    if (state?.version === 2) state = migrateV2(state)
    return state?.version === 3 ? (state as GameState) : null
  } catch {
    return null
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function migrateV1(s: any): any {
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

function migrateV2(s: any): GameState {
  return {
    ...s,
    version: 3,
    players: Object.fromEntries(
      Object.values<any>(s.players).map(p => [p.id, { ...p, salary: salaryFor(p.level), contractSeasons: 2 }]),
    ),
    teams: s.teams.map((t: any) => ({ ...t, cash: 1_000_000 })),
    transferList: [],
    incomingOffers: [],
    loanBalance: 0,
    brokeRounds: 0,
    gameOver: false,
    finances: [],
  }
}
