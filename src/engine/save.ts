import { salaryFor } from './finance'
import { INITIAL_CAPACITY } from './stadium'
import type { GameState } from './types'

const LEGACY_KEY = 'futscript-save'
const SLOT_KEY = (slot: number) => `futscript-slot-${slot}`
const ACTIVE_KEY = 'futscript-active-slot'
export const SLOTS = [1, 2, 3]

// The one migration entry point: raw parsed JSON in, current GameState (or null) out.
export function migrateToCurrent(raw: unknown): GameState | null {
  try {
    let state = raw as any
    if (state?.version === 1) state = migrateV1(state)
    if (state?.version === 2) state = migrateV2(state)
    if (state?.version === 3) state = migrateV3(state)
    if (state?.version === 4) state = migrateV4(state)
    if (state?.version === 5) state = migrateV5(state)
    if (state?.version !== 6) return null
    const shaped =
      Array.isArray(state.teams) &&
      state.players !== null &&
      typeof state.players === 'object' &&
      typeof state.userTeamId === 'number' &&
      state.teams.some((t: any) => t?.id === state.userTeamId)
    return shaped ? (state as GameState) : null
  } catch {
    return null
  }
}

export function activeSlot(storage: Storage = localStorage): number {
  const raw = Number(storage.getItem(ACTIVE_KEY))
  return SLOTS.includes(raw) ? raw : 1
}

export function setActiveSlot(slot: number, storage: Storage = localStorage): void {
  if (SLOTS.includes(slot)) storage.setItem(ACTIVE_KEY, String(slot))
}

function parseSlot(slot: number, storage: Storage): GameState | null {
  const raw = storage.getItem(SLOT_KEY(slot))
  if (!raw) return null
  try {
    return migrateToCurrent(JSON.parse(raw))
  } catch {
    return null
  }
}

export function save(state: GameState, storage: Storage = localStorage): void {
  storage.setItem(SLOT_KEY(activeSlot(storage)), JSON.stringify(state))
}

export function load(storage: Storage = localStorage): GameState | null {
  const legacy = storage.getItem(LEGACY_KEY)
  if (legacy && !storage.getItem(SLOT_KEY(1))) {
    storage.setItem(SLOT_KEY(1), legacy)
    storage.removeItem(LEGACY_KEY)
  }
  return parseSlot(activeSlot(storage), storage)
}

export function loadSlot(slot: number, storage: Storage = localStorage): GameState | null {
  return parseSlot(slot, storage)
}

export function saveToSlot(state: GameState, slot: number, storage: Storage = localStorage): void {
  if (SLOTS.includes(slot)) storage.setItem(SLOT_KEY(slot), JSON.stringify(state))
}

export function deleteSlot(slot: number, storage: Storage = localStorage): void {
  storage.removeItem(SLOT_KEY(slot))
}

export interface SlotInfo {
  slot: number
  season: number
  teamName: string
  division: number
  cash: number
}

export function listSlots(storage: Storage = localStorage): (SlotInfo | null)[] {
  return SLOTS.map(slot => {
    const state = parseSlot(slot, storage)
    if (!state) return null
    const user = state.teams.find(t => t.id === state.userTeamId)!
    return { slot, season: state.season, teamName: user.name, division: user.division, cash: user.cash }
  })
}

export function exportSave(state: GameState): string {
  return JSON.stringify(state)
}

export function importSave(json: string): GameState | null {
  try {
    return migrateToCurrent(JSON.parse(json))
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

function migrateV2(s: any): any {
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

// Migrated worlds keep their 16 clubs as Division 1; the next season
// rollover generates Divisions 2 and 3 (ensureThreeDivisions).
function migrateV3(s: any): any {
  return {
    ...s,
    version: 4,
    players: Object.fromEntries(
      Object.values<any>(s.players).map(p => [p.id, { ...p, seasonGoals: 0 }]),
    ),
    teams: s.teams.map((t: any) => ({ ...t, division: 1 })),
    cupFixtures: [],
    history: [],
    playFriendlies: false,
  }
}

function migrateV4(s: any): any {
  return {
    ...s,
    version: 5,
    teams: s.teams.map((t: any) => ({
      ...t,
      capacity: INITIAL_CAPACITY[t.division] ?? INITIAL_CAPACITY[3],
      ticketPrice: 15,
      fanMood: 50,
    })),
    construction: null,
    allTimeScorers: [],
  }
}

function migrateV5(s: any): GameState {
  return {
    ...s,
    version: 6,
    news: [],
  }
}
