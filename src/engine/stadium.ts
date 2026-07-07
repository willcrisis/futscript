import { adjustCash, userLedger } from './finance'
import type { GameState } from './types'

// ponytail: stadium economy constants — retune here and nowhere else
export const INITIAL_CAPACITY: Record<number, number> = { 1: 25_000, 2: 15_000, 3: 9_000 }
export const EXPANSION = { seats: 2000, cost: 600_000, weeks: 6 }

export function clampMood(mood: number): number {
  return Math.max(0, Math.min(100, mood))
}

export function expandStadium(state: GameState): GameState {
  const user = state.teams.find(t => t.id === state.userTeamId)!
  if (state.gameOver || state.construction !== null || user.cash < EXPANSION.cost) return state
  return {
    ...state,
    construction: { addedCapacity: EXPANSION.seats, weeksLeft: EXPANSION.weeks },
    teams: adjustCash(state.teams, state.userTeamId, -EXPANSION.cost),
    finances: userLedger(state, `Stadium expansion (+${EXPANSION.seats} seats)`, -EXPANSION.cost),
  }
}

export function setTicketPrice(state: GameState, price: number): GameState {
  const clamped = Math.max(5, Math.min(60, Math.round(price)))
  return {
    ...state,
    teams: state.teams.map(t => (t.id === state.userTeamId ? { ...t, ticketPrice: clamped } : t)),
  }
}

export function tickConstruction(state: GameState): GameState {
  if (state.construction === null) return state
  const weeksLeft = state.construction.weeksLeft - 1
  if (weeksLeft > 0) return { ...state, construction: { ...state.construction, weeksLeft } }
  return {
    ...state,
    construction: null,
    teams: state.teams.map(t =>
      t.id === state.userTeamId ? { ...t, capacity: t.capacity + state.construction!.addedCapacity } : t,
    ),
    finances: userLedger(state, `Stadium expansion complete (+${state.construction.addedCapacity} seats)`, 0),
  }
}
