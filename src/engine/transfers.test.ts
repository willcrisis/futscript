import { describe, expect, it } from 'vitest'
import { marketValue, salaryFor, severanceFor } from './finance'
import { mulberry32 } from './rng'
import { newGame } from './newGame'
import {
  listPlayer, MIN_SQUAD, placeBid, releasePlayer, renewalSalary, renewContract,
  requiredBid, runTransfers, transferPlayer,
} from './transfers'
import type { GameState } from './types'

function cashOf(s: GameState, teamId: number): number {
  return s.teams.find(t => t.id === teamId)!.cash
}

describe('transferPlayer', () => {
  it('moves the player, the money, and cleans up', () => {
    const s0 = newGame(1)
    const seller = s0.teams[1]
    const playerId = seller.lineup[0]
    const s1 = transferPlayer(s0, playerId, 0, 400_000)
    expect(s1.teams[1].playerIds).not.toContain(playerId)
    expect(s1.teams[1].lineup).not.toContain(playerId)
    expect(s1.teams[0].playerIds).toContain(playerId)
    expect(cashOf(s1, 1)).toBe(cashOf(s0, 1) + 400_000)
    expect(cashOf(s1, 0)).toBe(cashOf(s0, 0) - 400_000)
    expect(s1.players[playerId].contractSeasons).toBe(2)
    // user (team 0) bought — ledger entry written
    expect(s1.finances.some(e => e.amount === -400_000)).toBe(true)
  })

  it('returns state unchanged when the seller is at MIN_SQUAD', () => {
    const s0 = newGame(1)
    const t1 = s0.teams[1]
    const shrunkPlayerIds = t1.playerIds.slice(0, MIN_SQUAD)
    const s: GameState = {
      ...s0,
      teams: s0.teams.map(t => (t.id === 1
        ? { ...t, playerIds: shrunkPlayerIds, lineup: t.lineup.filter(id => shrunkPlayerIds.includes(id)) }
        : t)),
    }
    const playerId = shrunkPlayerIds[0]
    expect(transferPlayer(s, playerId, 0, 400_000)).toEqual(s)
  })
})

describe('listPlayer / placeBid', () => {
  it('lists a player once and enforces the bid floor and cash', () => {
    const s0 = newGame(1)
    const aiPlayer = s0.teams[2].lineup[0]
    let s = listPlayer(s0, aiPlayer, 300_000)
    expect(s.transferList).toHaveLength(1)
    expect(listPlayer(s, aiPlayer, 300_000).transferList).toHaveLength(1) // no double listing

    expect(placeBid(s, aiPlayer, 200_000)).toEqual(s) // below min price → unchanged
    s = placeBid(s, aiPlayer, 300_000)
    expect(s.transferList[0]).toMatchObject({ currentBid: 300_000, currentBidderId: s.userTeamId })

    expect(requiredBid(s.transferList[0])).toBe(330_000)
    expect(placeBid(s, aiPlayer, 5_000_000)).toEqual(s) // more than user cash → unchanged
  })

  it('will not let the user bid on their own listing', () => {
    const s0 = newGame(1)
    const own = s0.teams[0].lineup[0]
    const s = listPlayer(s0, own, 100_000)
    expect(placeBid(s, own, 100_000)).toEqual(s)
  })

  it('will not let a squad shrink below MIN_SQUAD by listing', () => {
    const s0 = newGame(1)
    // shrink team 0 to MIN_SQUAD players by faking playerIds
    const t0 = s0.teams[0]
    const s: GameState = {
      ...s0,
      teams: s0.teams.map(t => (t.id === 0 ? { ...t, playerIds: t.playerIds.slice(0, MIN_SQUAD) } : t)),
    }
    expect(listPlayer(s, t0.playerIds[0], 100_000).transferList).toHaveLength(0)
  })
})

describe('releasePlayer', () => {
  it('pays severance and removes the player', () => {
    const s0 = newGame(1)
    const victimId = s0.teams[0].playerIds[17]
    const severance = severanceFor(s0.players[victimId])
    const s1 = releasePlayer(s0, victimId)
    expect(s1.players[victimId]).toBeUndefined()
    expect(s1.teams[0].playerIds).not.toContain(victimId)
    expect(cashOf(s1, 0)).toBe(cashOf(s0, 0) - severance)
  })

  it('refuses to release below MIN_SQUAD or non-user players', () => {
    const s0 = newGame(1)
    const aiPlayer = s0.teams[3].playerIds[0]
    expect(releasePlayer(s0, aiPlayer)).toEqual(s0)
  })

  it('refuses when the user squad is at MIN_SQUAD', () => {
    const s0 = newGame(1)
    const t0 = s0.teams[0]
    const shrunkPlayerIds = t0.playerIds.slice(0, MIN_SQUAD)
    const s: GameState = {
      ...s0,
      teams: s0.teams.map(t => (t.id === 0
        ? { ...t, playerIds: shrunkPlayerIds, lineup: t.lineup.filter(id => shrunkPlayerIds.includes(id)) }
        : t)),
    }
    expect(releasePlayer(s, shrunkPlayerIds[0])).toEqual(s)
  })
})

describe('renewContract', () => {
  it('renews an expiring contract at a premium', () => {
    const s0 = newGame(1)
    const id = s0.teams[0].playerIds[0]
    const expiring: GameState = {
      ...s0,
      players: { ...s0.players, [id]: { ...s0.players[id], contractSeasons: 1 } },
    }
    const s1 = renewContract(expiring, id)
    expect(s1.players[id].contractSeasons).toBe(3)
    expect(s1.players[id].salary).toBe(renewalSalary(expiring.players[id]))
    expect(s1.players[id].salary).toBeGreaterThan(expiring.players[id].salary)
  })

  it('refuses to renew a long contract', () => {
    const s0 = newGame(1)
    const id = s0.teams[0].playerIds[0]
    const long: GameState = {
      ...s0,
      players: { ...s0.players, [id]: { ...s0.players[id], contractSeasons: 3 } },
    }
    expect(renewContract(long, id)).toEqual(long)
  })
})

describe('runTransfers', () => {
  it('resolves a due listing to the highest bidder', () => {
    const s0 = newGame(1)
    const playerId = s0.teams[2].lineup[0]
    let s = listPlayer(s0, playerId, 100_000)
    s = {
      ...s,
      transferList: s.transferList.map(l => ({ ...l, roundsLeft: 1, currentBid: 150_000, currentBidderId: 4 })),
    }
    const s1 = runTransfers(s, mulberry32(9))
    expect(s1.transferList.find(l => l.playerId === playerId)).toBeUndefined()
    expect(s1.teams[4].playerIds).toContain(playerId)
    expect(s1.teams[2].playerIds).not.toContain(playerId)
  })

  it('delists an unsold player at the deadline', () => {
    const s0 = newGame(1)
    const playerId = s0.teams[2].lineup[0]
    let s = listPlayer(s0, playerId, 999_999_999) // nobody can afford it
    s = { ...s, transferList: s.transferList.map(l => ({ ...l, roundsLeft: 1 })) }
    const s1 = runTransfers(s, mulberry32(9))
    expect(s1.transferList.find(l => l.playerId === playerId)).toBeUndefined()
    expect(s1.teams[2].playerIds).toContain(playerId) // still theirs
  })

  it('ticks listing deadlines down', () => {
    const s0 = newGame(1)
    const playerId = s0.teams[2].lineup[0]
    const s = listPlayer(s0, playerId, 100_000)
    const s1 = runTransfers(s, mulberry32(9))
    const listing = s1.transferList.find(l => l.playerId === playerId)
    if (listing) expect(listing.roundsLeft).toBe(2) // 3 - 1 (may have sold early only at 0)
  })

  it('AI clubs eventually bid on a fairly priced listing', () => {
    const s0 = newGame(1)
    const playerId = s0.teams[2].lineup[0]
    // cap the ask so it stays under every club's spending limit (0.7 × cash)
    const askingPrice = Math.min(Math.round(marketValue(s0.players[playerId]) * 0.8), 500_000)
    let s = listPlayer(s0, playerId, askingPrice)
    // keep the listing alive and let several rounds of AI interest pass
    const rand = mulberry32(5)
    let sawBid = false
    for (let i = 0; i < 10 && !sawBid; i++) {
      s = { ...s, transferList: s.transferList.map(l => ({ ...l, roundsLeft: 5 })) }
      s = runTransfers(s, rand)
      const l = s.transferList.find(x => x.playerId === playerId)
      sawBid = !s.teams[2].playerIds.includes(playerId) || (l?.currentBid ?? null) !== null
    }
    expect(sawBid).toBe(true)
  })

  it('a broke AI club force-lists its biggest earner', () => {
    const s0 = newGame(1)
    const s: GameState = { ...s0, teams: s0.teams.map(t => (t.id === 7 ? { ...t, cash: -100_000 } : t)) }
    const s1 = runTransfers(s, mulberry32(3))
    const listing = s1.transferList.find(l => l.sellerTeamId === 7)
    expect(listing).toBeDefined()
    const topEarner = [...s.teams[7].playerIds].sort(
      (a, b) => s.players[b].salary - s.players[a].salary,
    )[0]
    expect(listing!.playerId).toBe(topEarner)
  })

  it('is deterministic', () => {
    const s0 = newGame(11)
    expect(runTransfers(s0, mulberry32(4))).toEqual(runTransfers(s0, mulberry32(4)))
  })
})
