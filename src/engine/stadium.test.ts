import { describe, expect, it } from 'vitest'
import { adjustCash } from './finance'
import { newGame } from './newGame'
import { advanceRound } from './season'
import { EXPANSION, expandStadium, setTicketPrice } from './stadium'
import type { GameState } from './types'

function userTeam(s: GameState) {
  return s.teams.find(t => t.id === s.userTeamId)!
}

describe('setTicketPrice', () => {
  it('sets and clamps the user price only', () => {
    const s = newGame(1)
    expect(userTeam(setTicketPrice(s, 25)).ticketPrice).toBe(25)
    expect(userTeam(setTicketPrice(s, 1)).ticketPrice).toBe(5)
    expect(userTeam(setTicketPrice(s, 900)).ticketPrice).toBe(60)
    expect(setTicketPrice(s, 25).teams.find(t => t.id !== s.userTeamId)!.ticketPrice).toBe(15)
  })
})

describe('expandStadium', () => {
  it('starts construction, charges the cost, and refuses double-builds', () => {
    const s0 = newGame(1)
    const s1 = expandStadium(s0)
    expect(s1.construction).toEqual({ addedCapacity: EXPANSION.seats, weeksLeft: EXPANSION.weeks })
    expect(userTeam(s1).cash).toBe(userTeam(s0).cash - EXPANSION.cost)
    expect(s1.finances.some(e => e.amount === -EXPANSION.cost)).toBe(true)
    expect(expandStadium(s1)).toBe(s1) // one at a time
  })

  it('refuses when broke or sacked', () => {
    const s0 = newGame(1)
    const broke = { ...s0, teams: adjustCash(s0.teams, s0.userTeamId, -900_000) }
    expect(expandStadium(broke)).toBe(broke)
    const over = { ...s0, gameOver: true }
    expect(expandStadium(over)).toBe(over)
  })
})

describe('construction over the weeks', () => {
  it('finishes after EXPANSION.weeks advances and lands the seats', () => {
    let s = expandStadium(newGame(1))
    const before = userTeam(s).capacity
    for (let i = 0; i < EXPANSION.weeks - 1; i++) {
      s = advanceRound(s)
      expect(s.construction).not.toBeNull()
      expect(userTeam(s).capacity).toBe(before)
    }
    s = advanceRound(s)
    expect(s.construction).toBeNull()
    expect(userTeam(s).capacity).toBe(before + EXPANSION.seats)
  })
})
