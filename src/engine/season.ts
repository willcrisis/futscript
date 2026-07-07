import { drawNextCupRound } from './cup'
import { adjustCash, runWeeklyFinances } from './finance'
import { generateDivisionFixtures } from './fixtures'
import { autoPick, patchLineup } from './lineup'
import { simulateMatch } from './match'
import { mulberry32, randInt } from './rng'
import { standings } from './standings'
import { ageSquads, applyWeeklyUpdates } from './training'
import { renewalSalary, runTransfers } from './transfers'
import type { GameState, MatchEvent, Player } from './types'

export function totalRounds(state: GameState): number {
  return Math.max(
    ...state.fixtures.map(f => f.round),
    ...state.cupFixtures.map(f => f.week),
  )
}

export function applyMatchConsequences(
  players: Record<number, Player>,
  events: MatchEvent[],
  rand: () => number,
): Record<number, Player> {
  const next = { ...players }
  for (const e of events) {
    const p = next[e.playerId]
    if (!p) continue // event for a player no longer in the world
    if (e.type === 'goal') {
      next[p.id] = { ...p, seasonGoals: p.seasonGoals + 1 }
    } else if (e.type === 'yellow') {
      const yellows = p.yellowCards + 1
      next[p.id] = yellows >= 3
        ? { ...p, yellowCards: 0, suspendedForRounds: 1 }
        : { ...p, yellowCards: yellows }
    } else if (e.type === 'red') {
      next[p.id] = { ...p, suspendedForRounds: randInt(rand, 1, 2) }
    } else if (e.type === 'injury') {
      const rounds = randInt(rand, 1, 6)
      const levelLoss = rounds >= 4 ? randInt(rand, 1, 2) : 0
      next[p.id] = { ...p, injuredForRounds: rounds, level: Math.max(1, p.level - levelLoss) }
    }
  }
  return next
}

export function advanceRound(state: GameState): GameState {
  if (state.gameOver || state.round > totalRounds(state)) return state
  const rand = mulberry32(state.rngState)
  const week = state.round

  const leagueToday = state.fixtures.filter(f => f.round === week)
  const cupToday = state.cupFixtures.filter(f => f.week === week)
  const playingIds = new Set([...leagueToday, ...cupToday].flatMap(f => [f.homeId, f.awayId]))

  // refresh lineups only for clubs that play this week
  const teams = state.teams.map(t =>
    playingIds.has(t.id)
      ? { ...t, lineup: t.id === state.userTeamId ? patchLineup(t, state.players) : autoPick(t, state.players) }
      : t,
  )
  const byId = new Map(teams.map(t => [t.id, t]))

  const roundEvents: MatchEvent[] = []
  const fixtures = state.fixtures.map(f => {
    if (f.round !== week) return f
    const result = simulateMatch(byId.get(f.homeId)!, byId.get(f.awayId)!, state.players, rand)
    roundEvents.push(...result.events)
    return { ...f, homeGoals: result.homeGoals, awayGoals: result.awayGoals, events: result.events }
  })

  let cupFixtures = state.cupFixtures.map(f => {
    if (f.week !== week || f.winnerId !== null) return f
    const result = simulateMatch(byId.get(f.homeId)!, byId.get(f.awayId)!, state.players, rand)
    roundEvents.push(...result.events)
    const winnerId =
      result.homeGoals > result.awayGoals ? f.homeId
      : result.awayGoals > result.homeGoals ? f.awayId
      : rand() < 0.5 ? f.homeId : f.awayId // ponytail: penalty shootout is a coin flip
    return { ...f, homeGoals: result.homeGoals, awayGoals: result.awayGoals, winnerId, events: result.events }
  })

  // existing bans/injuries tick down BEFORE this week's knocks land
  let players: Record<number, Player> = Object.fromEntries(
    Object.values(state.players).map(p => [p.id, {
      ...p,
      injuredForRounds: Math.max(0, p.injuredForRounds - 1),
      suspendedForRounds: Math.max(0, p.suspendedForRounds - 1),
    }]),
  )
  players = applyMatchConsequences(players, roundEvents, rand)

  // only this week's participants drain fitness; everyone else recovers
  const starters = new Set(teams.filter(t => playingIds.has(t.id)).flatMap(t => t.lineup))
  players = applyWeeklyUpdates(players, teams, starters, rand)

  let s: GameState = { ...state, teams, players, fixtures, cupFixtures }
  s = runTransfers(s, rand)
  s = runWeeklyFinances(s, rand)

  // once a cup week fully resolves, the next round is drawn
  if (cupToday.length > 0) {
    const next = drawNextCupRound(s, rand)
    if (next.length > 0) s = { ...s, cupFixtures: [...s.cupFixtures, ...next] }
  }

  return { ...s, round: week + 1, rngState: randInt(rand, 1, 2 ** 31 - 1) }
}

export function newSeason(state: GameState): GameState {
  const rand = mulberry32(state.rngState)

  // prize money by final position
  let teams = state.teams
  let finances = state.finances
  standings(state).forEach((row, i) => {
    const prize = 1_500_000 - i * 75_000
    teams = adjustCash(teams, row.teamId, prize)
    if (row.teamId === state.userTeamId) {
      finances = [
        ...finances,
        { season: state.season, round: totalRounds(state), label: `Prize money (finished ${i + 1})`, amount: prize },
      ].slice(-300)
    }
  })

  // contracts: one season shorter; AI auto-renews, unrenewed user players walk
  const players = { ...state.players }
  for (const team of state.teams) {
    for (const id of team.playerIds) {
      const p = players[id]
      const remaining = p.contractSeasons - 1
      if (remaining > 0) {
        players[id] = { ...p, contractSeasons: remaining }
      } else if (team.id !== state.userTeamId) {
        players[id] = { ...p, contractSeasons: randInt(rand, 1, 3), salary: renewalSalary(p) }
      } else {
        delete players[id]
        teams = teams.map(t =>
          t.id === team.id
            ? { ...t, playerIds: t.playerIds.filter(x => x !== id), lineup: t.lineup.filter(x => x !== id) }
            : t,
        )
      }
    }
  }

  return {
    ...state,
    teams,
    finances,
    players: ageSquads(players, rand),
    season: state.season + 1,
    round: 1,
    fixtures: [...new Set(teams.map(t => t.division))].sort().flatMap(d =>
      generateDivisionFixtures(teams.filter(t => t.division === d).map(t => t.id), rand),
    ),
    transferList: [],
    incomingOffers: [],
    brokeRounds: 0,
    rngState: randInt(rand, 1, 2 ** 31 - 1),
  }
}
