export type Position = 'GK' | 'DF' | 'MF' | 'FW'

export interface Player {
  id: number
  name: string
  age: number
  position: Position
  level: number // 1-99
}

export type FormationName = '4-4-2' | '4-3-3' | '3-5-2' | '5-3-2' | '5-4-1'

export const FORMATIONS: Record<FormationName, Record<Position, number>> = {
  '4-4-2': { GK: 1, DF: 4, MF: 4, FW: 2 },
  '4-3-3': { GK: 1, DF: 4, MF: 3, FW: 3 },
  '3-5-2': { GK: 1, DF: 3, MF: 5, FW: 2 },
  '5-3-2': { GK: 1, DF: 5, MF: 3, FW: 2 },
  '5-4-1': { GK: 1, DF: 5, MF: 4, FW: 1 },
}

export interface Team {
  id: number
  name: string
  playerIds: number[]
  formation: FormationName
  lineup: number[] // 11 player ids, always valid for the formation
}

export interface Fixture {
  round: number // 1-based
  homeId: number
  awayId: number
  homeGoals: number | null // null = not played yet
  awayGoals: number | null
}

export interface GameState {
  version: 1
  seed: number
  rngState: number // seeds the RNG for the next advanceRound
  season: number
  round: number // next round to play; > totalRounds means season is over
  userTeamId: number
  players: Record<number, Player>
  teams: Team[]
  fixtures: Fixture[]
}
