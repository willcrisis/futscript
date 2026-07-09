import { describe, expect, it } from 'vitest'
import { mulberry32 } from './rng'
import { newGame } from './newGame'
import { advanceRound, applyMatchConsequences, newSeason, totalRounds } from './season'
import { standings } from './standings'
import { adjustCash } from './finance'
import { cupWinner } from './cup'
import { MIN_SQUAD } from './transfers'
import type { GameState, MatchEvent, Player } from './types'
import { isActive } from './types'

function playSeason(seed: number): GameState {
  let s = newGame(seed)
  // fund the club so a bankruptcy can't halt the season early (same precaution as the
  // advanceRound no-op test below) — these tests are about season-end processing, not survival
  s = { ...s, teams: adjustCash(s.teams, s.userTeamId, 50_000_000) }
  for (let i = 0; i < totalRounds(s); i++) s = advanceRound(s)
  return s
}

function makePlayer(id: number, over: Partial<Player> = {}): Player {
  return {
    id, name: `P${id}`, age: 25, position: 'MF', level: 50,
    form: 0, fitness: 100, injuredForRounds: 0, suspendedForRounds: 0, yellowCards: 0,
    salary: 5000, contractSeasons: 2, seasonGoals: 0,
    ...over,
  }
}

describe('applyMatchConsequences', () => {
  const yellow = (playerId: number): MatchEvent => ({ minute: 10, type: 'yellow', teamId: 0, playerId })
  const red = (playerId: number): MatchEvent => ({ minute: 10, type: 'red', teamId: 0, playerId })
  const injury = (playerId: number): MatchEvent => ({ minute: 10, type: 'injury', teamId: 0, playerId })

  it('accumulates yellows and bans on the third', () => {
    const rand = mulberry32(1)
    const one = applyMatchConsequences({ 1: makePlayer(1) }, [yellow(1)], rand)
    expect(one[1]).toMatchObject({ yellowCards: 1, suspendedForRounds: 0 })
    const third = applyMatchConsequences({ 1: makePlayer(1, { yellowCards: 2 }) }, [yellow(1)], rand)
    expect(third[1]).toMatchObject({ yellowCards: 0, suspendedForRounds: 1 })
  })

  it('bans a red card 1-2 rounds', () => {
    const rand = mulberry32(2)
    const next = applyMatchConsequences({ 1: makePlayer(1) }, [red(1)], rand)
    expect(next[1].suspendedForRounds).toBeGreaterThanOrEqual(1)
    expect(next[1].suspendedForRounds).toBeLessThanOrEqual(2)
  })

  it('injures 1-6 rounds and costs levels only when serious', () => {
    const rand = mulberry32(3)
    for (let i = 0; i < 50; i++) {
      const next = applyMatchConsequences({ 1: makePlayer(1) }, [injury(1)], rand)
      const rounds = next[1].injuredForRounds
      expect(rounds).toBeGreaterThanOrEqual(1)
      expect(rounds).toBeLessThanOrEqual(6)
      if (rounds >= 4) {
        expect(next[1].level).toBeGreaterThanOrEqual(48)
        expect(next[1].level).toBeLessThanOrEqual(49)
      } else {
        expect(next[1].level).toBe(50)
      }
    }
  })
})

describe('applyMatchConsequences — goals', () => {
  it('counts season goals and ignores events for unknown players', () => {
    const rand = mulberry32(1)
    const goal: MatchEvent = { minute: 10, type: 'goal', teamId: 0, playerId: 1 }
    const ghost: MatchEvent = { minute: 11, type: 'goal', teamId: 0, playerId: 999 }
    const next = applyMatchConsequences({ 1: makePlayer(1) }, [goal, goal, ghost], rand)
    expect(next[1].seasonGoals).toBe(2)
  })
})

describe('advanceRound — cup weeks', () => {
  it('plays cup ties on cup weeks, decides ties, and draws the next round', () => {
    let s = newGame(5)
    for (let week = 1; week <= 9; week++) s = advanceRound(s) // through cup rounds 1 (wk 4) and 2 (wk 9)
    const round1 = s.cupFixtures.filter(f => f.cupRound === 1)
    expect(round1.every(f => f.homeGoals !== null && f.winnerId !== null)).toBe(true)
    for (const f of round1) {
      if (f.homeGoals! > f.awayGoals!) expect(f.winnerId).toBe(f.homeId)
      else if (f.awayGoals! > f.homeGoals!) expect(f.winnerId).toBe(f.awayId)
      else expect([f.homeId, f.awayId]).toContain(f.winnerId) // penalties
    }
    const round2 = s.cupFixtures.filter(f => f.cupRound === 2)
    expect(round2).toHaveLength(16) // 32 round-1 winners, paired up (0 byes: 64 clubs filled the bracket)
    // no league fixtures were scheduled on the cup week
    expect(s.fixtures.filter(f => f.round === 4)).toHaveLength(0)
  })

  it('completes the whole cup by season end', () => {
    let s = newGame(6)
    for (let i = 0; i < totalRounds(s); i++) s = advanceRound(s)
    expect(s.cupFixtures.filter(f => f.cupRound === 6)).toHaveLength(1)
    expect(cupWinner(s)).not.toBeNull()
    expect(s.fixtures.every(f => f.homeGoals !== null)).toBe(true) // league unharmed
  })

  it('accumulates season goals matching stored events', () => {
    let s = newGame(7)
    for (let week = 1; week <= 6; week++) s = advanceRound(s)
    const eventGoals = [...s.fixtures, ...s.cupFixtures]
      .flatMap(f => f.events ?? [])
      .filter(e => e.type === 'goal').length
    const playerGoals = Object.values(s.players).reduce((sum, p) => sum + p.seasonGoals, 0)
    expect(playerGoals).toBe(eventGoals)
    expect(eventGoals).toBeGreaterThan(0)
  })

  it('rests non-participants on cup weeks', () => {
    let s = newGame(8)
    for (let week = 1; week <= 3; week++) s = advanceRound(s)
    s = advanceRound(s) // week 4: cup round 1 — 64 clubs fill the bracket exactly, so everyone plays
    const round1 = s.cupFixtures.filter(f => f.cupRound === 1)
    const loserId = round1[0].winnerId === round1[0].homeId ? round1[0].awayId : round1[0].homeId
    const loser = s.teams.find(t => t.id === loserId)!
    for (let week = 5; week <= 8; week++) s = advanceRound(s)
    // week 9 is a cup week: the round-1 loser is out of the cup and rests
    const tiredBefore = loser.lineup.map(id => s.players[id].fitness)
    const s2 = advanceRound(s)
    const after = loser.lineup.map(id => s2.players[id].fitness)
    after.forEach((f, i) => expect(f).toBeGreaterThanOrEqual(tiredBefore[i])) // recovery only
  })
})

describe('advanceRound', () => {
  it('plays the current round, stores events, and advances', () => {
    const s0 = newGame(123)
    const s1 = advanceRound(s0)
    expect(s1.round).toBe(2)
    const played = s1.fixtures.filter(f => f.round === 1)
    expect(played.every(f => f.homeGoals !== null && Array.isArray(f.events))).toBe(true)
    // score matches stored events
    for (const f of played) {
      expect(f.homeGoals).toBe(f.events!.filter(e => e.type === 'goal' && e.teamId === f.homeId).length)
    }
    expect(s0.round).toBe(1) // input untouched
  })

  it('is deterministic', () => {
    const s0 = newGame(123)
    expect(advanceRound(s0)).toEqual(advanceRound(s0))
  })

  it('never fields injured or suspended players', () => {
    let s = newGame(7)
    const user = s.teams.find(t => t.id === s.userTeamId)!
    const ai = s.teams.find(t => t.id !== s.userTeamId)!
    // pre-suspend a user starter and an AI starter
    const userStarter = user.lineup[3]
    const aiStarter = ai.lineup[3]
    s = {
      ...s,
      players: {
        ...s.players,
        [userStarter]: { ...s.players[userStarter], suspendedForRounds: 2 },
        [aiStarter]: { ...s.players[aiStarter], injuredForRounds: 2 },
      },
    }
    const s1 = advanceRound(s)
    expect(s1.teams.find(t => t.id === user.id)!.lineup).not.toContain(userStarter)
    expect(s1.teams.find(t => t.id === ai.id)!.lineup).not.toContain(aiStarter)
    // counters ticked down
    expect(s1.players[userStarter].suspendedForRounds).toBe(1)
    expect(s1.players[aiStarter].injuredForRounds).toBe(1)
  })

  it('keeps the user lineup otherwise intact but re-picks AI teams', () => {
    const s0 = newGame(9)
    const user = s0.teams.find(t => t.id === s0.userTeamId)!
    const userLineup = [...user.lineup]
    const s1 = advanceRound(s0)
    expect(s1.teams.find(t => t.id === user.id)!.lineup).toEqual(userLineup) // nobody unavailable yet
  })

  it('no-ops once the season is over', () => {
    let s = newGame(7)
    // fund the club so a bankruptcy can't halt the season — this test is about the season-over no-op
    s = { ...s, teams: adjustCash(s.teams, s.userTeamId, 50_000_000) }
    for (let i = 0; i < totalRounds(s); i++) s = advanceRound(s)
    expect(s.round).toBe(totalRounds(s) + 1)
    expect(s.fixtures.every(f => f.homeGoals !== null)).toBe(true)
    expect(advanceRound(s)).toEqual(s)
  })

  it('produces discipline and squad churn over a full season', () => {
    let s = newGame(31)
    for (let i = 0; i < totalRounds(s); i++) s = advanceRound(s)
    const events = s.fixtures.flatMap(f => f.events ?? [])
    // Since Task 6, the market/finance pipeline can end a season early (board patience runs
    // out), so scale the goal floor to fixtures actually played rather than assuming all 240 ran.
    const played = s.fixtures.filter(f => f.homeGoals !== null).length
    // ~2.4 goals/match after the Phase-5 retune, floored for variance
    expect(events.filter(e => e.type === 'goal').length).toBeGreaterThan(played * 2.0)
    expect(events.filter(e => e.type === 'yellow').length).toBeGreaterThan(100)
    expect(events.filter(e => e.type === 'injury').length).toBeGreaterThan(5)
    // training moved at least someone
    const s0 = newGame(31)
    const levelsChanged = Object.values(s.players).some(p => p.level !== s0.players[p.id].level)
    expect(levelsChanged).toBe(true)
  })
})

describe('backlog semantics', () => {
  it('goal density lands near 2.4 per match', () => {
    let s = newGame(41)
    s = { ...s, teams: adjustCash(s.teams, s.userTeamId, 50_000_000) } // bankruptcy must not truncate the sample
    for (let i = 0; i < totalRounds(s); i++) s = advanceRound(s)
    const played = s.fixtures.filter(f => f.homeGoals !== null)
    const goals = played.reduce((sum, f) => sum + f.homeGoals! + f.awayGoals!, 0)
    const density = goals / played.length
    expect(density).toBeGreaterThan(2.0)
    expect(density).toBeLessThan(3.0)
  })

  it('suspensions only count weeks the club actually plays', () => {
    let s = newGame(8)
    for (let week = 1; week <= 3; week++) s = advanceRound(s)
    s = advanceRound(s) // week 4: cup round 1 — 64 clubs fill the bracket exactly, so everyone plays
    const round1 = s.cupFixtures.filter(f => f.cupRound === 1)
    const loserId = round1[0].winnerId === round1[0].homeId ? round1[0].awayId : round1[0].homeId
    const winnerId = round1[0].winnerId!
    const restingPlayer = s.teams.find(t => t.id === loserId)!.lineup[3]
    const playingPlayer = s.teams.find(t => t.id === winnerId)!.lineup[3]
    for (let week = 5; week <= 8; week++) s = advanceRound(s)
    s = {
      ...s,
      players: {
        ...s.players,
        [restingPlayer]: { ...s.players[restingPlayer], suspendedForRounds: 2, injuredForRounds: 0 },
        [playingPlayer]: { ...s.players[playingPlayer], suspendedForRounds: 2, injuredForRounds: 0 },
      },
    }
    const s2 = advanceRound(s) // week 9: cup round 2 — the round-1 loser is eliminated and rests
    expect(s2.players[restingPlayer].suspendedForRounds).toBe(2) // no match, no tick
    expect(s2.players[playingPlayer].suspendedForRounds).toBe(1) // club played (he sat it out)
  })

  it('injuries heal by the week regardless of the calendar', () => {
    let s = newGame(8)
    const restingClub = s.teams.find(t => t.division === 1)!
    const hurt = restingClub.lineup[4]
    for (let week = 1; week <= 3; week++) s = advanceRound(s)
    s = { ...s, players: { ...s.players, [hurt]: { ...s.players[hurt], injuredForRounds: 3 } } }
    const s2 = advanceRound(s) // cup week, club rests — physio still works
    expect(s2.players[hurt].injuredForRounds).toBe(2)
  })

  it('a friendly does not burn a suspension', () => {
    let s = { ...newGame(8), playFriendlies: true }
    // eliminate the user from cup round 1 so week 4 is a friendly week for them
    s = {
      ...s,
      cupFixtures: s.cupFixtures.map(f =>
        f.homeId === s.userTeamId || f.awayId === s.userTeamId
          ? { ...f, homeGoals: 0, awayGoals: 3, winnerId: f.homeId === s.userTeamId ? f.awayId : f.homeId, week: 0 }
          : f,
      ),
    }
    for (let week = 1; week <= 3; week++) s = advanceRound(s)
    const banned = s.teams.find(t => t.id === s.userTeamId)!.playerIds[5]
    s = { ...s, players: { ...s.players, [banned]: { ...s.players[banned], suspendedForRounds: 2, injuredForRounds: 0 } } }
    const s2 = advanceRound(s) // week 4: user plays only a friendly
    expect(s2.finances.some(e => e.label === 'Friendly gate receipts')).toBe(true) // friendly actually happened
    expect(s2.players[banned].suspendedForRounds).toBe(2) // ban untouched
  })
})

describe('newSeason', () => {
  it('newSeason carries career state through the rollover', () => {
    // seed 2: the user manager survives the full season (unrelated to this test's
    // assertions — seed 17 used to work here, but the verbatim-lineup + auto-drop
    // change in advanceRound perturbs which players are fielded, which perturbs match
    // results and confidence, and seed 17's manager now gets sacked mid-season)
    let state = newGame(2)
    while (state.round <= totalRounds(state)) state = advanceRound(state)
    const next = newSeason(state)
    expect(next.manager).toBeDefined()
    expect(next.unemployedPool).toBeDefined()
    expect(next.teams.every(t => typeof t.manager === 'string')).toBe(true)
    expect(next.history[next.history.length - 1].club).toBe(
      state.teams.find(t => t.id === state.userTeamId)!.name,
    )
  })

  it('resets the calendar, bumps the season, and ages squads', () => {
    let s = newGame(7)
    // fund the club so a bankruptcy can't halt the season early — this test is about rollover, not survival
    s = { ...s, teams: adjustCash(s.teams, s.userTeamId, 50_000_000) }
    for (let i = 0; i < totalRounds(s); i++) s = advanceRound(s)
    const s2 = newSeason(s)
    expect(s2.season).toBe(2)
    expect(s2.round).toBe(1)
    expect(s2.fixtures).toHaveLength(960)
    expect(s2.fixtures.every(f => f.homeGoals === null)).toBe(true)
    for (const p of Object.values(s2.players)) {
      if (!s.players[p.id]) continue // youth arrivals have no previous-season self
      expect(p.age).toBe(s.players[p.id].age + 1)
      expect(p.fitness).toBe(100)
      expect(p.yellowCards).toBe(0)
    }
  })
})

describe('all-time scorers', () => {
  it('accumulates season goals across rollovers and survives retirement', () => {
    const s = playSeason(7)
    const seasonTotal = Object.values(s.players).reduce((sum, p) => sum + p.seasonGoals, 0)
    const s2 = newSeason(s)
    const listTotal = s2.allTimeScorers.reduce((sum, e) => sum + e.goals, 0)
    const distinctScorers = Object.values(s.players).filter(p => p.seasonGoals > 0).length
    if (distinctScorers <= 50) expect(listTotal).toBe(seasonTotal)
    else expect(listTotal).toBeLessThanOrEqual(seasonTotal)
    expect(s2.allTimeScorers.length).toBeLessThanOrEqual(50)
    expect([...s2.allTimeScorers].sort((a, b) => b.goals - a.goals)).toEqual(s2.allTimeScorers)
    // a second season accumulates onto existing entries
    let s3 = s2
    for (let i = 0; i < totalRounds(s3); i++) s3 = advanceRound(s3)
    const repeatId = s3.allTimeScorers?.[0]?.playerId
    const s4 = newSeason(s3)
    if (repeatId !== undefined && s4.players[repeatId]) {
      const before = s2.allTimeScorers.find(e => e.playerId === repeatId)?.goals ?? 0
      const after = s4.allTimeScorers.find(e => e.playerId === repeatId)?.goals ?? 0
      expect(after).toBeGreaterThanOrEqual(before)
    }
    expect(s4.allTimeScorers.length).toBeLessThanOrEqual(50)
  })
})

describe('advanceRound — market and money', () => {
  it('still advances when the manager is unemployed (nothing sacks yet — Task 6 wires that)', () => {
    const base = newGame(1)
    const s = { ...base, manager: { ...base.manager, employed: false } }
    expect(advanceRound(s).round).toBe(s.round + 1)
  })

  it('moves money every round', () => {
    const s1 = advanceRound(newGame(1))
    expect(s1.finances.length).toBeGreaterThan(0)
    expect(s1.teams.some(t => t.cash !== 1_000_000)).toBe(true)
  })

  it('keeps the economy alive over a full season', () => {
    let s = newGame(31)
    for (let i = 0; i < totalRounds(s); i++) s = advanceRound(s)
    // the market moved players between clubs at least once
    expect(s.teams.some(t => t.playerIds.length !== 18)).toBe(true)
    // a mid-table club does not spiral into oblivion in one season
    const userCash = s.teams.find(t => t.id === s.userTeamId)!.cash
    expect(userCash).toBeGreaterThan(-2_000_000)
  })
})

describe('newSeason — money and contracts', () => {
  it('clears the market at season end', () => {
    const s = playSeason(7)
    const s2 = newSeason(s)
    expect(s2.transferList).toEqual([])
    expect(s2.incomingOffers).toEqual([])
    expect(s2.brokeRounds).toBe(0)
  })
})

describe('newSeason — the long game', () => {
  it('still rolls over when the manager is unemployed (nothing sacks yet — Task 6 wires that)', () => {
    const s = playSeason(1)
    const unemployed = { ...s, manager: { ...s.manager, employed: false } }
    expect(newSeason(unemployed).season).toBe(s.season + 1)
  })

  it('pays division-scaled prizes and applies promotion and relegation', () => {
    const s = playSeason(7)
    const div1Champion = standings(s, 1)[0].teamId
    const div3Top = standings(s, 3).slice(0, 3).map(r => r.teamId)
    const div1Bottom = standings(s, 1).slice(-3).map(r => r.teamId)
    const s2 = newSeason(s)
    const delta = (id: number) => s2.teams.find(t => t.id === id)!.cash - s.teams.find(t => t.id === id)!.cash
    expect(delta(div1Champion)).toBeGreaterThanOrEqual(1_500_000) // full-factor first prize (+ maybe cup money)
    for (const id of div3Top) {
      expect(s2.teams.find(t => t.id === id)!.division).toBe(2)
      // division-3 factor scales the prize table by 0.6
      expect(delta(id)).toBeGreaterThanOrEqual(Math.round((1_500_000 - 2 * 75_000) * 0.6))
    }
    for (const id of div1Bottom) expect(s2.teams.find(t => t.id === id)!.division).toBe(2)
    for (const d of [1, 2, 3, 4]) expect(s2.teams.filter(t => t.division === d && isActive(t, s2.season))).toHaveLength(16)
  })

  it('writes the season into history and restarts the calendar', () => {
    const s = playSeason(7)
    const s2 = newSeason(s)
    expect(s2.history).toHaveLength(1)
    expect(s2.history[0].season).toBe(1)
    expect(s2.history[0].champions).toHaveLength(4)
    expect(s2.season).toBe(2)
    expect(s2.round).toBe(1)
    expect(s2.fixtures).toHaveLength(960)
    expect(s2.fixtures.every(f => f.homeGoals === null)).toBe(true)
    expect(s2.cupFixtures).toHaveLength(32) // 64 clubs fill the bracket exactly: 0 byes, 32 round-1 ties
    expect(s2.cupFixtures.every(f => f.cupRound === 1 && f.winnerId === null)).toBe(true)
  })

  it('retires the old guard', () => {
    const s = playSeason(7)
    const s2 = newSeason(s)
    expect(Object.values(s2.players).every(p => p.age <= 36)).toBe(true) // 36+ retired before the +1 birthday
  })

  it('force-renews the cheapest expiring contracts so the user squad never drops below MIN_SQUAD', () => {
    const s0 = newGame(1)
    const user = s0.teams.find(t => t.id === s0.userTeamId)!
    const kept = user.playerIds.slice(0, 15)
    const expiring = kept.slice(0, 3)
    const players = { ...s0.players }
    for (const id of kept) players[id] = { ...players[id], age: 25, contractSeasons: expiring.includes(id) ? 1 : 2 }
    // make salaries unambiguous: expiring[2] is the priciest and must be the one who walks
    players[expiring[0]] = { ...players[expiring[0]], salary: 1000 }
    players[expiring[1]] = { ...players[expiring[1]], salary: 2000 }
    players[expiring[2]] = { ...players[expiring[2]], salary: 9000 }
    const s: GameState = {
      ...s0,
      players,
      teams: s0.teams.map(t => (t.id === user.id ? { ...t, playerIds: kept, lineup: [] } : t)),
    }
    const s2 = newSeason(s)
    const userAfter = s2.teams.find(t => t.id === user.id)!
    expect(s2.players[expiring[2]]).toBeUndefined() // priciest expiring walked
    expect(userAfter.playerIds).not.toContain(expiring[2])
    expect(s2.players[expiring[0]]).toBeDefined() // cheapest two force-renewed
    expect(s2.players[expiring[1]]).toBeDefined()
    expect(s2.players[expiring[0]].contractSeasons).toBeGreaterThanOrEqual(1)
    expect(userAfter.playerIds.length).toBeGreaterThanOrEqual(MIN_SQUAD)
  })
})

describe('spectator gates', () => {
  it('an unemployed manager spectates: world advances, old club runs itself', () => {
    const base = newGame(23)
    const state = { ...base, manager: { ...base.manager, employed: false } }
    let s = state
    for (let i = 0; i < 8; i++) s = advanceRound(s)
    expect(s.round).toBe(9) // the world kept moving
    expect(s.finances).toEqual([]) // no ledger for a club you don't run
    expect(s.brokeRounds).toBe(0)
    expect(s.incomingOffers).toEqual([])
    const badTypes = ['userSigned', 'userSold', 'starterInjured', 'boardWarning', 'offerReceived']
    expect(s.news.filter(n => badTypes.includes(n.type))).toEqual([])
  })

  it('at rollover an unmanaged club auto-renews its expiring contracts', () => {
    let state = newGame(29)
    state = { ...state, manager: { ...state.manager, employed: false } }
    const user = state.teams.find(t => t.id === state.userTeamId)!
    const players = { ...state.players }
    for (const id of user.playerIds) players[id] = { ...players[id], contractSeasons: 1 }
    state = { ...state, players, round: totalRounds(state) + 1 }
    const next = newSeason(state)
    const after = next.teams.find(t => t.id === state.userTeamId)!
    // retirees may still leave, but nobody walks over an expired deal: survivors are all renewed
    expect(after.playerIds.length).toBeGreaterThanOrEqual(14)
    for (const id of after.playerIds) expect(next.players[id].contractSeasons).toBeGreaterThanOrEqual(1)
  })

  // found during self-review: newSeason's own prize-money and cup-prize addEntry calls wrote to
  // state.finances keyed only on teamId === userTeamId, without checking employment — a club a
  // spectating user doesn't run would still get a phantom ledger line for winning the league or cup.
  it('season-end prize money and cup prizes never touch the ledger for an unmanaged club', () => {
    let state = newGame(29)
    state = { ...state, manager: { ...state.manager, employed: false }, round: totalRounds(state) + 1 }
    const next = newSeason(state)
    expect(next.finances).toEqual([])
  })
})

describe('friendlies', () => {
  function toFreeWeek(seed: number, playFriendlies: boolean) {
    let s: GameState = { ...newGame(seed), playFriendlies }
    // eliminate the user from the cup so week 4 is a free week: resolve their round-1 tie against them
    s = {
      ...s,
      cupFixtures: s.cupFixtures.map(f =>
        f.homeId === s.userTeamId || f.awayId === s.userTeamId
          ? { ...f, homeGoals: 0, awayGoals: 3, winnerId: f.homeId === s.userTeamId ? f.awayId : f.homeId, week: 0 }
          : f,
      ),
    }
    for (let week = 1; week < 4; week++) s = advanceRound(s)
    return s // next advance simulates week 4 (cup week, user idle)
  }

  it('plays a friendly for income when enabled', () => {
    const s = toFreeWeek(11, true)
    const s2 = advanceRound(s)
    expect(s2.finances.some(e => e.label === 'Friendly gate receipts' && e.amount > 0)).toBe(true)
  })

  it('does not play one when disabled', () => {
    const s = toFreeWeek(11, false)
    const s2 = advanceRound(s)
    expect(s2.finances.some(e => e.label === 'Friendly gate receipts')).toBe(false)
  })

  it('friendly goals never reach season tallies', () => {
    const s = toFreeWeek(11, true)
    const before = Object.values(s.players).reduce((sum, p) => sum + p.seasonGoals, 0)
    const s2 = advanceRound(s)
    const storedGoalEvents = [...s2.fixtures, ...s2.cupFixtures]
      .flatMap(f => f.events ?? []).filter(e => e.type === 'goal').length
    const after = Object.values(s2.players).reduce((sum, p) => sum + p.seasonGoals, 0)
    expect(after - before).toBeLessThanOrEqual(storedGoalEvents) // friendly events are not stored anywhere
    // and specifically: tallies match stored events exactly (invariant from Task 4 holds)
    expect(after).toBe(storedGoalEvents)
  })
})

describe('fan mood', () => {
  it('moves with results and stays clamped', () => {
    const s0 = newGame(9)
    const s1 = advanceRound(s0)
    const week1 = s1.fixtures.filter(f => f.round === 1)
    for (const f of week1) {
      const home = s1.teams.find(t => t.id === f.homeId)!
      const away = s1.teams.find(t => t.id === f.awayId)!
      if (f.homeGoals! > f.awayGoals!) {
        expect(home.fanMood).toBe(56)
        expect(away.fanMood).toBe(45)
      } else if (f.homeGoals! < f.awayGoals!) {
        expect(home.fanMood).toBe(45)
        expect(away.fanMood).toBe(56)
      } else {
        expect(home.fanMood).toBe(51)
        expect(away.fanMood).toBe(51)
      }
    }
  })

  it('never escapes 0..100', () => {
    let s = newGame(9)
    for (let i = 0; i < totalRounds(s); i++) s = advanceRound(s)
    for (const t of s.teams) {
      expect(t.fanMood).toBeGreaterThanOrEqual(0)
      expect(t.fanMood).toBeLessThanOrEqual(100)
    }
  })
})

describe('user lineup hygiene', () => {
  it('never contains an injured or suspended player after a round', () => {
    let s = newGame(1)
    for (let i = 0; i < 12; i++) {
      s = advanceRound(s)
      const user = s.teams.find(t => t.id === s.userTeamId)!
      for (const id of user.lineup) {
        expect(s.players[id].injuredForRounds).toBe(0)
        expect(s.players[id].suspendedForRounds).toBe(0)
      }
    }
  })
})

describe('demotion pool rollover', () => {
  it('keeps D4 at 16 active while rotating the bottom four through the pool', () => {
    let s = newGame(5)
    for (let season = 0; season < 3; season++) {
      while (s.round <= 30 + 6) s = advanceRound(s)
      const finishedD4Bottom = standings(s, 4).slice(-4).map(r => r.teamId)
      s = newSeason(s)
      // exactly four clubs are dormant, and they are last season's bottom four
      const dormant = s.teams.filter(t => t.poolReturn != null && t.poolReturn > s.season).map(t => t.id)
      expect(dormant).toHaveLength(4)
      expect(new Set(dormant)).toEqual(new Set(finishedD4Bottom))
      // D4 still fields 16 active clubs
      expect(s.teams.filter(t => t.division === 4 && (t.poolReturn == null || t.poolReturn <= s.season))).toHaveLength(16)
    }
  })
})
