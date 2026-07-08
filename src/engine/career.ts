import { randomName } from './names'
import { pushNews } from './news'
import { randInt } from './rng'
import { standings } from './standings'
import type { GameState, Player, Team } from './types'
import { isManaged } from './types'

// ponytail: career tuning — retune here and nowhere else
export const CONFIDENCE_START = 60
export const REPUTATION_START = 30
export const POOL_CAP = 20
export const MAX_JOB_OFFERS = 3
export const JOB_OFFER_ROUNDS = 3
export const TAKEOVER_SQUAD = 16 // sellable headroom above MIN_SQUAD on day one
export const POOL_HIRE_CHANCE = 0.7
export const AI_SACK_WEEKLY = 0.08
export const AI_SACK_FROM_WEEK = 8
export const AI_SACK_GAP = 5
export const AI_SACK_RELEGATED = 0.7
export const AI_SACK_FLOP = 0.4

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

function userDivision(state: GameState): number {
  return state.teams.find(t => t.id === state.userTeamId)!.division
}

export function hireManager(state: GameState, teamId: number, rand: () => number, week?: number): GameState {
  const pool = [...state.unemployedPool]
  const fromPool = pool.length > 0 && rand() < POOL_HIRE_CHANCE
  const name = fromPool ? pool.splice(randInt(rand, 0, pool.length - 1), 1)[0] : randomName(rand)
  const club = state.teams.find(t => t.id === teamId)!
  let s: GameState = {
    ...state,
    unemployedPool: pool,
    teams: state.teams.map(t => (t.id === teamId ? { ...t, manager: name, managerHiredSeason: state.season } : t)),
  }
  if (club.division === userDivision(state)) s = pushNews(s, 'managerHired', { club: club.name, manager: name }, week)
  return s
}

export function sackAiManager(state: GameState, teamId: number, rand: () => number, week?: number): GameState {
  const club = state.teams.find(t => t.id === teamId)!
  let s = state
  if (club.division === userDivision(state)) s = pushNews(s, 'managerSacked', { club: club.name, manager: club.manager }, week)
  // hire BEFORE pooling the old name — a club must not rehire the manager it just sacked
  s = hireManager(s, teamId, rand, week)
  return { ...s, unemployedPool: [...s.unemployedPool, club.manager].slice(-POOL_CAP) }
}

function runAiSackings(state: GameState, rand: () => number): GameState {
  if (state.round < AI_SACK_FROM_WEEK) return state // early tables are noise
  let s = state
  for (const team of state.teams) {
    if (isManaged(s, team.id)) continue
    if (team.managerHiredSeason === s.season) continue // one sacking per club per season
    if (positionOf(s, team.id) - expectedRank(s, team.id) < AI_SACK_GAP) continue
    if (rand() < AI_SACK_WEEKLY) s = sackAiManager(s, team.id, rand)
  }
  return s
}

// The weekly career tick. Extended by later tasks (confidence, sackings, job market).
export function runCareerWeek(state: GameState, rand: () => number): GameState {
  return runAiSackings(state, rand)
}

// Season-end carousel: boards react to the final table. Extended in Task 6 with the user's verdict.
export function runCareerSeasonEnd(state: GameState, rand: () => number, week: number): GameState {
  let s = state
  for (const team of state.teams) {
    if (isManaged(s, team.id)) continue
    if (team.managerHiredSeason === s.season) continue
    const pos = positionOf(s, team.id)
    const size = s.teams.filter(t => t.division === team.division).length
    const relegated = team.division < 3 && pos > size - 3
    const flop = pos - expectedRank(s, team.id) >= AI_SACK_GAP
    const p = relegated ? AI_SACK_RELEGATED : flop ? AI_SACK_FLOP : 0
    if (p > 0 && rand() < p) s = sackAiManager(s, team.id, rand, week)
  }
  return s
}
