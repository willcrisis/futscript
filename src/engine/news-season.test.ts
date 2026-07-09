import { describe, expect, it } from 'vitest'
import { newGame } from './newGame'
import { advanceRound, newSeason, totalRounds } from './season'
import { standings } from './standings'
import type { GameState } from './types'

function playSeason(seed: number): GameState {
  let s = newGame(seed)
  for (let i = 0; i < totalRounds(s); i++) s = advanceRound(s)
  return s
}

describe('matchday news', () => {
  it('a full season produces division heavy wins and user injuries when they occur', () => {
    const s = playSeason(7)
    // structural checks: every heavyWin names two clubs from the user's division and a valid margin
    const userDivision = s.teams.find(t => t.id === s.userTeamId)!.division
    const clubsInDivision = new Set(s.teams.filter(t => t.division === userDivision).map(t => t.name))
    expect(s.news.some(n => n.type === 'heavyWin')).toBe(true) // guard against the loops below going vacuous
    for (const n of s.news.filter(n => n.type === 'heavyWin')) {
      expect(clubsInDivision.has(String(n.params.winner))).toBe(true)
      const [a, b] = String(n.params.score).split('-').map(Number)
      expect(Math.abs(a - b)).toBeGreaterThanOrEqual(4)
    }
    for (const n of s.news.filter(n => n.type === 'starterInjured')) {
      expect(Number(n.params.weeks)).toBeGreaterThanOrEqual(1)
    }
    // cup runs: any QF+ entrant news names a division club and round >= 4
    for (const n of s.news.filter(n => n.type === 'cupRun')) {
      expect(clubsInDivision.has(String(n.params.club))).toBe(true)
      expect(Number(n.params.round)).toBeGreaterThanOrEqual(4)
    }
  })
})

describe('season news', () => {
  it('rollover writes champions, cup winner, and division-touching moves', () => {
    const s = playSeason(7)
    const expectedChampion = s.teams.find(t => t.id === standings(s, 1)[0].teamId)!.name
    const s2 = newSeason(s)
    const champions = s2.news.filter(n => n.type === 'champions')
    expect(champions).toHaveLength(4)
    expect(champions.find(n => n.params.division === 1)!.params.club).toBe(expectedChampion)
    expect(s2.news.filter(n => n.type === 'cupWinner')).toHaveLength(1)
    const moves = s2.news.filter(n => n.type === 'promoted' || n.type === 'relegated')
    expect(moves.length).toBeGreaterThan(0)
    expect(moves.length).toBeLessThanOrEqual(6) // only moves touching the user's division
    // week stamp is season end
    expect(champions[0].week).toBe(totalRounds(s))
    // news survives rollover
    expect(s2.news.some(n => n.season === 1 && n.type === 'heavyWin')).toBe(true)
  })
})
