import { describe, expect, it } from 'vitest'
import { mulberry32 } from './rng'
import { newGame } from './newGame'
import {
  adjustCash, borrow, DIVISION_FACTOR, formatMoney, marketValue, LOAN_CAP, repayLoan, runWeeklyFinances, salaryFor,
  severanceFor, STARTING_CASH, wageBill, SPONSOR_BASE, MAINTENANCE_PER_SEAT,
} from './finance'
import type { GameState, Player } from './types'
import { CUP_WEEKS } from './fixtures'
import { advanceRound } from './season'

export function makePlayer(id: number, over: Partial<Player> = {}): Player {
  return {
    id, name: `P${id}`, age: 25, position: 'MF', level: 50,
    form: 0, fitness: 100, injuredForRounds: 0, suspendedForRounds: 0, yellowCards: 0,
    salary: salaryFor(50), contractSeasons: 2, seasonGoals: 0,
    ...over,
  }
}

function userCash(s: GameState): number {
  return s.teams.find(t => t.id === s.userTeamId)!.cash
}

describe('money formulas', () => {
  it('salary scales with the square of level', () => {
    expect(salaryFor(50)).toBe(5000)
    expect(salaryFor(70)).toBe(9800)
    expect(salaryFor(70)).toBeGreaterThan(salaryFor(50) * 1.5)
  })

  it('market value rewards youth and punishes age', () => {
    const prime = makePlayer(1, { age: 26, level: 50 })
    const young = makePlayer(2, { age: 20, level: 50 })
    const old = makePlayer(3, { age: 32, level: 50 })
    expect(marketValue(prime)).toBe(300_000)
    expect(marketValue(young)).toBe(450_000)
    expect(marketValue(old)).toBe(150_000)
  })

  it('severance grows with contract length', () => {
    const p = makePlayer(1, { salary: 5000, contractSeasons: 2 })
    expect(severanceFor(p)).toBe(5000 * 12 * 2)
    expect(severanceFor({ ...p, contractSeasons: 0 })).toBe(5000 * 12) // floor of one season
  })

  it('formats money', () => {
    expect(formatMoney(1_234_567)).toBe('$1,234,567')
    expect(formatMoney(-500)).toBe('-$500')
  })
})

describe('runWeeklyFinances', () => {
  it('charges every club its wage bill and pays home clubs gate receipts', () => {
    const s0 = newGame(1)
    const s1 = runWeeklyFinances(s0, mulberry32(2))
    const homeIds = new Set(s0.fixtures.filter(f => f.round === 1).map(f => f.homeId))
    for (const t of s1.teams) {
      const team0 = s0.teams.find(x => x.id === t.id)!
      const maintenance = Math.round(team0.capacity * MAINTENANCE_PER_SEAT)
      const sponsors = Math.round((SPONSOR_BASE[team0.division] ?? SPONSOR_BASE[3]) * (0.5 + team0.fanMood / 100))
      const before = STARTING_CASH - wageBill(t.id, s0) - maintenance + sponsors
      if (homeIds.has(t.id)) expect(t.cash).toBeGreaterThan(before) // gate beat zero
      else if (t.id !== s0.userTeamId) expect(t.cash).toBe(before)
    }
  })

  it('writes user ledger entries', () => {
    const s1 = runWeeklyFinances(newGame(1), mulberry32(2))
    const labels = s1.finances.map(e => e.label)
    expect(labels).toContain('Wages')
    expect(s1.finances.every(e => e.season === 1 && e.round === 1)).toBe(true)
  })

  it('pays deposit interest on positive balances and charges overdraft on negative', () => {
    const s0 = newGame(1)
    const broke: GameState = { ...s0, teams: adjustCash(s0.teams, s0.userTeamId, -5_000_000) }
    const s1 = runWeeklyFinances(broke, mulberry32(2))
    expect(s1.finances.some(e => e.label === 'Overdraft charge' && e.amount < 0)).toBe(true)
    const rich = runWeeklyFinances(s0, mulberry32(2))
    expect(rich.finances.some(e => e.label === 'Deposit interest' && e.amount > 0)).toBe(true)
  })

  it('charges loan interest without touching the principal', () => {
    const s0 = borrow(newGame(1), 1_000_000)
    const s1 = runWeeklyFinances(s0, mulberry32(2))
    expect(s1.loanBalance).toBe(1_000_000)
    expect(s1.finances.some(e => e.label === 'Loan interest' && e.amount === -20_000)).toBe(true)
  })

  it('tracks board patience and fires you after 8 broke rounds', () => {
    const s0 = newGame(1)
    let s: GameState = { ...s0, teams: adjustCash(s0.teams, s0.userTeamId, -50_000_000) }
    for (let i = 0; i < 7; i++) {
      s = runWeeklyFinances(s, mulberry32(i))
      expect(s.gameOver).toBe(false)
    }
    s = runWeeklyFinances(s, mulberry32(99))
    expect(s.brokeRounds).toBe(8)
    expect(s.gameOver).toBe(true)
  })

  it('resets board patience the week you are back in the black', () => {
    const s0 = newGame(1)
    const s1 = runWeeklyFinances({ ...s0, brokeRounds: 5 }, mulberry32(2))
    expect(s1.brokeRounds).toBe(0) // starting cash keeps the user positive
  })
})

describe('loans', () => {
  it('borrowing adds cash and is capped', () => {
    const s0 = newGame(1)
    const s1 = borrow(s0, 500_000)
    expect(s1.loanBalance).toBe(500_000)
    expect(userCash(s1)).toBe(userCash(s0) + 500_000)
    expect(borrow(s1, LOAN_CAP)).toEqual(s1) // would exceed cap → unchanged
  })

  it('repaying reduces the loan and never overpays', () => {
    const s1 = borrow(newGame(1), 200_000)
    const s2 = repayLoan(s1, 500_000)
    expect(s2.loanBalance).toBe(0)
    expect(userCash(s2)).toBe(userCash(s1) - 200_000)
  })
})

describe('division-aware gates', () => {
  it('pays a gate for a home cup tie', () => {
    let s = newGame(9)
    for (let week = 1; week < CUP_WEEKS[0]; week++) s = advanceRound(s)
    // week 4: only cup ties are scheduled
    const cupHomes = new Set(s.cupFixtures.filter(f => f.week === CUP_WEEKS[0]).map(f => f.homeId))
    expect(cupHomes.size).toBeGreaterThan(0)
    const before = new Map(s.teams.map(t => [t.id, t.cash]))
    const s2 = advanceRound(s)
    for (const id of cupHomes) {
      const t = s2.teams.find(x => x.id === id)!
      // gate income exceeds the wage bill hit for at least the cup hosts as a group
      expect(t.cash).toBeGreaterThan(before.get(id)! - wageBill(id, s))
    }
  })
})

describe('stadium finances', () => {
  it('every club pays maintenance and earns mood-scaled sponsors weekly', () => {
    const s0 = newGame(1)
    const s1 = runWeeklyFinances(s0, mulberry32(2))
    const awayDiv1 = s1.teams.find(t =>
      t.division === 1 &&
      !s0.fixtures.some(f => f.round === 1 && f.homeId === t.id) &&
      t.id !== s0.userTeamId,
    )!
    const before = s0.teams.find(t => t.id === awayDiv1.id)!
    // away week: wages out, maintenance out, sponsors in — nothing else
    const expected = before.cash - wageBill(awayDiv1.id, s0) - Math.round(before.capacity * MAINTENANCE_PER_SEAT)
      + Math.round(SPONSOR_BASE[1] * (0.5 + before.fanMood / 100))
    expect(awayDiv1.cash).toBe(expected)
  })

  it('attendance is capped by capacity and scales with price and mood', () => {
    const s0 = newGame(1)
    // pump the user's mood and drop the price: the division-3 ground sells out
    const cheap = {
      ...s0,
      teams: s0.teams.map(t => (t.id === s0.userTeamId ? { ...t, ticketPrice: 5, fanMood: 100 } : t)),
    }
    // make the user play at home in week 1 by swapping their fixture if needed
    const userHome = cheap.fixtures.some(f => f.round === 1 && f.homeId === cheap.userTeamId)
    const withHome = userHome ? cheap : {
      ...cheap,
      fixtures: cheap.fixtures.map(f =>
        f.round === 1 && f.awayId === cheap.userTeamId ? { ...f, homeId: f.awayId, awayId: f.homeId } : f,
      ),
    }
    const s1 = runWeeklyFinances(withHome, mulberry32(3))
    const gate = s1.finances.find(e => e.label.startsWith('Gate receipts'))!
    const fans = Number(gate.label.match(/\((\d+) fans\)/)![1])
    expect(fans).toBe(9_000) // capacity-capped sellout
    expect(gate.amount).toBe(9_000 * 5)

    // same week at price 60 and mood 0: a sliver of the ground
    const dear = {
      ...withHome,
      teams: withHome.teams.map(t => (t.id === s0.userTeamId ? { ...t, ticketPrice: 60, fanMood: 0 } : t)),
    }
    const s2 = runWeeklyFinances(dear, mulberry32(3))
    const gate2 = s2.finances.find(e => e.label.startsWith('Gate receipts'))!
    const fans2 = Number(gate2.label.match(/\((\d+) fans\)/)![1])
    expect(fans2).toBeLessThan(2_200) // (15/60)^1.5 = 0.125, mood factor floor 0.8, plus jitter
    expect(fans2).toBeGreaterThanOrEqual(0)
  })

  it('user ledger carries the new lines', () => {
    const s1 = runWeeklyFinances(newGame(1), mulberry32(2))
    const labels = s1.finances.map(e => e.label)
    expect(labels).toContain('Wages')
    expect(labels).toContain('Stadium maintenance')
    expect(labels).toContain('Sponsors')
  })

  it('lower divisions draw proportionally smaller crowds', () => {
    expect(DIVISION_FACTOR).toEqual({ 1: 1, 2: 0.8, 3: 0.6 })
  })
})
