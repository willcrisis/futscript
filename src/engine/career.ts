import { cupWinner } from './cup'
import { BROKE_ROUNDS_LIMIT, LOAN_CAP } from './finance'
import { randomName } from './names'
import { pushNews } from './news'
import { mulberry32, randInt } from './rng'
import { makeRookie } from './rollover'
import { standings } from './standings'
import type { GameState, Player, Team } from './types'
import { isActive, isManaged } from './types'

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
export const CONFIDENCE_FROM_WEEK = 4
export const REP_SACKED = -12
export const REP_TITLE = 10
export const REP_PROMOTION = 8
export const REP_CUP = 6
export const REP_OVERPERFORM = 4
export const JOB_OFFER_CHANCE = 0.4
export const POACH_WEEKLY = 0.03
export const POACH_SEASON_END = 0.5
export const REP_D1 = 65
export const REP_D2 = 45

const clamp = (n: number) => Math.max(0, Math.min(100, n))

export function teamStrength(team: Team, players: Record<number, Player>): number {
  const levels = team.playerIds.map(id => players[id].level).sort((a, b) => b - a)
  return levels.slice(0, 11).reduce((sum, l) => sum + l, 0)
}

// 1 = strongest squad in the division: what the board expects the table to look like
export function expectedRank(state: GameState, teamId: number): number {
  const division = state.teams.find(t => t.id === teamId)!.division
  const ranked = state.teams
    .filter(t => t.division === division && isActive(t, state.season))
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

function weeklyDelta(gap: number): number {
  if (gap >= 3) return 2
  if (gap >= 1) return 1
  if (gap <= -5) return -3
  if (gap <= -3) return -2
  if (gap <= -1) return -1
  return 0
}

function updateConfidence(state: GameState): GameState {
  if (state.round < CONFIDENCE_FROM_WEEK) return state // early tables are noise
  const pos = positionOf(state, state.userTeamId)
  const division = userDivision(state)
  const size = state.teams.filter(t => t.division === division && isActive(t, state.season)).length
  let delta = weeklyDelta(expectedRank(state, state.userTeamId) - pos)
  if (division < 3 && pos > size - 3) delta -= 1 // the drop zone stings extra
  if (state.manager.hiredSeason === state.season) delta = Math.max(0, delta) // honeymoon: gains only
  return { ...state, manager: { ...state.manager, confidence: clamp(state.manager.confidence + delta) } }
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

export function sackUser(state: GameState, rand: () => number, week?: number): GameState {
  const club = state.teams.find(t => t.id === state.userTeamId)!
  let s = pushNews(state, 'userSacked', { club: club.name }, week)
  s = {
    ...s,
    manager: {
      ...s.manager,
      employed: false,
      reputation: clamp(s.manager.reputation + REP_SACKED),
      jobOffers: [],
    },
    loanBalance: 0, // the debt stays with the club's board, not the manager
    brokeRounds: 0,
    construction: null, // ponytail: an in-flight expansion is abandoned with the job
  }
  return hireManager(s, s.userTeamId, rand, week)
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

export function restructuredLoan(team: Team): number {
  return Math.min(Math.max(0, -team.cash), LOAN_CAP)
}

function ageJobOffers(state: GameState): GameState {
  if (state.manager.jobOffers.length === 0) return state
  const jobOffers = state.manager.jobOffers
    .map(o => ({ ...o, roundsLeft: o.roundsLeft - 1 }))
    .filter(o => o.roundsLeft > 0)
  return { ...state, manager: { ...state.manager, jobOffers } }
}

function pushJobOffer(state: GameState, teamId: number, week?: number): GameState {
  const club = state.teams.find(t => t.id === teamId)!
  const next: GameState = {
    ...state,
    manager: { ...state.manager, jobOffers: [...state.manager.jobOffers, { teamId, roundsLeft: JOB_OFFER_ROUNDS }] },
  }
  return pushNews(next, 'jobOffer', { club: club.name }, week)
}

function generateJobOffers(state: GameState, rand: () => number): GameState {
  if (state.manager.jobOffers.length >= MAX_JOB_OFFERS || rand() >= JOB_OFFER_CHANCE) return state
  const rep = state.manager.reputation
  const divisions = rep >= REP_D1 ? [1, 2, 3] : rep >= REP_D2 ? [2, 3] : [3]
  const offering = new Set(state.manager.jobOffers.map(o => o.teamId))
  const candidates = state.teams.filter(
    t => divisions.includes(t.division) && t.id !== state.userTeamId && !offering.has(t.id),
  )
  // strugglers are where jobs open up
  const size = 16
  const strugglers = candidates.filter(t => positionOf(state, t.id) > size / 2)
  const from = strugglers.length > 0 ? strugglers : candidates
  if (from.length === 0) return state
  return pushJobOffer(state, from[randInt(rand, 0, from.length - 1)].id)
}

function maybePoach(state: GameState, rand: () => number): GameState {
  const division = userDivision(state)
  // ponytail: poaching only reaches down from the division above — D1 benches don't get poached
  if (division === 1 || state.round < AI_SACK_FROM_WEEK) return state
  if (state.manager.jobOffers.length > 0) return state
  if (expectedRank(state, state.userTeamId) - positionOf(state, state.userTeamId) < 3) return state
  if (rand() >= POACH_WEEKLY) return state
  const richer = state.teams.filter(t => t.division === division - 1)
  return pushJobOffer(state, richer[randInt(rand, 0, richer.length - 1)].id)
}

export function declineOffer(state: GameState, teamId: number): GameState {
  return {
    ...state,
    manager: { ...state.manager, jobOffers: state.manager.jobOffers.filter(o => o.teamId !== teamId) },
  }
}

export function renameManager(state: GameState, name: string): GameState {
  const trimmed = name.trim()
  return trimmed ? { ...state, manager: { ...state.manager, name: trimmed } } : state
}

function topUpSquad(state: GameState, teamId: number, rand: () => number): GameState {
  const team = state.teams.find(t => t.id === teamId)!
  const need = TAKEOVER_SQUAD - team.playerIds.length
  if (need <= 0) return state
  const players = { ...state.players }
  let nextId = Math.max(0, ...Object.keys(players).map(Number)) + 1
  const ids: number[] = []
  for (let i = 0; i < need; i++) {
    const rookie = makeRookie(rand, nextId++)
    players[rookie.id] = rookie
    ids.push(rookie.id)
  }
  return {
    ...state,
    players,
    teams: state.teams.map(t => (t.id === teamId ? { ...t, playerIds: [...t.playerIds, ...ids] } : t)),
  }
}

// A UI action: derives its own rand from rngState and re-captures it, so the
// result is deterministic from the save and the weekly stream is not reused.
export function acceptJob(state: GameState, teamId: number): GameState {
  if (!state.manager.jobOffers.some(o => o.teamId === teamId)) return state
  const rand = mulberry32(state.rngState)
  let s = state
  if (s.manager.employed) s = hireManager(s, s.userTeamId, rand) // the old bench gets a new face
  const target = s.teams.find(t => t.id === teamId)!
  s = { ...s, unemployedPool: [...s.unemployedPool, target.manager].slice(-POOL_CAP) }
  s = { ...s, userTeamId: teamId } // from here "user division" means the new club (news filters)
  s = pushNews(s, 'managerSacked', { club: target.name, manager: target.manager })
  const debt = restructuredLoan(target)
  s = {
    ...s,
    teams: s.teams.map(t =>
      t.id === teamId
        ? { ...t, manager: s.manager.name, managerHiredSeason: s.season, cash: Math.max(0, t.cash) }
        : t,
    ),
    loanBalance: debt, // the board restructures: overdraft becomes a loan, the rest written off
    brokeRounds: 0,
    incomingOffers: [],
    finances: [], // fresh ledger for the new club
    construction: null,
    manager: {
      ...s.manager,
      employed: true,
      confidence: CONFIDENCE_START,
      hiredSeason: s.season,
      jobOffers: [],
    },
  }
  s = topUpSquad(s, teamId, rand)
  s = pushNews(s, 'userHired', { club: target.name, manager: s.manager.name })
  return { ...s, rngState: randInt(rand, 1, 2 ** 31 - 1) }
}

// The weekly career tick. Extended by later tasks (job market).
export function runCareerWeek(state: GameState, rand: () => number): GameState {
  let s = ageJobOffers(state)
  s = runAiSackings(s, rand)
  if (!s.manager.employed) return generateJobOffers(s, rand)
  s = updateConfidence(s)
  if (s.manager.confidence <= 0 || s.brokeRounds >= BROKE_ROUNDS_LIMIT) return sackUser(s, rand)
  return maybePoach(s, rand)
}

// Season-end carousel: boards react to the final table, including the user's own verdict.
export function runCareerSeasonEnd(state: GameState, rand: () => number, week: number): GameState {
  let s = state
  for (const team of state.teams) {
    if (isManaged(s, team.id)) continue
    if (team.managerHiredSeason === s.season) continue
    const pos = positionOf(s, team.id)
    const size = s.teams.filter(t => t.division === team.division && isActive(t, s.season)).length
    const relegated = team.division < 3 && pos > size - 3
    const flop = pos - expectedRank(s, team.id) >= AI_SACK_GAP
    const p = relegated ? AI_SACK_RELEGATED : flop ? AI_SACK_FLOP : 0
    if (p > 0 && rand() < p) s = sackAiManager(s, team.id, rand, week)
  }

  if (!s.manager.employed) return s
  const user = s.teams.find(t => t.id === s.userTeamId)!
  const pos = positionOf(s, s.userTeamId)
  const size = s.teams.filter(t => t.division === user.division && isActive(t, s.season)).length
  const gap = expectedRank(s, s.userTeamId) - pos
  const honeymoon = s.manager.hiredSeason === s.season
  let conf = 0
  let rep = 0
  if (pos === 1 && user.division === 1) { conf += 20; rep += REP_TITLE }
  if (user.division > 1 && pos <= 3) { conf += 15; rep += REP_PROMOTION }
  if (cupWinner(s) === s.userTeamId) { conf += 15; rep += REP_CUP }
  if (gap >= 3) { conf += 10; rep += REP_OVERPERFORM }
  if (!honeymoon) {
    if (user.division < 3 && pos > size - 3) conf -= 25 // relegation
    else if (gap <= -5) conf -= 10 // flop
  }
  s = {
    ...s,
    manager: {
      ...s.manager,
      confidence: clamp(s.manager.confidence + conf),
      reputation: clamp(s.manager.reputation + rep),
    },
  }
  if (s.manager.confidence <= 0) s = sackUser(s, rand, week)
  if (s.manager.employed && gap >= 3 && user.division > 1 && rand() < POACH_SEASON_END) {
    const offering = new Set(s.manager.jobOffers.map(o => o.teamId))
    const richer = s.teams.filter(t => t.division === user.division - 1 && !offering.has(t.id))
    if (richer.length > 0) s = pushJobOffer(s, richer[randInt(rand, 0, richer.length - 1)].id, week)
  }
  return s
}
