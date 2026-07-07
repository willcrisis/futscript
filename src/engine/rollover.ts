import { cupWinner } from './cup'
import { salaryFor, STARTING_CASH } from './finance'
import { autoPick } from './lineup'
import { randomName, TEAM_NAMES } from './names'
import { LEVEL_RANGE, SQUAD_TEMPLATE } from './newGame'
import { randInt } from './rng'
import { standings } from './standings'
import type { GameState, Player, Position, SeasonRecord, Team } from './types'

// bottom three of each upper division swap with the top three below it
export function applyPromotionRelegation(state: GameState, teams: Team[]): Team[] {
  let next = teams
  for (const upper of [1, 2]) {
    const lower = upper + 1
    const upperTable = standings(state, upper)
    const lowerTable = standings(state, lower)
    if (upperTable.length === 0 || lowerTable.length === 0) continue
    const relegated = new Set(upperTable.slice(-3).map(r => r.teamId))
    const promoted = new Set(lowerTable.slice(0, 3).map(r => r.teamId))
    next = next.map(t =>
      relegated.has(t.id) ? { ...t, division: lower }
      : promoted.has(t.id) ? { ...t, division: upper }
      : t,
    )
  }
  return next
}

export function retirePlayers(
  players: Record<number, Player>,
  teams: Team[],
  rand: () => number,
): { players: Record<number, Player>; teams: Team[] } {
  const retired = new Set<number>()
  const nextPlayers = { ...players }
  for (const p of Object.values(players)) {
    const chance = p.age >= 36 ? 1 : p.age === 35 ? 0.65 : p.age === 34 ? 0.35 : 0
    if (chance > 0 && rand() < chance) {
      retired.add(p.id)
      delete nextPlayers[p.id]
    }
  }
  return {
    players: nextPlayers,
    teams: teams.map(t => ({
      ...t,
      playerIds: t.playerIds.filter(id => !retired.has(id)),
      lineup: t.lineup.filter(id => !retired.has(id)),
    })),
  }
}

// GK 1/6, DF 2/6, MF 2/6, FW 1/6
const YOUTH_POSITIONS: Position[] = ['GK', 'DF', 'DF', 'MF', 'MF', 'FW']

function nextFreeId(players: Record<number, Player>): number {
  return Math.max(0, ...Object.keys(players).map(Number)) + 1
}

export function youthIntake(
  players: Record<number, Player>,
  teams: Team[],
  rand: () => number,
): { players: Record<number, Player>; teams: Team[] } {
  const nextPlayers = { ...players }
  let nextId = nextFreeId(players)
  const nextTeams = teams.map(team => {
    const count = team.playerIds.length >= 20 ? 0 : team.playerIds.length < 16 ? 2 : 1
    if (count === 0) return team
    const ids: number[] = []
    for (let i = 0; i < count; i++) {
      const level = randInt(rand, 22, 45)
      const rookie: Player = {
        id: nextId++,
        name: randomName(rand),
        age: randInt(rand, 16, 18),
        position: YOUTH_POSITIONS[randInt(rand, 0, YOUTH_POSITIONS.length - 1)],
        level,
        form: 0, fitness: 100, injuredForRounds: 0, suspendedForRounds: 0, yellowCards: 0,
        salary: salaryFor(level),
        contractSeasons: 3,
        seasonGoals: 0,
      }
      nextPlayers[rookie.id] = rookie
      ids.push(rookie.id)
    }
    return { ...team, playerIds: [...team.playerIds, ...ids] }
  })
  return { players: nextPlayers, teams: nextTeams }
}

// Migrated (pre-division) worlds arrive with 16 clubs in Division 1;
// the first rollover fills in Divisions 2 and 3.
export function ensureThreeDivisions(
  players: Record<number, Player>,
  teams: Team[],
  rand: () => number,
): { players: Record<number, Player>; teams: Team[] } {
  const missing = [2, 3].filter(d => !teams.some(t => t.division === d))
  if (missing.length === 0) return { players, teams }
  const usedNames = new Set(teams.map(t => t.name))
  const freeNames = TEAM_NAMES.filter(n => !usedNames.has(n))
  let nameIndex = 0
  let nextTeamId = Math.max(...teams.map(t => t.id)) + 1
  let nextId = nextFreeId(players)
  const nextPlayers = { ...players }
  const nextTeams = [...teams]
  for (const division of missing) {
    const [lo, hi] = LEVEL_RANGE[division]
    for (let i = 0; i < 16; i++) {
      const playerIds: number[] = []
      for (const position of SQUAD_TEMPLATE) {
        const level = randInt(rand, lo, hi)
        const player: Player = {
          id: nextId++,
          name: randomName(rand),
          age: randInt(rand, 17, 34),
          position,
          level,
          form: 0, fitness: 100, injuredForRounds: 0, suspendedForRounds: 0, yellowCards: 0,
          salary: salaryFor(level),
          contractSeasons: randInt(rand, 1, 3),
          seasonGoals: 0,
        }
        nextPlayers[player.id] = player
        playerIds.push(player.id)
      }
      const team: Team = {
        id: nextTeamId++,
        name: freeNames[nameIndex++] ?? `AC Interior ${nextTeamId}`,
        playerIds,
        formation: '4-4-2',
        lineup: [],
        tactic: 'normal',
        trainingStyle: 'normal',
        cash: STARTING_CASH,
        division,
      }
      team.lineup = autoPick(team, nextPlayers)
      nextTeams.push(team)
    }
  }
  return { players: nextPlayers, teams: nextTeams }
}

export function seasonRecord(state: GameState): SeasonRecord {
  const divisions = [...new Set(state.teams.map(t => t.division))].sort()
  const champions = divisions.map(d => {
    const top = standings(state, d)[0]
    return state.teams.find(t => t.id === top.teamId)!.name
  })
  const winnerId = cupWinner(state)
  const everyone = Object.values(state.players)
  const top = everyone.reduce((best, p) => (p.seasonGoals > best.seasonGoals ? p : best), everyone[0])
  const topTeam = state.teams.find(t => t.playerIds.includes(top.id))
  const userDivision = state.teams.find(t => t.id === state.userTeamId)!.division
  return {
    season: state.season,
    champions,
    cupWinner: winnerId === null ? '—' : state.teams.find(t => t.id === winnerId)!.name,
    topScorer: { player: top.name, team: topTeam?.name ?? 'free agent', goals: top.seasonGoals },
    userDivision,
    userPosition: standings(state, userDivision).findIndex(r => r.teamId === state.userTeamId) + 1,
  }
}
