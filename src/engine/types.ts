export type Position = 'GK' | 'DF' | 'MF' | 'FW'

export interface Player {
  id: number
  name: string
  age: number
  position: Position
  level: number // 1-99
  form: number // -3..+3, random walk each round
  fitness: number // 0-100; low fitness = weaker play, higher injury risk
  injuredForRounds: number // 0 = fit; N = misses the next N rounds
  suspendedForRounds: number // 0 = available
  yellowCards: number // this season; 3 accumulated = one-round ban
  salary: number // weekly, dollars
  contractSeasons: number // seasons remaining, including the current one
}

export type Tactic = 'defensive' | 'normal' | 'attacking'
export type TrainingStyle = 'light' | 'normal' | 'intensive' | 'youth'

export interface MatchEvent {
  minute: number
  type: 'goal' | 'chance' | 'yellow' | 'red' | 'injury'
  teamId: number
  playerId: number
  playerInId?: number // injury replacement, if a substitute came on
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
  tactic: Tactic
  trainingStyle: TrainingStyle
  cash: number
}

export interface TransferListing {
  playerId: number
  sellerTeamId: number
  minPrice: number
  currentBid: number | null
  currentBidderId: number | null
  roundsLeft: number // sells to the highest bidder when this hits 0
}

export interface Offer {
  playerId: number // a user player an AI club wants
  bidderTeamId: number
  amount: number
  roundsLeft: number
}

export interface FinanceEntry {
  season: number
  round: number
  label: string
  amount: number // positive = income
}

export interface Fixture {
  round: number // 1-based
  homeId: number
  awayId: number
  homeGoals: number | null // null = not played yet
  awayGoals: number | null
  events?: MatchEvent[]
}

export interface GameState {
  version: 3
  seed: number
  rngState: number // seeds the RNG for the next advanceRound
  season: number
  round: number // next round to play; > totalRounds means season is over
  userTeamId: number
  players: Record<number, Player>
  teams: Team[]
  fixtures: Fixture[]
  transferList: TransferListing[]
  incomingOffers: Offer[]
  loanBalance: number // user club only
  brokeRounds: number // consecutive rounds the user's cash was negative
  gameOver: boolean // board ran out of patience
  finances: FinanceEntry[] // user club ledger, newest last
}
