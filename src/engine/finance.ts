import { pushNews } from './news'
import { randInt } from './rng'
import { standings } from './standings'
import type { FinanceEntry, GameState, Player, Team } from './types'

// ponytail: economy constants tuned by feel — if seasons come out too rich
// or too poor, retune here and nowhere else
export const STARTING_CASH = 1_000_000
export const LOAN_CAP = 2_000_000

// scales fan interest and league prizes down the pyramid
export const DIVISION_FACTOR: Record<number, number> = { 1: 1, 2: 0.8, 3: 0.6 }

export const MAINTENANCE_PER_SEAT = 1.2
// ponytail: sponsor money — retune here and nowhere else
export const SPONSOR_BASE: Record<number, number> = { 1: 40_000, 2: 24_000, 3: 15_000 }

export function salaryFor(level: number): number {
  return Math.round(level * level * 2)
}

export function marketValue(p: Player): number {
  const ageFactor = p.age <= 23 ? 1.5 : p.age <= 29 ? 1 : 0.5
  return Math.round(p.level * p.level * 120 * ageFactor)
}

// ~12 weeks of wages per remaining contract season
export function severanceFor(p: Player): number {
  return p.salary * 12 * Math.max(1, p.contractSeasons)
}

export function formatMoney(n: number): string {
  const abs = Math.abs(Math.round(n)).toLocaleString('en-US')
  return n < 0 ? `-$${abs}` : `$${abs}`
}

export const TICKET_PRICE = 15
const DEPOSIT_INTEREST = 0.005
const LOAN_INTEREST = 0.02
const OVERDRAFT_INTEREST = 0.02
const BROKE_ROUNDS_LIMIT = 8
const LEDGER_CAP = 300

export function wageBill(teamId: number, state: GameState): number {
  const team = state.teams.find(t => t.id === teamId)!
  return team.playerIds.reduce((sum, id) => sum + state.players[id].salary, 0)
}

export function adjustCash(teams: Team[], teamId: number, delta: number): Team[] {
  return teams.map(t => (t.id === teamId ? { ...t, cash: t.cash + delta } : t))
}

export function userLedger(state: GameState, label: string, amount: number): FinanceEntry[] {
  return [...state.finances, { season: state.season, round: state.round, label, amount }].slice(-LEDGER_CAP)
}

// One code path for every club: wages out, gate receipts in on home weeks.
// The user additionally gets interest, loan charges, and board patience.
// Must run BEFORE advanceRound increments state.round.
export function runWeeklyFinances(state: GameState, rand: () => number): GameState {
  const position = new Map<number, number>()
  for (const division of new Set(state.teams.map(t => t.division))) {
    standings(state, division).forEach((row, i) => position.set(row.teamId, i + 1))
  }
  const homeThisRound = new Set([
    ...state.fixtures.filter(f => f.round === state.round).map(f => f.homeId),
    ...state.cupFixtures.filter(f => f.week === state.round).map(f => f.homeId),
  ])

  let finances = state.finances
  const addEntry = (label: string, amount: number) => {
    finances = [...finances, { season: state.season, round: state.round, label, amount }].slice(-LEDGER_CAP)
  }

  const teams = state.teams.map(team => {
    const user = team.id === state.userTeamId
    const wages = wageBill(team.id, state)
    let cash = team.cash - wages
    if (user) addEntry('Wages', -wages)

    const maintenance = Math.round(team.capacity * MAINTENANCE_PER_SEAT)
    cash -= maintenance
    if (user) addEntry('Stadium maintenance', -maintenance)

    const sponsors = Math.round((SPONSOR_BASE[team.division] ?? SPONSOR_BASE[3]) * (0.5 + team.fanMood / 100))
    cash += sponsors
    if (user) addEntry('Sponsors', sponsors)

    if (homeThisRound.has(team.id)) {
      const interest = Math.round(
        (9_000 + 900 * (16 - position.get(team.id)!)) * (DIVISION_FACTOR[team.division] ?? 1),
      )
      const priceFactor = (15 / team.ticketPrice) ** 1.5
      const moodFactor = 0.8 + (team.fanMood / 100) * 0.3 // ponytail: floor softened so a losing streak dents gates without a death spiral
      const attendance = Math.max(
        0,
        Math.min(team.capacity, Math.round(interest * priceFactor * moodFactor) + randInt(rand, -500, 500)),
      )
      const gate = attendance * team.ticketPrice
      cash += gate
      if (user) addEntry(`Gate receipts (${attendance} fans)`, gate)
    }

    if (user) {
      if (state.loanBalance > 0) {
        const interest = Math.round(state.loanBalance * LOAN_INTEREST)
        cash -= interest
        addEntry('Loan interest', -interest)
      }
      if (cash > 0) {
        const earned = Math.round(cash * DEPOSIT_INTEREST)
        cash += earned
        addEntry('Deposit interest', earned)
      } else if (cash < 0) {
        const charge = Math.round(-cash * OVERDRAFT_INTEREST)
        cash -= charge
        addEntry('Overdraft charge', -charge)
      }
    }
    return { ...team, cash }
  })

  const cashAfter = teams.find(t => t.id === state.userTeamId)!.cash
  const brokeRounds = cashAfter < 0 ? state.brokeRounds + 1 : 0
  let result: GameState = { ...state, teams, finances, brokeRounds, gameOver: state.gameOver || brokeRounds >= BROKE_ROUNDS_LIMIT }
  if (brokeRounds >= 6 && state.brokeRounds < 6) {
    result = pushNews(result, 'boardWarning', { n: brokeRounds })
  }
  return result
}

export function borrow(state: GameState, amount: number): GameState {
  if (state.gameOver || amount <= 0 || state.loanBalance + amount > LOAN_CAP) return state
  return {
    ...state,
    loanBalance: state.loanBalance + amount,
    teams: adjustCash(state.teams, state.userTeamId, amount),
    finances: userLedger(state, 'Loan drawn', amount),
  }
}

export function repayLoan(state: GameState, amount: number): GameState {
  const repay = Math.min(amount, state.loanBalance)
  if (state.gameOver || repay <= 0) return state
  return {
    ...state,
    loanBalance: state.loanBalance - repay,
    teams: adjustCash(state.teams, state.userTeamId, -repay),
    finances: userLedger(state, 'Loan repayment', -repay),
  }
}
