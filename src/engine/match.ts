import { isAvailable } from './lineup'
import type { MatchEvent, Player, Tactic, Team, TrainingStyle } from './types'

export interface MatchResult {
  homeGoals: number
  awayGoals: number
  events: MatchEvent[]
}

// form: ±3% per point (±9% max); fitness: linear down to -30% at 0
export function effectiveLevel(p: Player): number {
  return p.level * (1 + p.form * 0.03) * (0.7 + (0.3 * p.fitness) / 100)
}

const TACTIC_MODS: Record<Tactic, { att: number; def: number }> = {
  defensive: { att: 0.85, def: 1.15 },
  normal: { att: 1, def: 1 },
  attacking: { att: 1.15, def: 0.85 },
}

const INJURY_STYLE_MULT: Record<TrainingStyle, number> = {
  light: 0.7, normal: 1, intensive: 1.4, youth: 1,
}

// Tuned for ~2.7 goals per match between even sides. ponytail: constants
// picked by feel; retune here if seasons come out goal-starved or goal-flooded.
const HOME_ATTACK_BOOST = 1.1
const CHANCE_RATE = 0.1
const CONVERSION = 0.3
const YELLOW_P = 0.015 // per team-minute ≈ 1.35 yellows/team/match
const STRAIGHT_RED_P = 0.0005
const INJURY_P = 0.0012 // per team-minute ≈ 1 injury per team per 9 matches

const SCORER_WEIGHT: Record<Player['position'], number> = { GK: 0.1, DF: 1, MF: 2, FW: 4 }

interface Side {
  team: Team
  active: Player[]
  bench: Player[]
  home: boolean
  goals: number
  yellowed: Set<number>
}

function makeSide(team: Team, players: Record<number, Player>, home: boolean): Side {
  const active = team.lineup.map(id => players[id])
  const bench = team.playerIds
    .map(id => players[id])
    .filter(p => isAvailable(p) && !team.lineup.includes(p.id))
  return { team, active, bench, home, goals: 0, yellowed: new Set() }
}

function attack(side: Side): number {
  let att = 0
  for (const p of side.active) {
    const e = effectiveLevel(p)
    if (p.position === 'FW') att += e
    else if (p.position === 'MF') att += e / 2
  }
  return att * TACTIC_MODS[side.team.tactic].att * (side.home ? HOME_ATTACK_BOOST : 1)
}

function defense(side: Side): number {
  let def = 0
  for (const p of side.active) {
    const e = effectiveLevel(p)
    if (p.position === 'GK') def += e * 1.5
    else if (p.position === 'DF') def += e
    else if (p.position === 'MF') def += e / 2
  }
  return def * TACTIC_MODS[side.team.tactic].def
}

function pickWeighted(players: Player[], weight: (p: Player) => number, rand: () => number): Player {
  const total = players.reduce((s, p) => s + weight(p), 0)
  let r = rand() * total
  for (const p of players) {
    r -= weight(p)
    if (r <= 0) return p
  }
  return players[players.length - 1]
}

function pickUniform(players: Player[], rand: () => number): Player {
  return players[Math.floor(rand() * players.length)]
}

export function simulateMatch(
  home: Team,
  away: Team,
  players: Record<number, Player>,
  rand: () => number,
): MatchResult {
  const sides: [Side, Side] = [makeSide(home, players, true), makeSide(away, players, false)]
  const events: MatchEvent[] = []

  for (let minute = 1; minute <= 90; minute++) {
    for (const [side, opp] of [[sides[0], sides[1]], [sides[1], sides[0]]] as const) {
      if (side.active.length === 0) continue
      const att = attack(side) ** 2
      const def = defense(opp) ** 2
      const share = att / (att + def)

      if (rand() < CHANCE_RATE * share) {
        const shooter = pickWeighted(side.active, p => SCORER_WEIGHT[p.position], rand)
        if (rand() < CONVERSION) {
          side.goals++
          events.push({ minute, type: 'goal', teamId: side.team.id, playerId: shooter.id })
        } else {
          events.push({ minute, type: 'chance', teamId: side.team.id, playerId: shooter.id })
        }
      }

      if (rand() < YELLOW_P) {
        const culprit = pickUniform(side.active, rand)
        if (side.yellowed.has(culprit.id)) {
          side.active = side.active.filter(p => p.id !== culprit.id) // second yellow → off
          events.push({ minute, type: 'red', teamId: side.team.id, playerId: culprit.id })
        } else {
          side.yellowed.add(culprit.id)
          events.push({ minute, type: 'yellow', teamId: side.team.id, playerId: culprit.id })
        }
      } else if (rand() < STRAIGHT_RED_P) {
        const culprit = pickUniform(side.active, rand)
        side.active = side.active.filter(p => p.id !== culprit.id)
        events.push({ minute, type: 'red', teamId: side.team.id, playerId: culprit.id })
      }

      if (rand() < INJURY_P * INJURY_STYLE_MULT[side.team.trainingStyle]) {
        const victim = pickUniform(side.active, rand)
        side.active = side.active.filter(p => p.id !== victim.id)
        const sub =
          side.bench.filter(p => p.position === victim.position).sort((a, b) => b.level - a.level)[0] ??
          side.bench.sort((a, b) => b.level - a.level)[0]
        if (sub) {
          side.bench = side.bench.filter(p => p.id !== sub.id)
          side.active = [...side.active, sub]
        }
        events.push({ minute, type: 'injury', teamId: side.team.id, playerId: victim.id, playerInId: sub?.id })
      }
    }
  }

  return { homeGoals: sides[0].goals, awayGoals: sides[1].goals, events }
}
