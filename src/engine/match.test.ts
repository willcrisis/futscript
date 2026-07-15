import { describe, expect, it } from 'vitest'
import { effectiveLevel, resolveCupTie, simulateMatch } from './match'
import { mulberry32 } from './rng'
import type { Player, Position, Team, TrainingStyle } from './types'

function makeTeam(
  id: number,
  level: number,
  players: Record<number, Player>,
  trainingStyle: TrainingStyle = 'normal',
): Team {
  const positions: Position[] = [
    'GK', 'GK',
    'DF', 'DF', 'DF', 'DF', 'DF', 'DF',
    'MF', 'MF', 'MF', 'MF', 'MF', 'MF',
    'FW', 'FW', 'FW', 'FW',
  ]
  const playerIds = positions.map((position, i) => {
    const pid = id * 100 + i
    players[pid] = {
      id: pid, name: `P${pid}`, age: 25, position, level, peakLevel: level, injuryCount: 0,
      form: 0, fitness: 100, injuredForRounds: 0, suspendedForRounds: 0, yellowCards: 0,
      salary: 5000, contractSeasons: 2, seasonGoals: 0,
    }
    return pid
  })
  // 4-4-2 starting XI: GK 0, DF 2-5, MF 8-11, FW 14-15
  const lineup = [0, 2, 3, 4, 5, 8, 9, 10, 11, 14, 15].map(i => id * 100 + i)
  return {
    id, name: `T${id}`, playerIds, formation: '4-4-2', lineup, tactic: 'normal', trainingStyle, cash: 1_000_000, division: 1,
    capacity: 9_000, ticketPrice: 15, fanMood: 50,
    manager: 'AI Manager', managerHiredSeason: 0,
  }
}

describe('effectiveLevel', () => {
  it('scales with form and fitness', () => {
    const base: Player = {
      id: 1, name: 'P', age: 25, position: 'MF', level: 50, peakLevel: 50, injuryCount: 0,
      form: 0, fitness: 100, injuredForRounds: 0, suspendedForRounds: 0, yellowCards: 0,
      salary: 5000, contractSeasons: 2, seasonGoals: 0,
    }
    expect(effectiveLevel(base)).toBe(50)
    expect(effectiveLevel({ ...base, form: 3 })).toBeCloseTo(50 * 1.09)
    expect(effectiveLevel({ ...base, form: -3 })).toBeCloseTo(50 * 0.91)
    expect(effectiveLevel({ ...base, fitness: 0 })).toBeCloseTo(50 * 0.7)
  })
})

describe('simulateMatch', () => {
  it('is deterministic for the same rand', () => {
    const players: Record<number, Player> = {}
    const a = makeTeam(1, 60, players)
    const b = makeTeam(2, 55, players)
    expect(simulateMatch(a, b, players, mulberry32(9))).toEqual(simulateMatch(a, b, players, mulberry32(9)))
  })

  it('score always equals the goal events', () => {
    const players: Record<number, Player> = {}
    const a = makeTeam(1, 60, players)
    const b = makeTeam(2, 55, players)
    const rand = mulberry32(3)
    for (let i = 0; i < 100; i++) {
      const r = simulateMatch(a, b, players, rand)
      expect(r.homeGoals).toBe(r.events.filter(e => e.type === 'goal' && e.teamId === a.id).length)
      expect(r.awayGoals).toBe(r.events.filter(e => e.type === 'goal' && e.teamId === b.id).length)
      expect(r.homeGoals + r.awayGoals).toBeLessThanOrEqual(15)
      for (const e of r.events) {
        expect(e.minute).toBeGreaterThanOrEqual(1)
        expect(e.minute).toBeLessThanOrEqual(90)
      }
    }
  })

  it('lets the clearly stronger team win far more often', () => {
    const players: Record<number, Player> = {}
    const strong = makeTeam(1, 90, players)
    const weak = makeTeam(2, 40, players)
    const rand = mulberry32(42)
    let strongWins = 0
    let weakWins = 0
    for (let i = 0; i < 300; i++) {
      const r = simulateMatch(strong, weak, players, rand)
      if (r.homeGoals > r.awayGoals) strongWins++
      if (r.awayGoals > r.homeGoals) weakWins++
    }
    expect(strongWins).toBeGreaterThan(weakWins * 2)
  })

  it('gives the home side an edge between equal teams', () => {
    const players: Record<number, Player> = {}
    const a = makeTeam(1, 60, players)
    const b = makeTeam(2, 60, players)
    const rand = mulberry32(7)
    let homeWins = 0
    let awayWins = 0
    for (let i = 0; i < 1000; i++) {
      const r = simulateMatch(a, b, players, rand)
      if (r.homeGoals > r.awayGoals) homeWins++
      if (r.awayGoals > r.homeGoals) awayWins++
    }
    expect(homeWins).toBeGreaterThan(awayWins)
  })

  it('a sent-off or injured-without-sub player appears in no later events', () => {
    const players: Record<number, Player> = {}
    const a = makeTeam(1, 60, players)
    const b = makeTeam(2, 60, players)
    const rand = mulberry32(11)
    for (let i = 0; i < 300; i++) {
      const r = simulateMatch(a, b, players, rand)
      for (const red of r.events.filter(e => e.type === 'red')) {
        const later = r.events.filter(e => e.minute > red.minute)
        expect(later.some(e => e.playerId === red.playerId || e.playerInId === red.playerId)).toBe(false)
      }
    }
  })

  it('intensive training causes more injuries than light', () => {
    const count = (style: TrainingStyle, seed: number) => {
      const players: Record<number, Player> = {}
      const a = makeTeam(1, 60, players, style)
      const b = makeTeam(2, 60, players, style)
      const rand = mulberry32(seed)
      let injuries = 0
      for (let i = 0; i < 400; i++) {
        injuries += simulateMatch(a, b, players, rand).events.filter(e => e.type === 'injury').length
      }
      return injuries
    }
    const intensive = count('intensive', 5)
    const light = count('light', 5)
    expect(intensive).toBeGreaterThan(light)
    expect(light).toBeGreaterThan(0) // injuries do happen even on light training
  })

  it('does not crash when a red card empties the roster before the injury check', () => {
    const players: Record<number, Player> = {}
    const solo = (id: number): Team => {
      const pid = id * 100
      players[pid] = {
        id: pid, name: `P${pid}`, age: 25, position: 'FW', level: 60, peakLevel: 60, injuryCount: 0,
        form: 0, fitness: 100, injuredForRounds: 0, suspendedForRounds: 0, yellowCards: 0,
        salary: 5000, contractSeasons: 2, seasonGoals: 0,
      }
      return {
        id, name: `T${id}`, playerIds: [pid], formation: '4-4-2', lineup: [pid], tactic: 'normal', trainingStyle: 'normal', cash: 1_000_000, division: 1,
        capacity: 9_000, ticketPrice: 15, fanMood: 50,
        manager: 'AI Manager', managerHiredSeason: 0,
      }
    }
    const a = solo(1)
    const b = solo(2)
    // Rand-call order per side-minute: chance → [shooter + conversion] → yellow →
    // [culprit] (or straight-red → [culprit]) → injury → [victim].
    const script = [
      0.99, 0.0, 0.0, 0.99, // min 1 home: skip chance, first yellow for P100, skip injury
      0.99, 0.99, 0.99, 0.99, // min 1 away: skip chance, yellow, straight red, injury
      0.99, 0.0, 0.0, 0.0, // min 2 home: second yellow → red empties roster, then injury check fires
    ]
    let i = 0
    const rand = () => (i < script.length ? script[i++] : 0.5)
    const r = simulateMatch(a, b, players, rand)
    expect(r.events.some(e => e.type === 'red' && e.playerId === 100 && e.minute === 2)).toBe(true)
  })

  it('attacking tactic produces more total goals than defensive', () => {
    const total = (tactic: 'attacking' | 'defensive') => {
      const players: Record<number, Player> = {}
      const a = { ...makeTeam(1, 60, players), tactic }
      const b = { ...makeTeam(2, 60, players), tactic }
      const rand = mulberry32(13)
      let goals = 0
      for (let i = 0; i < 400; i++) {
        const r = simulateMatch(a, b, players, rand)
        goals += r.homeGoals + r.awayGoals
      }
      return goals
    }
    expect(total('attacking')).toBeGreaterThan(total('defensive'))
  })
})

function evenTeams() {
  const players: Record<number, Player> = {}
  const home = makeTeam(1, 50, players)
  const away = makeTeam(2, 50, players)
  return { home, away, players }
}

describe('resolveCupTie', () => {
  it('always names a winner, even from a dead-even draw', () => {
    const { home, away, players } = evenTeams()
    for (let seed = 1; seed <= 20; seed++) {
      const r = resolveCupTie(home, away, players, mulberry32(seed))
      expect(r.winnerId === home.id || r.winnerId === away.id).toBe(true)
    }
  })

  it('emits penalty events when a tie is level after extra time', () => {
    const { home, away, players } = evenTeams()
    let sawPens = false
    for (let seed = 1; seed <= 50 && !sawPens; seed++) {
      const r = resolveCupTie(home, away, players, mulberry32(seed))
      const pens = r.events.filter(e => e.type === 'penalty')
      if (pens.length > 0) {
        sawPens = true
        expect(pens.filter(e => e.teamId === home.id).length).toBeGreaterThanOrEqual(5)
        expect(pens.filter(e => e.teamId === away.id).length).toBeGreaterThanOrEqual(5)
      }
    }
    expect(sawPens).toBe(true)
  })
})
