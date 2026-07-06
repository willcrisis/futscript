import { randInt } from './rng'
import type { Player, Team, TrainingStyle } from './types'

const STYLE_MULT: Record<TrainingStyle, (age: number) => number> = {
  light: () => 0.5,
  normal: () => 1,
  intensive: () => 1.5,
  youth: age => (age <= 21 ? 2.2 : 0.4),
}

// weekly chance of gaining +1 level
function growthChance(age: number): number {
  if (age <= 23) return 0.25
  if (age <= 29) return 0.08
  return 0
}

const MATCH_FITNESS_COST = 25
const WEEKLY_RECOVERY = 20

export function applyWeeklyUpdates(
  players: Record<number, Player>,
  teams: Team[],
  starters: Set<number>,
  rand: () => number,
): Record<number, Player> {
  const styleOf = new Map<number, TrainingStyle>()
  for (const t of teams) for (const id of t.playerIds) styleOf.set(id, t.trainingStyle)

  return Object.fromEntries(
    Object.values(players).map(p => {
      const style = styleOf.get(p.id) ?? 'normal'
      const gain = rand() < growthChance(p.age) * STYLE_MULT[style](p.age) ? 1 : 0
      const fitness = Math.min(
        100,
        Math.max(0, p.fitness - (starters.has(p.id) ? MATCH_FITNESS_COST : 0) + WEEKLY_RECOVERY),
      )
      const form = Math.max(-3, Math.min(3, p.form + randInt(rand, -1, 1)))
      return [p.id, { ...p, level: Math.min(99, p.level + gain), fitness, form }]
    }),
  )
}

// Season rollover: everyone a year older, veterans decline, season fields reset.
// Retirement and youth intake arrive in Phase 4.
export function ageSquads(players: Record<number, Player>, rand: () => number): Record<number, Player> {
  return Object.fromEntries(
    Object.values(players).map(p => {
      const age = p.age + 1
      const decline = age >= 30 ? randInt(rand, 1, 3) : 0
      return [p.id, {
        ...p, age,
        level: Math.max(1, p.level - decline),
        form: 0, fitness: 100, yellowCards: 0, injuredForRounds: 0, suspendedForRounds: 0,
      }]
    }),
  )
}
