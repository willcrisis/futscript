import { runCareerSeasonEnd, runCareerWeek } from './career'
import { cupWinner, drawFirstCupRound, drawNextCupRound } from './cup'
import { CUP_WEEKS, generateDivisionFixtures } from './fixtures'
import { adjustCash, DIVISION_FACTOR, runWeeklyFinances, TICKET_PRICE, userLedger } from './finance'
import { autoPick, isAvailable, managedMatchLineup } from './lineup'
import { resolveCupTie, simulateMatch } from './match'
import { pushNews } from './news'
import { mulberry32, randInt } from './rng'
import { applyPromotionRelegation, ensureThreeDivisions, retirePlayers, rolloverMood, seasonRecord, youthIntake } from './rollover'
import { clampMood, tickConstruction } from './stadium'
import { standings } from './standings'
import { ageSquads, applyWeeklyUpdates } from './training'
import { MIN_SQUAD, renewalSalary, runTransfers } from './transfers'
import type { GameState, MatchEvent, Player, Team } from './types'
import { isActive, isManaged } from './types'

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
  if (state.round > totalRounds(state)) return state
  const rand = mulberry32(state.rngState)
  const week = state.round

  const leagueToday = state.fixtures.filter(f => f.round === week)
  const cupToday = state.cupFixtures.filter(f => f.week === week)
  const playingIds = new Set([...leagueToday, ...cupToday].flatMap(f => [f.homeId, f.awayId]))

  const competitiveIds = new Set(playingIds)

  // an idle user on a cup week can host a friendly (user setting)
  let friendly: { homeId: number; awayId: number } | null = null
  if (state.manager.employed && state.playFriendlies && cupToday.length > 0 && !playingIds.has(state.userTeamId)) {
    const idle = state.teams.filter(t => t.id !== state.userTeamId && !playingIds.has(t.id))
    if (idle.length > 0) {
      friendly = { homeId: state.userTeamId, awayId: idle[Math.floor(rand() * idle.length)].id }
      playingIds.add(friendly.homeId)
      playingIds.add(friendly.awayId)
    }
  }

  // refresh lineups only for clubs that play this week
  const teams = state.teams.map(t =>
    playingIds.has(t.id)
      ? { ...t, lineup: isManaged(state, t.id) ? managedMatchLineup(t, state.players) : autoPick(t, state.players) }
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
    const result = resolveCupTie(byId.get(f.homeId)!, byId.get(f.awayId)!, state.players, rand)
    roundEvents.push(...result.events)
    return { ...f, homeGoals: result.homeGoals, awayGoals: result.awayGoals, winnerId: result.winnerId, events: result.events }
  })

  let friendlyIncome = 0
  if (friendly) {
    const result = simulateMatch(byId.get(friendly.homeId)!, byId.get(friendly.awayId)!, state.players, rand)
    // friendlies: knocks are real, bookings and goals are not
    roundEvents.push(...result.events.filter(e => e.type === 'injury'))
    const user = byId.get(state.userTeamId)!
    friendlyIncome = Math.round(
      (6000 + randInt(rand, -500, 500)) * TICKET_PRICE * (DIVISION_FACTOR[user.division] ?? 1),
    )
  }

  // fans react to results (friendlies don't count; shootout wins still feel like draws)
  const moodDelta = new Map<number, number>()
  const bump = (id: number, d: number) => moodDelta.set(id, (moodDelta.get(id) ?? 0) + d)
  for (const f of [...fixtures.filter(f => f.round === week), ...cupFixtures.filter(f => f.week === week)]) {
    if (f.homeGoals === null || f.awayGoals === null) continue
    if (f.homeGoals > f.awayGoals) { bump(f.homeId, 6); bump(f.awayId, -5) }
    else if (f.homeGoals < f.awayGoals) { bump(f.awayId, 6); bump(f.homeId, -5) }
    else { bump(f.homeId, 1); bump(f.awayId, 1) }
  }
  const teamsWithMood = teams.map(t =>
    moodDelta.has(t.id) ? { ...t, fanMood: clampMood(t.fanMood + moodDelta.get(t.id)!) } : t,
  )

  // existing bans/injuries tick down BEFORE this week's knocks land
  // injuries heal by the week (physio time); bans only burn on matchdays the club plays
  // bans burn on competitive matchdays only — a friendly doesn't serve a suspension
  const playingPlayerIds = new Set(
    teams.filter(t => competitiveIds.has(t.id)).flatMap(t => t.playerIds),
  )
  let players: Record<number, Player> = Object.fromEntries(
    Object.values(state.players).map(p => [p.id, {
      ...p,
      injuredForRounds: Math.max(0, p.injuredForRounds - 1),
      suspendedForRounds: playingPlayerIds.has(p.id) ? Math.max(0, p.suspendedForRounds - 1) : p.suspendedForRounds,
    }]),
  )
  players = applyMatchConsequences(players, roundEvents, rand)

  // only this week's participants drain fitness; everyone else recovers
  const starters = new Set(teams.filter(t => playingIds.has(t.id)).flatMap(t => t.lineup))
  players = applyWeeklyUpdates(players, teams, starters, rand)

  // freshly injured/suspended user players leave the XI at once (no auto-refill —
  // the advance gate makes the manager pick replacements). Formation stays a suggestion.
  const cleanedTeams = teamsWithMood.map(t =>
    isManaged(state, t.id) ? { ...t, lineup: t.lineup.filter(id => isAvailable(players[id])) } : t,
  )

  let s: GameState = { ...state, teams: cleanedTeams, players, fixtures, cupFixtures }
  if (friendlyIncome > 0) {
    s = {
      ...s,
      teams: adjustCash(s.teams, s.userTeamId, friendlyIncome),
      finances: userLedger(s, 'Friendly gate receipts', friendlyIncome),
    }
  }
  s = runTransfers(s, rand)
  s = runWeeklyFinances(s, rand)
  s = tickConstruction(s)
  s = runCareerWeek(s, rand)

  // the week's stories
  const userDivision = byId.get(state.userTeamId)!.division
  if (state.manager.employed) {
    const userLineup = new Set(byId.get(state.userTeamId)!.lineup)
    for (const e of roundEvents) {
      if (e.type === 'injury' && userLineup.has(e.playerId)) {
        const hurt = s.players[e.playerId]
        if (hurt) s = pushNews(s, 'starterInjured', { player: hurt.name, weeks: hurt.injuredForRounds })
      }
    }
  }
  for (const f of fixtures.filter(f => f.round === week && f.homeGoals !== null)) {
    const margin = Math.abs(f.homeGoals! - f.awayGoals!)
    if (margin < 4) continue
    const home = byId.get(f.homeId)!
    if (home.division !== userDivision) continue
    const away = byId.get(f.awayId)!
    const homeWon = f.homeGoals! > f.awayGoals!
    s = pushNews(s, 'heavyWin', {
      winner: homeWon ? home.name : away.name,
      loser: homeWon ? away.name : home.name,
      score: homeWon ? `${f.homeGoals}-${f.awayGoals}` : `${f.awayGoals}-${f.homeGoals}`,
    })
  }

  // once a cup week fully resolves, the next round is drawn
  if (cupToday.length > 0) {
    const next = drawNextCupRound(s, rand)
    if (next.length > 0) {
      s = { ...s, cupFixtures: [...s.cupFixtures, ...next] }
      if (next[0].cupRound >= 4) {
        for (const tie of next) {
          for (const id of [tie.homeId, tie.awayId]) {
            if (id === state.userTeamId) continue
            const club = byId.get(id)!
            if (club.division === userDivision) s = pushNews(s, 'cupRun', { club: club.name, round: tie.cupRound })
          }
        }
      }
    }
  }

  return { ...s, round: week + 1, rngState: randInt(rand, 1, 2 ** 31 - 1) }
}

export function newSeason(state: GameState): GameState {
  const rand = mulberry32(state.rngState)

  // the season's story is written before anything moves
  const history = [...state.history, seasonRecord(state)]

  // season verdicts for the feed (week-stamped at season end)
  const seasonEnd = totalRounds(state)
  let newsAcc: GameState = state
  const userDivisionPre = state.teams.find(t => t.id === state.userTeamId)!.division
  for (const division of [...new Set(state.teams.map(t => t.division))].sort()) {
    const top = standings(state, division)[0]
    if (top) newsAcc = pushNews(newsAcc, 'champions', { club: state.teams.find(t => t.id === top.teamId)!.name, division }, seasonEnd)
  }
  const champId = cupWinner(state)
  if (champId !== null) {
    newsAcc = pushNews(newsAcc, 'cupWinner', { club: state.teams.find(t => t.id === champId)!.name }, seasonEnd)
  }

  // AI boards react to the final table (relegated/flop sackings) before anything else moves
  const careered = runCareerSeasonEnd(newsAcc, rand, seasonEnd)
  let storyAcc = careered

  // the record books remember every goal, even after retirement
  const scorers = new Map(state.allTimeScorers.map(e => [e.playerId, { ...e }]))
  for (const p of Object.values(state.players)) {
    if (p.seasonGoals === 0) continue
    const club = state.teams.find(t => t.playerIds.includes(p.id))
    const entry = scorers.get(p.id)
    if (entry) {
      entry.goals += p.seasonGoals
      entry.team = club?.name ?? entry.team
    } else {
      scorers.set(p.id, { playerId: p.id, player: p.name, team: club?.name ?? '—', goals: p.seasonGoals })
    }
  }
  const allTimeScorers = [...scorers.values()].sort((a, b) => b.goals - a.goals).slice(0, 50)

  let teams = careered.teams
  let finances = state.finances
  const addEntry = (label: string, amount: number) => {
    finances = [...finances, { season: state.season, round: totalRounds(state), label, amount }].slice(-300)
  }

  // league prize money, scaled down the pyramid
  for (const division of [...new Set(state.teams.map(t => t.division))].sort()) {
    standings(state, division).forEach((row, i) => {
      const prize = Math.round((1_500_000 - i * 75_000) * (DIVISION_FACTOR[division] ?? 1))
      teams = adjustCash(teams, row.teamId, prize)
      if (isManaged(careered, row.teamId)) addEntry(`Prize money (finished ${i + 1} in Division ${division})`, prize)
    })
  }

  // cup prizes
  if (state.cupFixtures.length > 0) {
    const final = state.cupFixtures.reduce((a, b) => (b.cupRound > a.cupRound ? b : a))
    if (final.cupRound === CUP_WEEKS.length && final.winnerId !== null) {
      const runnerUp = final.winnerId === final.homeId ? final.awayId : final.homeId
      teams = adjustCash(teams, final.winnerId, 1_000_000)
      teams = adjustCash(teams, runnerUp, 400_000)
      if (isManaged(careered, final.winnerId)) addEntry('Cup winners prize', 1_000_000)
      if (isManaged(careered, runnerUp)) addEntry('Cup runners-up prize', 400_000)
    }
  }

  // up and down the pyramid, judged on the final tables
  teams = applyPromotionRelegation(state, teams)
  for (const t of teams) {
    const before = state.teams.find(x => x.id === t.id)!.division
    if (before === t.division) continue
    if (before !== userDivisionPre && t.division !== userDivisionPre) continue
    storyAcc = pushNews(storyAcc, t.division < before ? 'promoted' : 'relegated', { club: t.name }, seasonEnd)
  }
  // demotion pool: the bottom division has no lower league — its worst clubs sit out one season.
  // Gated on a division 4 existing, so migrated 3-division saves keep their stand-still bottom.
  const nextSeason = state.season + 1
  if (state.teams.some(t => t.division === 4)) {
    // returns: clubs whose wait is up rejoin D4
    teams = teams.map(t => (t.poolReturn === nextSeason ? { ...t, division: 4, poolReturn: undefined } : t))
    // demote: the finished D4 bottom four wait one season
    const demoted = new Set(standings(state, 4).slice(-4).map(r => r.teamId))
    teams = teams.map(t => (demoted.has(t.id) ? { ...t, poolReturn: nextSeason + 1 } : t))
  }

  teams = rolloverMood(state, teams)

  // retirements
  let players: Record<number, Player> = { ...state.players }
  ;({ players, teams } = retirePlayers(players, teams, rand))

  // contracts: one season shorter; AI auto-renews; unrenewed user players walk,
  // but never below MIN_SQUAD — the cheapest expiring contracts force-renew first
  const userTeamNow = teams.find(t => t.id === state.userTeamId)!
  const expiring = careered.manager.employed
    ? userTeamNow.playerIds.filter(id => players[id].contractSeasons - 1 <= 0)
    : []
  const mustKeep = Math.max(0, MIN_SQUAD - (userTeamNow.playerIds.length - expiring.length))
  const forceRenewed = new Set(
    [...expiring].sort((a, b) => players[a].salary - players[b].salary).slice(0, mustKeep),
  )
  for (const team of teams) {
    for (const id of [...team.playerIds]) {
      const p = players[id]
      const remaining = p.contractSeasons - 1
      if (remaining > 0) {
        players[id] = { ...p, contractSeasons: remaining }
      } else if (!isManaged(careered, team.id) || forceRenewed.has(id)) {
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

  // fresh legs and (for migrated worlds) the missing divisions — the id floor is the
  // pre-rollover max, so retirements/departures pruning the working record never free up
  // a low id that collides with a still-referenced (pre-rollover) player of the same id
  const idFloor = Math.max(0, ...Object.keys(state.players).map(Number))
  ;({ players, teams } = youthIntake(players, teams, rand, idFloor))
  ;({ players, teams } = ensureThreeDivisions(players, teams, rand, idFloor))

  players = ageSquads(players, rand)

  const activeForNext = (t: Team) => isActive(t, nextSeason)
  const fixtures = [...new Set(teams.filter(activeForNext).map(t => t.division))].sort().flatMap(d =>
    generateDivisionFixtures(teams.filter(t => t.division === d && activeForNext(t)).map(t => t.id), rand),
  )

  return {
    ...state,
    teams,
    players,
    finances,
    history,
    allTimeScorers,
    season: state.season + 1,
    round: 1,
    fixtures,
    cupFixtures: drawFirstCupRound(teams, rand),
    transferList: [],
    incomingOffers: [],
    brokeRounds: 0,
    rngState: randInt(rand, 1, 2 ** 31 - 1),
    manager: storyAcc.manager,
    unemployedPool: storyAcc.unemployedPool,
    news: storyAcc.news,
  }
}
