import { describe, expect, it } from 'vitest'
import { expectedRank, hireManager, runCareerSeasonEnd, runCareerWeek, sackAiManager, teamStrength } from './career'
import { newGame } from './newGame'

describe('expectation', () => {
  it('teamStrength sums the best 11 levels only', () => {
    const state = newGame(1)
    const team = state.teams[0]
    const levels = team.playerIds.map(id => state.players[id].level).sort((a, b) => b - a)
    expect(teamStrength(team, state.players)).toBe(levels.slice(0, 11).reduce((s, l) => s + l, 0))
  })

  it('expectedRank orders a division by squad strength, 1 = strongest', () => {
    const state = newGame(2)
    const division = state.teams.find(t => t.id === state.userTeamId)!.division
    const clubs = state.teams.filter(t => t.division === division)
    const ranks = clubs.map(t => expectedRank(state, t.id))
    expect([...ranks].sort((a, b) => a - b)).toEqual(clubs.map((_, i) => i + 1)) // a permutation of 1..16
    const strongest = clubs.reduce((a, b) => (teamStrength(b, state.players) > teamStrength(a, state.players) ? b : a))
    expect(expectedRank(state, strongest.id)).toBe(1)
  })
})

const always = () => 0 // rand that always fires probabilistic gates and picks index 0
const never = () => 0.999999

describe('AI manager carousel', () => {
  it('sacking recycles the name through the pool into the next hire', () => {
    const state = newGame(11)
    const club = state.teams.find(t => t.id !== state.userTeamId)!
    const oldName = club.manager
    const sacked = sackAiManager(state, club.id, never) // never → fresh name, pool keeps oldName
    expect(sacked.unemployedPool).toContain(oldName)
    expect(sacked.teams.find(t => t.id === club.id)!.manager).not.toBe(oldName)
    expect(sacked.teams.find(t => t.id === club.id)!.managerHiredSeason).toBe(state.season)

    const other = state.teams.find(t => t.id !== state.userTeamId && t.id !== club.id)!
    const rehired = hireManager(sacked, other.id, always) // always → pool pick, index 0
    expect(rehired.teams.find(t => t.id === other.id)!.manager).toBe(oldName)
    expect(rehired.unemployedPool).not.toContain(oldName)
  })

  it('emits division-filtered news for sackings and hirings', () => {
    const state = newGame(11)
    const userDivision = state.teams.find(t => t.id === state.userTeamId)!.division
    const rival = state.teams.find(t => t.id !== state.userTeamId && t.division === userDivision)!
    const far = state.teams.find(t => t.division !== userDivision)!
    const a = sackAiManager(state, rival.id, never)
    expect(a.news.map(n => n.type)).toEqual(['managerSacked', 'managerHired'])
    const b = sackAiManager(state, far.id, never)
    expect(b.news).toHaveLength(0)
  })

  it('weekly sweep only fires on big underperformers past week 8, never twice a season', () => {
    let state = { ...newGame(11), round: 10 }
    // manufacture a flop: strongest squad in the user division, dead last on points
    // (simplest deterministic route: give one rival's players level 99 and zero points — but
    // with no fixtures played everyone is 0pts and position falls back to insertion order,
    // so instead assert the two hard gates directly:)
    const before = state.teams.map(t => t.manager)
    state = runCareerWeek({ ...state, round: 3 }, always) // before week 8 → untouched
    expect(state.teams.map(t => t.manager)).toEqual(before)

    const hiredNow = {
      ...newGame(11),
      round: 10,
      teams: newGame(11).teams.map(t => ({ ...t, managerHiredSeason: 1 })),
    }
    const after = runCareerWeek(hiredNow, always) // everyone hired this season → all immune
    expect(after.teams.map(t => t.manager)).toEqual(hiredNow.teams.map(t => t.manager))
  })

  it('a genuine flop gets sacked when the dice say so', () => {
    // strongest squad, bottom of the table: fabricate played fixtures where the rival lost every game
    const base = newGame(11)
    const userDivision = base.teams.find(t => t.id === base.userTeamId)!.division
    const rival = base.teams.find(t => t.id !== base.userTeamId && t.division === userDivision)!
    const players = { ...base.players }
    for (const id of rival.playerIds) players[id] = { ...players[id], level: 99 }
    const opponents = base.teams.filter(t => t.division === userDivision && t.id !== rival.id).slice(0, 10)
    const fixtures = opponents.map((opp, i) => ({
      round: i + 1, homeId: rival.id, awayId: opp.id, homeGoals: 0, awayGoals: 3,
    }))
    const state = { ...base, players, fixtures, round: 11 }
    const sacked = runCareerWeek(state, always)
    expect(sacked.teams.find(t => t.id === rival.id)!.manager).not.toBe(rival.manager)
    const spared = runCareerWeek(state, never)
    expect(spared.teams.find(t => t.id === rival.id)!.manager).toBe(rival.manager)
  })
})

describe('season-end carousel', () => {
  // helper: a state where `rival` finished bottom of the user's division.
  // newGame() always starts the user in Division 3, which has no relegation below it, so the
  // relegated-sacking branch (division < 3) would never be reachable for a rival sharing the
  // user's division — reassign the user up to Division 2 so the scenario is actually testable.
  function bottomedOut(seed: number) {
    const base = newGame(seed)
    const userTeamId = base.teams.find(t => t.division === 2)!.id
    const withUser = { ...base, userTeamId }
    const userDivision = 2
    const rival = withUser.teams.find(t => t.id !== withUser.userTeamId && t.division === userDivision)!
    const opponents = withUser.teams.filter(t => t.division === userDivision && t.id !== rival.id)
    const fixtures = opponents.map((opp, i) => ({
      round: i + 1, homeId: rival.id, awayId: opp.id, homeGoals: 0, awayGoals: 3,
    }))
    return { state: { ...withUser, fixtures, round: 31 }, rival }
  }

  it('relegated clubs sack with high probability, week-stamped at season end', () => {
    const { state, rival } = bottomedOut(13)
    const out = runCareerSeasonEnd(state, always, 36)
    expect(out.teams.find(t => t.id === rival.id)!.manager).not.toBe(rival.manager)
    const item = out.news.find(n => n.type === 'managerSacked')!
    expect(item.week).toBe(36)
    expect(runCareerSeasonEnd(state, never, 36).teams.find(t => t.id === rival.id)!.manager).toBe(rival.manager)
  })

  it('a manager hired this season survives even relegation', () => {
    const { state, rival } = bottomedOut(13)
    const grace = {
      ...state,
      teams: state.teams.map(t => (t.id === rival.id ? { ...t, managerHiredSeason: state.season } : t)),
    }
    const out = runCareerSeasonEnd(grace, always, 36)
    expect(out.teams.find(t => t.id === rival.id)!.manager).toBe(rival.manager)
  })
})
