import { describe, expect, it } from 'vitest'
import { newGame } from './newGame'
import {
  applyPromotionRelegation, ensureThreeDivisions, retirePlayers, seasonRecord, youthIntake,
} from './rollover'
import { mulberry32 } from './rng'
import { advanceRound, totalRounds } from './season'
import { standings } from './standings'
import type { GameState, Player } from './types'

function playSeason(seed: number): GameState {
  let s = newGame(seed)
  for (let i = 0; i < totalRounds(s); i++) s = advanceRound(s)
  return s
}

describe('applyPromotionRelegation', () => {
  it('swaps three clubs at each boundary and keeps divisions at 16', () => {
    const s = playSeason(13)
    const down1 = standings(s, 1).slice(-3).map(r => r.teamId)
    const up2 = standings(s, 2).slice(0, 3).map(r => r.teamId)
    const down2 = standings(s, 2).slice(-3).map(r => r.teamId)
    const up3 = standings(s, 3).slice(0, 3).map(r => r.teamId)
    const teams = applyPromotionRelegation(s, s.teams)
    for (const id of down1) expect(teams.find(t => t.id === id)!.division).toBe(2)
    for (const id of up2) expect(teams.find(t => t.id === id)!.division).toBe(1)
    for (const id of down2) expect(teams.find(t => t.id === id)!.division).toBe(3)
    for (const id of up3) expect(teams.find(t => t.id === id)!.division).toBe(2)
    for (const d of [1, 2, 3]) expect(teams.filter(t => t.division === d)).toHaveLength(16)
  })

  it('no-ops when a division is missing (migrated world)', () => {
    const s = newGame(1)
    const div1Only = { ...s, teams: s.teams.filter(t => t.division === 1).map(t => ({ ...t })) }
    expect(applyPromotionRelegation(div1Only as GameState, div1Only.teams)).toEqual(div1Only.teams)
  })
})

describe('retirePlayers', () => {
  it('retires by age band and strips rosters', () => {
    const s = newGame(2)
    // force known ages on one team
    const team = s.teams[4]
    const [a, b, c] = team.playerIds
    const players: Record<number, Player> = {
      ...s.players,
      [a]: { ...s.players[a], age: 36 }, // always retires
      [b]: { ...s.players[b], age: 30 }, // never
      [c]: { ...s.players[c], age: 34 }, // 35% chance — either is fine
    }
    const out = retirePlayers(players, s.teams, mulberry32(3))
    expect(out.players[a]).toBeUndefined()
    expect(out.players[b]).toBeDefined()
    const newTeam = out.teams.find(t => t.id === team.id)!
    expect(newTeam.playerIds).not.toContain(a)
    expect(newTeam.lineup).not.toContain(a)
  })
})

describe('youthIntake', () => {
  it('replenishes small squads', () => {
    const s = newGame(3)
    const trim = (id: number, keep: number) =>
      s.teams.map(t => (t.id === id ? { ...t, playerIds: t.playerIds.slice(0, keep), lineup: [] } : t))
    let teams = trim(0, 14) // < 16 → +2
    teams = teams.map(t => (t.id === 1 ? { ...t, playerIds: t.playerIds.slice(0, 18), lineup: [] } : t)) // < 20 → +1
    const out = youthIntake(s.players, teams, mulberry32(4))
    const t0 = out.teams.find(t => t.id === 0)!
    const t1 = out.teams.find(t => t.id === 1)!
    const t2 = out.teams.find(t => t.id === 2)! // 18 players... also < 20 → +1
    expect(t0.playerIds).toHaveLength(16)
    expect(t1.playerIds).toHaveLength(19)
    expect(t2.playerIds).toHaveLength(19)
    const rookieId = t0.playerIds[15]
    const rookie = out.players[rookieId]
    expect(rookie.age).toBeGreaterThanOrEqual(16)
    expect(rookie.age).toBeLessThanOrEqual(18)
    expect(rookie.level).toBeGreaterThanOrEqual(22)
    expect(rookie.level).toBeLessThanOrEqual(45)
    expect(rookie.contractSeasons).toBe(3)
    expect(rookie.seasonGoals).toBe(0)
  })

  it('tops the user squad back up to MIN_SQUAD after heavy retirement', () => {
    const s = newGame(3)
    const trimmed = s.teams.map(t => (t.id === s.userTeamId ? { ...t, playerIds: t.playerIds.slice(0, 11), lineup: [] } : t))
    const out = youthIntake(s.players, trimmed, mulberry32(4), s.userTeamId)
    const user = out.teams.find(t => t.id === s.userTeamId)!
    expect(user.playerIds.length).toBeGreaterThanOrEqual(14) // MIN_SQUAD
  })

  it('AI clubs keep the normal intake thresholds', () => {
    const s = newGame(3)
    const trimmed = s.teams.map(t => (t.id === 5 ? { ...t, playerIds: t.playerIds.slice(0, 11), lineup: [] } : t))
    const out = youthIntake(s.players, trimmed, mulberry32(4), s.userTeamId)
    expect(out.teams.find(t => t.id === 5)!.playerIds).toHaveLength(13) // 11 + 2, no user floor
  })
})

describe('ensureThreeDivisions', () => {
  it('expands a one-division world to three', () => {
    const s = newGame(5)
    const div1Teams = s.teams.filter(t => t.division === 1)
    const div1PlayerIds = new Set(div1Teams.flatMap(t => t.playerIds))
    const players = Object.fromEntries(Object.entries(s.players).filter(([id]) => div1PlayerIds.has(Number(id))))
    const out = ensureThreeDivisions(players, div1Teams, mulberry32(6))
    expect(out.teams).toHaveLength(48)
    for (const d of [1, 2, 3]) expect(out.teams.filter(t => t.division === d)).toHaveLength(16)
    expect(new Set(out.teams.map(t => t.name)).size).toBe(48)
    expect(new Set(out.teams.map(t => t.id)).size).toBe(48)
    const newClub = out.teams.find(t => t.division === 3 && !div1Teams.includes(t))!
    expect(newClub.playerIds).toHaveLength(18)
    expect(newClub.lineup).toHaveLength(11)
    for (const id of newClub.playerIds) {
      expect(out.players[id].level).toBeGreaterThanOrEqual(30)
      expect(out.players[id].level).toBeLessThanOrEqual(60)
    }
  })

  it('no-ops on a full world', () => {
    const s = newGame(5)
    const out = ensureThreeDivisions(s.players, s.teams, mulberry32(6))
    expect(out.teams).toBe(s.teams)
    expect(out.players).toBe(s.players)
  })
})

describe('seasonRecord', () => {
  it('captures champions, cup winner, top scorer, and the user finish', () => {
    const s = playSeason(7)
    const record = seasonRecord(s)
    expect(record.season).toBe(1)
    expect(record.champions).toHaveLength(3)
    expect(record.champions[0]).toBe(s.teams.find(t => t.id === standings(s, 1)[0].teamId)!.name)
    expect(record.cupWinner).not.toBe('—')
    expect(record.topScorer.goals).toBeGreaterThan(0)
    expect(record.userDivision).toBe(3)
    expect(record.userPosition).toBeGreaterThanOrEqual(1)
    expect(record.userPosition).toBeLessThanOrEqual(16)
  })
})
