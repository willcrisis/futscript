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
  seasonGoals: number // this season, league + cup (friendlies excluded)
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
  division: number // 1 (top) .. 3
  capacity: number // stadium seats
  ticketPrice: number // dollars, user-settable 5-60
  fanMood: number // 0-100; drives attendance and sponsors
  manager: string // AI manager name; for the user's club it is stale — render state.manager.name instead
  managerHiredSeason: number // 0 = founding; === current season → immune from sacking
}

export interface TransferListing {
  playerId: number
  sellerTeamId: number
  minPrice: number
  currentBid: number | null
  currentBidderId: number | null
  userBid?: number // the user's last bid on this listing; persists after a rival covers it (optional — old saves omit it)
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
  attendance?: number // home gate crowd, stamped when the match is settled
  events?: MatchEvent[]
}

export interface CupFixture {
  week: number // calendar week the tie is played
  cupRound: number // 1..6; division 1 clubs enter in round 2
  homeId: number
  awayId: number
  homeGoals: number | null
  awayGoals: number | null
  winnerId: number | null // set when played; a drawn tie is decided on penalties
  attendance?: number // home gate crowd, stamped when the match is settled
  events?: MatchEvent[]
}

export interface SeasonRecord {
  season: number
  champions: string[] // champion club name per division, index 0 = Division 1
  cupWinner: string // '—' when no cup ran (not-yet-expanded migrated world)
  topScorer: { player: string; team: string; goals: number }
  userDivision: number
  userPosition: number
  club: string // which club the manager ran that season ('—' if unemployed all season)
}

export interface ScorerRecord {
  playerId: number
  player: string
  team: string // last club they scored for
  goals: number
}

export type NewsType =
  | 'userSigned' | 'userSold' | 'userRenewed' | 'userOutbid' | 'offerReceived'
  | 'starterInjured' | 'boardWarning' | 'constructionDone'
  | 'rivalTransfer' | 'heavyWin' | 'cupRun'
  | 'champions' | 'cupWinner' | 'promoted' | 'relegated'
  | 'managerSacked' | 'managerHired' | 'userSacked' | 'userHired' | 'jobOffer'

export interface NewsItem {
  season: number
  week: number
  type: NewsType
  params: Record<string, string | number> // names and numbers as data — translated at render time
}

export interface JobOffer {
  teamId: number
  roundsLeft: number // offer expires when this hits 0
}

export interface Manager {
  name: string
  reputation: number // 0-100, career-long, survives sackings
  confidence: number // 0-100, board patience with results; 0 = sacked
  employed: boolean // false = spectating, awaiting offers
  hiredSeason: number // season the current job started; === current season → honeymoon (gains only)
  jobOffers: JobOffer[] // job market (unemployed) or poach offers (employed)
}

// The one predicate for "does the user run this club" — lives here so every
// engine module can import it without cycles.
export function isManaged(state: GameState, teamId: number): boolean {
  return state.manager.employed && teamId === state.userTeamId
}

export interface GameState {
  version: 7
  seed: number
  rngState: number // seeds the RNG for the next advanceRound
  season: number
  round: number // next round to play; > totalRounds means season is over
  userTeamId: number
  players: Record<number, Player>
  teams: Team[]
  fixtures: Fixture[]
  cupFixtures: CupFixture[]
  history: SeasonRecord[] // one record per completed season
  playFriendlies: boolean // user setting: friendlies on free weeks
  transferList: TransferListing[]
  incomingOffers: Offer[]
  loanBalance: number // user club only
  brokeRounds: number // consecutive rounds the user's cash was negative
  finances: FinanceEntry[] // user club ledger, newest last
  construction: { addedCapacity: number; weeksLeft: number } | null // user stadium expansion in progress
  allTimeScorers: ScorerRecord[] // top 50, updated at each rollover
  news: NewsItem[] // newest last, capped at NEWS_CAP
  manager: Manager
  unemployedPool: string[] // sacked AI names awaiting a bench, oldest dropped at POOL_CAP
}
