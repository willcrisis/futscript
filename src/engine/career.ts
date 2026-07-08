import { standings } from './standings'
import type { GameState, Player, Team } from './types'

// ponytail: career tuning — retune here and nowhere else
export const CONFIDENCE_START = 60
export const REPUTATION_START = 30
export const POOL_CAP = 20
export const MAX_JOB_OFFERS = 3
export const JOB_OFFER_ROUNDS = 3
export const TAKEOVER_SQUAD = 16 // sellable headroom above MIN_SQUAD on day one

export function teamStrength(team: Team, players: Record<number, Player>): number {
  const levels = team.playerIds.map(id => players[id].level).sort((a, b) => b - a)
  return levels.slice(0, 11).reduce((sum, l) => sum + l, 0)
}

// 1 = strongest squad in the division: what the board expects the table to look like
export function expectedRank(state: GameState, teamId: number): number {
  const division = state.teams.find(t => t.id === teamId)!.division
  const ranked = state.teams
    .filter(t => t.division === division)
    .map(t => ({ id: t.id, strength: teamStrength(t, state.players) }))
    .sort((a, b) => b.strength - a.strength)
  return ranked.findIndex(r => r.id === teamId) + 1
}

export function positionOf(state: GameState, teamId: number): number {
  const division = state.teams.find(t => t.id === teamId)!.division
  return standings(state, division).findIndex(r => r.teamId === teamId) + 1
}
