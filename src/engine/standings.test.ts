import { describe, expect, it } from 'vitest'
import { standings } from './standings'
import type { Fixture, GameState, Team } from './types'

function makeState(fixtures: Fixture[]): GameState {
  const teams: Team[] = [0, 1, 2].map(id => ({
    id, name: `T${id}`, playerIds: [], formation: '4-4-2', lineup: [],
    tactic: 'normal', trainingStyle: 'normal', cash: 1_000_000, division: 1,
    capacity: 9_000, ticketPrice: 15, fanMood: 50,
    manager: `AI Manager ${id}`, managerHiredSeason: 0,
  }))
  return {
    version: 9, seed: 1, rngState: 1, season: 1, round: 1,
    userTeamId: 0, players: {}, teams, fixtures,
    cupFixtures: [], history: [],
    transferList: [], incomingOffers: [], outgoingOffers: [], loanBalance: 0,
    brokeRounds: 0, finances: [],
    construction: null, allTimeScorers: [], news: [],
    manager: { name: 'User Manager', reputation: 30, confidence: 60, employed: true, hiredSeason: 0, jobOffers: [] },
    unemployedPool: [],
  }
}

describe('standings', () => {
  it('awards 3/1/0 points and sorts by points, GD, GF', () => {
    const state = makeState([
      { round: 1, homeId: 0, awayId: 1, homeGoals: 3, awayGoals: 0 }, // 0 beats 1
      { round: 1, homeId: 2, awayId: 0, homeGoals: 1, awayGoals: 1 }, // 2 draws 0
      { round: 2, homeId: 1, awayId: 2, homeGoals: 0, awayGoals: 2 }, // 2 beats 1
      { round: 2, homeId: 0, awayId: 2, homeGoals: null, awayGoals: null }, // unplayed — ignored
    ])
    const rows = standings(state)
    expect(rows.map(r => r.teamId)).toEqual([0, 2, 1]) // 0: 4pts GD+3; 2: 4pts GD+2; 1: 0pts
    expect(rows[0]).toEqual({
      teamId: 0, played: 2, won: 1, drawn: 1, lost: 0,
      goalsFor: 4, goalsAgainst: 1, points: 4,
    })
    expect(rows[2].points).toBe(0)
  })

  it('lists every team even before any match', () => {
    const rows = standings(makeState([]))
    expect(rows).toHaveLength(3)
    expect(rows.every(r => r.played === 0 && r.points === 0)).toBe(true)
  })

  it('scopes the table to one division', () => {
    const base = makeState([
      { round: 1, homeId: 0, awayId: 1, homeGoals: 2, awayGoals: 0 },
    ])
    const state = {
      ...base,
      teams: base.teams.map(t => (t.id === 2 ? { ...t, division: 2 } : t)),
    }
    const div1 = standings(state, 1)
    expect(div1.map(r => r.teamId).sort()).toEqual([0, 1])
    const div2 = standings(state, 2)
    expect(div2.map(r => r.teamId)).toEqual([2])
    expect(standings(state)).toEqual(div1) // default division 1
  })
})

describe('standings excludes pooled clubs', () => {
  it('omits a club whose poolReturn is in the future', () => {
    const s0 = makeState([])
    const teams = s0.teams.map((t, i) => ({ ...t, division: 4, id: i })) // all in D4
    const s = { ...s0, teams, season: 1 }
    const pooled = s.teams[0].id
    const stateWithPooled = {
      ...s,
      teams: s.teams.map(t => (t.id === pooled ? { ...t, poolReturn: s.season + 1 } : t)),
    }
    const table = standings(stateWithPooled, 4)
    expect(table.some(r => r.teamId === pooled)).toBe(false)
    expect(table).toHaveLength(2) // 3 D4 clubs minus the pooled one
  })
})
