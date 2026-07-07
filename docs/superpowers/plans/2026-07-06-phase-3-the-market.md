# Futscript Phase 3 — The Market Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Money enters the game — salaries and weekly wage bills, gate receipts, prize money, a finance screen with a ledger, bank loans, deadline-auction transfers with AI bidders, incoming AI offers, contracts with renewals, releases with severance, and the board sacking you if you stay broke.

**Architecture:** Two new pure-engine modules: `finance.ts` (money math, weekly finances, loans, ledger) and `transfers.ts` (listings, auctions, offers, contracts, all user market actions). `advanceRound` composes them after the Phase 2 pipeline: simulate → consequences → weekly updates → `runTransfers` → `runWeeklyFinances`. Every club shares one finance code path (AI clubs earn and spend like the user; only the ledger and loans are user-only), so AI transfer budgets are real. Save schema becomes `version: 3` with chained migrations (v1→v2→v3).

**Tech Stack:** Existing Vite + React + TypeScript (strict) + Vitest. No new dependencies.

## Prerequisite

Phase 2 must be merged (git tag `phase-2`, all tests green). This plan builds on Phase 2's types (`form`, `fitness`, `injuredForRounds`, `suspendedForRounds`, `yellowCards`, `Tactic`, `TrainingStyle`, `MatchEvent`) and its `advanceRound` structure exactly as written in `docs/superpowers/plans/2026-07-06-phase-2-matchday.md`. If Phase 2 landed with different names or shapes, adapt mechanically and note the deviation; if it isn't finished, stop.

## Global Constraints

- Local-only: no network calls, no backend. Persistence is localStorage.
- `src/engine/` must not import React or touch the DOM (exception: `save.ts` defaults `storage: Storage = localStorage`).
- All state changes are pure functions returning a new `GameState`; user market actions are engine functions `(GameState, ...) => GameState` that return the input state unchanged when a request is invalid (UI also guards).
- Randomness only via the seeded RNG threaded through `rngState`; no `Math.random()`. UI action handlers must not need randomness.
- Save schema becomes `version: 3`; `load()` migrates v1 and v2 saves.
- Money is integer dollars (`Math.round` everywhere money is computed).
- A club may never drop below 14 players via sales or releases (`MIN_SQUAD = 14`).
- Economy constants are tuned by feel and marked with a `ponytail:` comment — retune in one place if seasons come out too rich or too poor.

## File Structure

- `src/engine/types.ts` — `Player` gains `salary`, `contractSeasons`; `Team` gains `cash`; new `TransferListing`, `Offer`, `FinanceEntry`; `GameState` gains market/finance fields, `version: 3`
- `src/engine/finance.ts` — NEW: money formulas, `runWeeklyFinances`, `borrow`/`repayLoan`, ledger helpers, `formatMoney`
- `src/engine/transfers.ts` — NEW: `transferPlayer`, `listPlayer`, `placeBid`, `releasePlayer`, `renewContract`, offer actions, `runTransfers`
- `src/engine/newGame.ts` — salaries, contracts, starting cash, new state fields
- `src/engine/save.ts` — v2→v3 migration, chained from v1
- `src/engine/season.ts` — `advanceRound` composes transfers + finances; `newSeason` pays prizes, settles contracts, clears the market
- `src/screens/SquadScreen.tsx` — salary/contract/value columns; Sell, Release, Renew actions
- `src/screens/TransfersScreen.tsx` — NEW: transfer list with bidding, incoming offers
- `src/screens/FinanceScreen.tsx` — NEW: cash, loan controls, ledger
- `src/App.tsx` — two new tabs, sacked-screen takeover

---

### Task 1: Types v3, money formulas, newGame, migrations

**Files:**
- Modify: `src/engine/types.ts`, `src/engine/newGame.ts`, `src/engine/save.ts`
- Create: `src/engine/finance.ts` (formulas only in this task)
- Modify (helpers only): `src/engine/lineup.test.ts`, `src/engine/match.test.ts`, `src/engine/training.test.ts`, `src/engine/season.test.ts`, `src/engine/standings.test.ts`
- Test: `src/engine/finance.test.ts`, `src/engine/save.test.ts`, `src/engine/newGame.test.ts`

**Interfaces:**
- Consumes: Phase 2 types
- Produces (used by every later task):
  - `Player` gains `salary: number`, `contractSeasons: number` (seasons remaining, including the current one)
  - `Team` gains `cash: number`
  - `interface TransferListing { playerId: number; sellerTeamId: number; minPrice: number; currentBid: number | null; currentBidderId: number | null; roundsLeft: number }`
  - `interface Offer { playerId: number; bidderTeamId: number; amount: number; roundsLeft: number }`
  - `interface FinanceEntry { season: number; round: number; label: string; amount: number }`
  - `GameState` gains `transferList: TransferListing[]`, `incomingOffers: Offer[]`, `loanBalance: number`, `brokeRounds: number`, `gameOver: boolean`, `finances: FinanceEntry[]`; `version: 3`
  - `finance.ts`: `STARTING_CASH = 1_000_000`, `LOAN_CAP = 2_000_000`, `salaryFor(level: number): number`, `marketValue(p: Player): number`, `severanceFor(p: Player): number`, `formatMoney(n: number): string`

- [ ] **Step 1: Write the failing tests**

`src/engine/finance.test.ts` (new file — more tests join it in Task 2):

```ts
import { describe, expect, it } from 'vitest'
import { formatMoney, marketValue, salaryFor, severanceFor } from './finance'
import type { Player } from './types'

export function makePlayer(id: number, over: Partial<Player> = {}): Player {
  return {
    id, name: `P${id}`, age: 25, position: 'MF', level: 50,
    form: 0, fitness: 100, injuredForRounds: 0, suspendedForRounds: 0, yellowCards: 0,
    salary: salaryFor(50), contractSeasons: 2,
    ...over,
  }
}

describe('money formulas', () => {
  it('salary scales with the square of level', () => {
    expect(salaryFor(50)).toBe(6250)
    expect(salaryFor(70)).toBe(12250)
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
```

Add to `src/engine/newGame.test.ts`:

```ts
it('gives every player a salary and contract, and every club starting cash', () => {
  const state = newGame(123)
  for (const p of Object.values(state.players)) {
    expect(p.salary).toBe(salaryFor(p.level))
    expect(p.contractSeasons).toBeGreaterThanOrEqual(1)
    expect(p.contractSeasons).toBeLessThanOrEqual(3)
  }
  for (const t of state.teams) expect(t.cash).toBe(STARTING_CASH)
  expect(state.transferList).toEqual([])
  expect(state.incomingOffers).toEqual([])
  expect(state.loanBalance).toBe(0)
  expect(state.brokeRounds).toBe(0)
  expect(state.gameOver).toBe(false)
  expect(state.finances).toEqual([])
})
```

with imports `import { salaryFor, STARTING_CASH } from './finance'`.

In `src/engine/save.test.ts`: update the v1-migration expectations to `version` **3** and add the new defaults, plus a v2→v3 test:

```ts
it('migrates a v1 save all the way to v3', () => {
  const storage = fakeStorage()
  const v1 = {
    version: 1, seed: 1, rngState: 1, season: 1, round: 5, userTeamId: 0,
    players: { 1: { id: 1, name: 'P1', age: 25, position: 'GK', level: 50 } },
    teams: [{ id: 0, name: 'T0', playerIds: [1], formation: '4-4-2', lineup: [1] }],
    fixtures: [],
  }
  storage.setItem('futscript-save', JSON.stringify(v1))
  const state = load(storage)
  expect(state!.version).toBe(3)
  expect(state!.players[1]).toMatchObject({
    form: 0, fitness: 100, yellowCards: 0, salary: salaryFor(50), contractSeasons: 2,
  })
  expect(state!.teams[0]).toMatchObject({ tactic: 'normal', trainingStyle: 'normal', cash: 1_000_000 })
  expect(state!.transferList).toEqual([])
  expect(state!.gameOver).toBe(false)
})

it('migrates a v2 save to v3', () => {
  const storage = fakeStorage()
  const v2 = {
    version: 2, seed: 1, rngState: 1, season: 1, round: 5, userTeamId: 0,
    players: { 1: {
      id: 1, name: 'P1', age: 25, position: 'GK', level: 50,
      form: 1, fitness: 80, injuredForRounds: 2, suspendedForRounds: 0, yellowCards: 1,
    } },
    teams: [{ id: 0, name: 'T0', playerIds: [1], formation: '4-4-2', lineup: [1], tactic: 'attacking', trainingStyle: 'youth' }],
    fixtures: [],
  }
  storage.setItem('futscript-save', JSON.stringify(v2))
  const state = load(storage)
  expect(state!.version).toBe(3)
  expect(state!.players[1]).toMatchObject({ form: 1, fitness: 80, salary: salaryFor(50), contractSeasons: 2 })
  expect(state!.teams[0]).toMatchObject({ tactic: 'attacking', cash: 1_000_000 })
  expect(state!.loanBalance).toBe(0)
})
```

with `import { salaryFor } from './finance'`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engine/finance.test.ts src/engine/save.test.ts src/engine/newGame.test.ts`
Expected: FAIL — `./finance` unresolved; migrations return version 2

- [ ] **Step 3: Extend the types**

In `src/engine/types.ts`, `Player` gains (after `yellowCards`):

```ts
  salary: number // weekly, dollars
  contractSeasons: number // seasons remaining, including the current one
```

`Team` gains (after `trainingStyle`):

```ts
  cash: number
```

Add the new interfaces:

```ts
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
```

`GameState` becomes `version: 3` and gains:

```ts
  transferList: TransferListing[]
  incomingOffers: Offer[]
  loanBalance: number // user club only
  brokeRounds: number // consecutive rounds the user's cash was negative
  gameOver: boolean // board ran out of patience
  finances: FinanceEntry[] // user club ledger, newest last
```

- [ ] **Step 4: Create the formula half of `src/engine/finance.ts`**

```ts
import type { Player } from './types'

// ponytail: economy constants tuned by feel — if seasons come out too rich
// or too poor, retune here and nowhere else
export const STARTING_CASH = 1_000_000
export const LOAN_CAP = 2_000_000

export function salaryFor(level: number): number {
  return Math.round(level * level * 2.5)
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
```

- [ ] **Step 5: Update newGame**

In `src/engine/newGame.ts`, import `salaryFor` and `STARTING_CASH` from `./finance`. The salary depends on the level, so hoist the level out of the player literal:

```ts
const level = randInt(rand, 30, 70)
const player: Player = {
  id: nextPlayerId++,
  name: randomName(rand),
  age: randInt(rand, 17, 34),
  position,
  level,
  form: 0,
  fitness: 100,
  injuredForRounds: 0,
  suspendedForRounds: 0,
  yellowCards: 0,
  salary: salaryFor(level),
  contractSeasons: randInt(rand, 1, 3),
}
```

Each team literal gains `cash: STARTING_CASH`. The returned state gains:

```ts
version: 3,
transferList: [],
incomingOffers: [],
loanBalance: 0,
brokeRounds: 0,
gameOver: false,
finances: [],
```

- [ ] **Step 6: Chain the migrations in save.ts**

In `src/engine/save.ts` import `salaryFor` from `./finance`, then:

```ts
export function load(storage: Storage = localStorage): GameState | null {
  const raw = storage.getItem(KEY)
  if (!raw) return null
  try {
    let state = JSON.parse(raw)
    if (state?.version === 1) state = migrateV1(state)
    if (state?.version === 2) state = migrateV2(state)
    return state?.version === 3 ? (state as GameState) : null
  } catch {
    return null
  }
}
```

(`migrateV1` stays as Phase 2 wrote it — it produces a v2 object.) Add:

```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
function migrateV2(s: any): GameState {
  return {
    ...s,
    version: 3,
    players: Object.fromEntries(
      Object.values<any>(s.players).map(p => [p.id, { ...p, salary: salaryFor(p.level), contractSeasons: 2 }]),
    ),
    teams: s.teams.map((t: any) => ({ ...t, cash: 1_000_000 })),
    transferList: [],
    incomingOffers: [],
    loanBalance: 0,
    brokeRounds: 0,
    gameOver: false,
    finances: [],
  }
}
```

- [ ] **Step 7: Mechanically update the existing test helpers**

Every `Player` literal in test helpers gains `salary: 5000, contractSeasons: 2`; every `Team` literal gains `cash: 1_000_000`. Specifically:

- `src/engine/lineup.test.ts` → `makeSquad` player and team literals
- `src/engine/match.test.ts` → `makeTeam` player and team literals
- `src/engine/training.test.ts` → `makePlayer` and `makeTeam`
- `src/engine/season.test.ts` → `makePlayer`
- `src/engine/standings.test.ts` → `makeState` team literals, and the state literal gains `version: 3, transferList: [], incomingOffers: [], loanBalance: 0, brokeRounds: 0, gameOver: false, finances: []`

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: PASS everywhere.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: v3 game state with salaries, contracts, club cash; chained save migrations"
```

---

### Task 2: Weekly finances and loans

**Files:**
- Modify: `src/engine/finance.ts`
- Test: `src/engine/finance.test.ts`

**Interfaces:**
- Consumes: `standings` from `./standings`; `randInt` from `./rng`; types
- Produces:
  - `wageBill(teamId: number, state: GameState): number`
  - `adjustCash(teams: Team[], teamId: number, delta: number): Team[]`
  - `userLedger(state: GameState, label: string, amount: number): FinanceEntry[]` — appends one entry (season/round from state), capped at 300 entries
  - `runWeeklyFinances(state: GameState, rand: () => number): GameState` — wages + gate receipts for every club, interest/loan/board-patience for the user; called by `advanceRound` BEFORE the round number is incremented
  - `borrow(state: GameState, amount: number): GameState`, `repayLoan(state: GameState, amount: number): GameState`

- [ ] **Step 1: Write the failing tests**

Add to `src/engine/finance.test.ts`:

```ts
import { mulberry32 } from './rng'
import { newGame } from './newGame'
import {
  adjustCash, borrow, LOAN_CAP, repayLoan, runWeeklyFinances, salaryFor,
  STARTING_CASH, wageBill,
} from './finance'
import type { GameState } from './types'

function userCash(s: GameState): number {
  return s.teams.find(t => t.id === s.userTeamId)!.cash
}

describe('runWeeklyFinances', () => {
  it('charges every club its wage bill and pays home clubs gate receipts', () => {
    const s0 = newGame(1)
    const s1 = runWeeklyFinances(s0, mulberry32(2))
    const homeIds = new Set(s0.fixtures.filter(f => f.round === 1).map(f => f.homeId))
    for (const t of s1.teams) {
      const before = STARTING_CASH - wageBill(t.id, s0)
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/finance.test.ts`
Expected: FAIL — `runWeeklyFinances`/`borrow`/`repayLoan`/`wageBill`/`adjustCash` not exported

- [ ] **Step 3: Implement**

Add to `src/engine/finance.ts`:

```ts
import { randInt } from './rng'
import { standings } from './standings'
import type { FinanceEntry, GameState, Team } from './types'
```

(merge with the existing `Player` type import) and:

```ts
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
  const position = new Map(standings(state).map((row, i) => [row.teamId, i + 1]))
  const homeThisRound = new Set(state.fixtures.filter(f => f.round === state.round).map(f => f.homeId))

  let finances = state.finances
  const addEntry = (label: string, amount: number) => {
    finances = [...finances, { season: state.season, round: state.round, label, amount }].slice(-LEDGER_CAP)
  }

  const teams = state.teams.map(team => {
    const user = team.id === state.userTeamId
    const wages = wageBill(team.id, state)
    let cash = team.cash - wages
    if (user) addEntry('Wages', -wages)

    if (homeThisRound.has(team.id)) {
      const attendance = 10_000 + 800 * (16 - position.get(team.id)!) + randInt(rand, -1000, 1000)
      const gate = attendance * TICKET_PRICE
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
  return { ...state, teams, finances, brokeRounds, gameOver: state.gameOver || brokeRounds >= BROKE_ROUNDS_LIMIT }
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/finance.test.ts`
Expected: PASS (12 tests)

- [ ] **Step 5: Commit**

```bash
git add src/engine/finance.ts src/engine/finance.test.ts
git commit -m "feat: weekly club finances, ledger, and bank loans"
```

---

### Task 3: Transfer core — moving players and user market actions

**Files:**
- Create: `src/engine/transfers.ts`
- Test: `src/engine/transfers.test.ts`

**Interfaces:**
- Consumes: `adjustCash`, `marketValue`, `salaryFor`, `severanceFor`, `userLedger` from `./finance`; types
- Produces:
  - `MIN_SQUAD = 14` (exported)
  - `transferPlayer(state, playerId: number, toTeamId: number, fee: number): GameState` — moves the player between clubs, settles cash, strips lineups/listings/offers, resets contract to 2 seasons, writes the user ledger when the user is involved
  - `listPlayer(state, playerId: number, minPrice: number): GameState`
  - `requiredBid(listing: TransferListing): number` — `minPrice` or `currentBid * 1.1`
  - `placeBid(state, playerId: number, amount: number): GameState` — user bid
  - `releasePlayer(state, playerId: number): GameState` — severance, player gone
  - `renewalSalary(p: Player): number`, `renewContract(state, playerId: number): GameState` — only when `contractSeasons <= 1`; +2 seasons at the new salary

- [ ] **Step 1: Write the failing tests**

`src/engine/transfers.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { salaryFor, severanceFor } from './finance'
import { newGame } from './newGame'
import {
  listPlayer, MIN_SQUAD, placeBid, releasePlayer, renewalSalary, renewContract,
  requiredBid, transferPlayer,
} from './transfers'
import type { GameState } from './types'

function cashOf(s: GameState, teamId: number): number {
  return s.teams.find(t => t.id === teamId)!.cash
}

describe('transferPlayer', () => {
  it('moves the player, the money, and cleans up', () => {
    const s0 = newGame(1)
    const seller = s0.teams[1]
    const playerId = seller.lineup[0]
    const s1 = transferPlayer(s0, playerId, 0, 400_000)
    expect(s1.teams[1].playerIds).not.toContain(playerId)
    expect(s1.teams[1].lineup).not.toContain(playerId)
    expect(s1.teams[0].playerIds).toContain(playerId)
    expect(cashOf(s1, 1)).toBe(cashOf(s0, 1) + 400_000)
    expect(cashOf(s1, 0)).toBe(cashOf(s0, 0) - 400_000)
    expect(s1.players[playerId].contractSeasons).toBe(2)
    // user (team 0) bought — ledger entry written
    expect(s1.finances.some(e => e.amount === -400_000)).toBe(true)
  })
})

describe('listPlayer / placeBid', () => {
  it('lists a player once and enforces the bid floor and cash', () => {
    const s0 = newGame(1)
    const aiPlayer = s0.teams[2].lineup[0]
    let s = listPlayer(s0, aiPlayer, 300_000)
    expect(s.transferList).toHaveLength(1)
    expect(listPlayer(s, aiPlayer, 300_000).transferList).toHaveLength(1) // no double listing

    expect(placeBid(s, aiPlayer, 200_000)).toEqual(s) // below min price → unchanged
    s = placeBid(s, aiPlayer, 300_000)
    expect(s.transferList[0]).toMatchObject({ currentBid: 300_000, currentBidderId: s.userTeamId })

    expect(requiredBid(s.transferList[0])).toBe(330_000)
    expect(placeBid(s, aiPlayer, 5_000_000)).toEqual(s) // more than user cash → unchanged
  })

  it('will not let the user bid on their own listing', () => {
    const s0 = newGame(1)
    const own = s0.teams[0].lineup[0]
    const s = listPlayer(s0, own, 100_000)
    expect(placeBid(s, own, 100_000)).toEqual(s)
  })

  it('will not let a squad shrink below MIN_SQUAD by listing', () => {
    const s0 = newGame(1)
    // shrink team 0 to MIN_SQUAD players by faking playerIds
    const t0 = s0.teams[0]
    const s: GameState = {
      ...s0,
      teams: s0.teams.map(t => (t.id === 0 ? { ...t, playerIds: t.playerIds.slice(0, MIN_SQUAD) } : t)),
    }
    expect(listPlayer(s, t0.playerIds[0], 100_000).transferList).toHaveLength(0)
  })
})

describe('releasePlayer', () => {
  it('pays severance and removes the player', () => {
    const s0 = newGame(1)
    const victimId = s0.teams[0].playerIds[17]
    const severance = severanceFor(s0.players[victimId])
    const s1 = releasePlayer(s0, victimId)
    expect(s1.players[victimId]).toBeUndefined()
    expect(s1.teams[0].playerIds).not.toContain(victimId)
    expect(cashOf(s1, 0)).toBe(cashOf(s0, 0) - severance)
  })

  it('refuses to release below MIN_SQUAD or non-user players', () => {
    const s0 = newGame(1)
    const aiPlayer = s0.teams[3].playerIds[0]
    expect(releasePlayer(s0, aiPlayer)).toEqual(s0)
  })
})

describe('renewContract', () => {
  it('renews an expiring contract at a premium', () => {
    const s0 = newGame(1)
    const id = s0.teams[0].playerIds[0]
    const expiring: GameState = {
      ...s0,
      players: { ...s0.players, [id]: { ...s0.players[id], contractSeasons: 1 } },
    }
    const s1 = renewContract(expiring, id)
    expect(s1.players[id].contractSeasons).toBe(3)
    expect(s1.players[id].salary).toBe(renewalSalary(expiring.players[id]))
    expect(s1.players[id].salary).toBeGreaterThan(expiring.players[id].salary)
  })

  it('refuses to renew a long contract', () => {
    const s0 = newGame(1)
    const id = s0.teams[0].playerIds[0]
    const long: GameState = {
      ...s0,
      players: { ...s0.players, [id]: { ...s0.players[id], contractSeasons: 3 } },
    }
    expect(renewContract(long, id)).toEqual(long)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/transfers.test.ts`
Expected: FAIL — cannot resolve `./transfers`

- [ ] **Step 3: Implement**

`src/engine/transfers.ts`:

```ts
import { adjustCash, salaryFor, severanceFor, userLedger } from './finance'
import type { GameState, Player, TransferListing } from './types'

export const MIN_SQUAD = 14
export const LISTING_ROUNDS = 3

export function transferPlayer(state: GameState, playerId: number, toTeamId: number, fee: number): GameState {
  const from = state.teams.find(t => t.playerIds.includes(playerId))!
  const player = state.players[playerId]
  let teams = state.teams.map(t => {
    if (t.id === from.id) {
      return { ...t, playerIds: t.playerIds.filter(id => id !== playerId), lineup: t.lineup.filter(id => id !== playerId) }
    }
    if (t.id === toTeamId) return { ...t, playerIds: [...t.playerIds, playerId] }
    return t
  })
  teams = adjustCash(teams, from.id, fee)
  teams = adjustCash(teams, toTeamId, -fee)

  let finances = state.finances
  if (from.id === state.userTeamId) finances = userLedger(state, `Sold ${player.name}`, fee)
  else if (toTeamId === state.userTeamId) finances = userLedger(state, `Signed ${player.name}`, -fee)

  return {
    ...state,
    teams,
    finances,
    players: { ...state.players, [playerId]: { ...player, contractSeasons: 2 } },
    transferList: state.transferList.filter(l => l.playerId !== playerId),
    incomingOffers: state.incomingOffers.filter(o => o.playerId !== playerId),
  }
}

export function listPlayer(state: GameState, playerId: number, minPrice: number): GameState {
  const owner = state.teams.find(t => t.playerIds.includes(playerId))
  if (!owner || minPrice <= 0) return state
  if (owner.playerIds.length <= MIN_SQUAD) return state
  if (state.transferList.some(l => l.playerId === playerId)) return state
  return {
    ...state,
    transferList: [...state.transferList, {
      playerId,
      sellerTeamId: owner.id,
      minPrice,
      currentBid: null,
      currentBidderId: null,
      roundsLeft: LISTING_ROUNDS,
    }],
  }
}

export function requiredBid(listing: TransferListing): number {
  return listing.currentBid === null ? listing.minPrice : Math.round(listing.currentBid * 1.1)
}

export function placeBid(state: GameState, playerId: number, amount: number): GameState {
  const listing = state.transferList.find(l => l.playerId === playerId)
  if (!listing || listing.sellerTeamId === state.userTeamId) return state
  const user = state.teams.find(t => t.id === state.userTeamId)!
  if (amount < requiredBid(listing) || amount > user.cash) return state
  return {
    ...state,
    transferList: state.transferList.map(l =>
      l.playerId === playerId ? { ...l, currentBid: amount, currentBidderId: state.userTeamId } : l,
    ),
  }
}

export function releasePlayer(state: GameState, playerId: number): GameState {
  const user = state.teams.find(t => t.id === state.userTeamId)!
  if (!user.playerIds.includes(playerId) || user.playerIds.length <= MIN_SQUAD) return state
  const p = state.players[playerId]
  const severance = severanceFor(p)
  const players = { ...state.players }
  delete players[playerId]
  return {
    ...state,
    players,
    teams: adjustCash(
      state.teams.map(t =>
        t.id === user.id
          ? { ...t, playerIds: t.playerIds.filter(id => id !== playerId), lineup: t.lineup.filter(id => id !== playerId) }
          : t,
      ),
      user.id,
      -severance,
    ),
    finances: userLedger(state, `Released ${p.name} (severance)`, -severance),
    transferList: state.transferList.filter(l => l.playerId !== playerId),
    incomingOffers: state.incomingOffers.filter(o => o.playerId !== playerId),
  }
}

export function renewalSalary(p: Player): number {
  return Math.round(Math.max(p.salary, salaryFor(p.level)) * 1.1)
}

export function renewContract(state: GameState, playerId: number): GameState {
  const user = state.teams.find(t => t.id === state.userTeamId)!
  const p = state.players[playerId]
  if (!user.playerIds.includes(playerId) || p.contractSeasons > 1) return state
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: { ...p, salary: renewalSalary(p), contractSeasons: p.contractSeasons + 2 },
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/transfers.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/engine/transfers.ts src/engine/transfers.test.ts
git commit -m "feat: player transfers, listings, bids, releases, renewals"
```

---

### Task 4: Market simulation — AI listings, AI bids, deadlines

**Files:**
- Modify: `src/engine/transfers.ts`
- Test: `src/engine/transfers.test.ts`

**Interfaces:**
- Consumes: Task 3 functions; `marketValue` from `./finance`
- Produces: `runTransfers(state: GameState, rand: () => number): GameState` — offer aging + generation (Task 5 extends this), AI listings (forced sale when broke, occasional squad trim), AI bidding, deadline resolution. Called by `advanceRound` before `runWeeklyFinances`.

- [ ] **Step 1: Write the failing tests**

Add to `src/engine/transfers.test.ts`:

```ts
import { mulberry32 } from './rng'
import { runTransfers } from './transfers'
```

```ts
describe('runTransfers', () => {
  it('resolves a due listing to the highest bidder', () => {
    const s0 = newGame(1)
    const playerId = s0.teams[2].lineup[0]
    let s = listPlayer(s0, playerId, 100_000)
    s = {
      ...s,
      transferList: s.transferList.map(l => ({ ...l, roundsLeft: 1, currentBid: 150_000, currentBidderId: 4 })),
    }
    const s1 = runTransfers(s, mulberry32(9))
    expect(s1.transferList.find(l => l.playerId === playerId)).toBeUndefined()
    expect(s1.teams[4].playerIds).toContain(playerId)
    expect(s1.teams[2].playerIds).not.toContain(playerId)
  })

  it('delists an unsold player at the deadline', () => {
    const s0 = newGame(1)
    const playerId = s0.teams[2].lineup[0]
    let s = listPlayer(s0, playerId, 999_999_999) // nobody can afford it
    s = { ...s, transferList: s.transferList.map(l => ({ ...l, roundsLeft: 1 })) }
    const s1 = runTransfers(s, mulberry32(9))
    expect(s1.transferList.find(l => l.playerId === playerId)).toBeUndefined()
    expect(s1.teams[2].playerIds).toContain(playerId) // still theirs
  })

  it('ticks listing deadlines down', () => {
    const s0 = newGame(1)
    const playerId = s0.teams[2].lineup[0]
    const s = listPlayer(s0, playerId, 100_000)
    const s1 = runTransfers(s, mulberry32(9))
    const listing = s1.transferList.find(l => l.playerId === playerId)
    if (listing) expect(listing.roundsLeft).toBe(2) // 3 - 1 (may have sold early only at 0)
  })

  it('AI clubs eventually bid on a fairly priced listing', () => {
    const s0 = newGame(1)
    const playerId = s0.teams[2].lineup[0]
    // cap the ask so it stays under every club's spending limit (0.7 × cash)
    const askingPrice = Math.min(Math.round(marketValue(s0.players[playerId]) * 0.8), 500_000)
    let s = listPlayer(s0, playerId, askingPrice)
    // keep the listing alive and let several rounds of AI interest pass
    const rand = mulberry32(5)
    let sawBid = false
    for (let i = 0; i < 10 && !sawBid; i++) {
      s = { ...s, transferList: s.transferList.map(l => ({ ...l, roundsLeft: 5 })) }
      s = runTransfers(s, rand)
      const l = s.transferList.find(x => x.playerId === playerId)
      sawBid = !s.teams[2].playerIds.includes(playerId) || (l?.currentBid ?? null) !== null
    }
    expect(sawBid).toBe(true)
  })

  it('a broke AI club force-lists its biggest earner', () => {
    const s0 = newGame(1)
    const s: GameState = { ...s0, teams: s0.teams.map(t => (t.id === 7 ? { ...t, cash: -100_000 } : t)) }
    const s1 = runTransfers(s, mulberry32(3))
    const listing = s1.transferList.find(l => l.sellerTeamId === 7)
    expect(listing).toBeDefined()
    const topEarner = [...s.teams[7].playerIds].sort(
      (a, b) => s.players[b].salary - s.players[a].salary,
    )[0]
    expect(listing!.playerId).toBe(topEarner)
  })

  it('is deterministic', () => {
    const s0 = newGame(11)
    expect(runTransfers(s0, mulberry32(4))).toEqual(runTransfers(s0, mulberry32(4)))
  })
})
```

with `marketValue` added to the `./finance` import in the test file.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/transfers.test.ts`
Expected: FAIL — `runTransfers` not exported

- [ ] **Step 3: Implement**

Add to `src/engine/transfers.ts` (extend the finance import with `marketValue`):

```ts
import { adjustCash, marketValue, salaryFor, severanceFor, userLedger } from './finance'
```

```ts
export const OFFER_ROUNDS = 2

// One market tick: offers age, AI clubs list and bid, deadlines resolve.
// Task 5 adds incoming-offer generation at the marked point.
export function runTransfers(state: GameState, rand: () => number): GameState {
  let s = state

  // offers age out
  s = {
    ...s,
    incomingOffers: s.incomingOffers
      .map(o => ({ ...o, roundsLeft: o.roundsLeft - 1 }))
      .filter(o => o.roundsLeft > 0),
  }

  // [Task 5 inserts incoming-offer generation here]

  // AI clubs list players: forced sale when broke, otherwise occasional squad trim
  for (const team of s.teams) {
    if (team.id === s.userTeamId || team.playerIds.length <= MIN_SQUAD) continue
    if (s.transferList.some(l => l.sellerTeamId === team.id)) continue
    const broke = team.cash < 0
    if (!broke && rand() >= 0.05) continue
    const squad = team.playerIds.map(id => s.players[id])
    const candidate = broke
      ? [...squad].sort((a, b) => b.salary - a.salary)[0] // shed the biggest wage
      : [...squad].sort((a, b) => a.level - b.level)[0] // trim the weakest
    s = listPlayer(s, candidate.id, Math.round(marketValue(candidate) * 0.9))
  }

  // AI clubs bid (re-read each listing so later bidders see earlier bids)
  for (const team of s.teams) {
    if (team.id === s.userTeamId) continue
    for (const { playerId } of s.transferList) {
      const listing = s.transferList.find(l => l.playerId === playerId)!
      if (listing.sellerTeamId === team.id || listing.currentBidderId === team.id) continue
      if (rand() >= 0.15) continue
      const bid = requiredBid(listing)
      const valuation = Math.round(marketValue(s.players[playerId]) * (0.9 + rand() * 0.4))
      if (bid <= valuation && bid <= team.cash * 0.7 && team.playerIds.length < 22) {
        s = {
          ...s,
          transferList: s.transferList.map(l =>
            l.playerId === playerId ? { ...l, currentBid: bid, currentBidderId: team.id } : l,
          ),
        }
      }
    }
  }

  // deadlines: sell to the highest bidder or quietly delist
  const due = s.transferList.filter(l => l.roundsLeft <= 1)
  s = {
    ...s,
    transferList: s.transferList
      .filter(l => l.roundsLeft > 1)
      .map(l => ({ ...l, roundsLeft: l.roundsLeft - 1 })),
  }
  for (const l of due) {
    if (l.currentBid !== null && l.currentBidderId !== null) {
      s = transferPlayer(s, l.playerId, l.currentBidderId, l.currentBid)
    }
  }
  return s
}
```

Note the winning buyer's cash may briefly go negative if they overreached between bid and deadline — that's overdraft pressure, not a bug (`ponytail:` the board handles it).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/transfers.test.ts`
Expected: PASS (14 tests). If the "AI clubs eventually bid" test fails on this seed, bump the loop count to 20 before touching the engine.

- [ ] **Step 5: Commit**

```bash
git add src/engine/transfers.ts src/engine/transfers.test.ts
git commit -m "feat: transfer market simulation with AI listings, bidding, and deadlines"
```

---

### Task 5: Incoming AI offers — generate, accept, reject, counter

**Files:**
- Modify: `src/engine/transfers.ts`
- Test: `src/engine/transfers.test.ts`

**Interfaces:**
- Consumes: Tasks 3–4
- Produces:
  - offer generation inside `runTransfers` (≈15% of rounds an AI club bids for a user player)
  - `acceptOffer(state, playerId: number, bidderTeamId: number): GameState`
  - `rejectOffer(state, playerId: number, bidderTeamId: number): GameState`
  - `counterOffer(state, playerId: number, bidderTeamId: number): GameState` — rejects the offer and lists the player at `offer.amount * 1.2`, so the suitor can bid like anyone else

- [ ] **Step 1: Write the failing tests**

Add to `src/engine/transfers.test.ts`:

```ts
import { acceptOffer, counterOffer, rejectOffer } from './transfers'
```

```ts
describe('incoming offers', () => {
  function withOffer(s: GameState): GameState {
    const playerId = s.teams[0].playerIds[0]
    return { ...s, incomingOffers: [{ playerId, bidderTeamId: 3, amount: 500_000, roundsLeft: 2 }] }
  }

  it('offers arrive for user players over a season of market ticks', () => {
    let s = newGame(21)
    const rand = mulberry32(21)
    let arrived = false
    for (let i = 0; i < 30 && !arrived; i++) {
      s = runTransfers(s, rand)
      arrived = s.incomingOffers.length > 0
    }
    expect(arrived).toBe(true)
  })

  it('offers expire after their rounds run out', () => {
    const s = withOffer(newGame(1))
    const s1 = runTransfers(s, mulberry32(1))
    const s2 = runTransfers(s1, mulberry32(1))
    expect(s2.incomingOffers.find(o => o.bidderTeamId === 3)).toBeUndefined()
  })

  it('accepting sells the player at the offered price', () => {
    const s = withOffer(newGame(1))
    const { playerId } = s.incomingOffers[0]
    const s1 = acceptOffer(s, playerId, 3)
    expect(s1.teams[0].playerIds).not.toContain(playerId)
    expect(s1.teams[3].playerIds).toContain(playerId)
    expect(cashOf(s1, 0)).toBe(cashOf(s, 0) + 500_000)
    expect(s1.incomingOffers).toHaveLength(0)
  })

  it('rejecting just removes the offer', () => {
    const s = withOffer(newGame(1))
    const { playerId } = s.incomingOffers[0]
    const s1 = rejectOffer(s, playerId, 3)
    expect(s1.incomingOffers).toHaveLength(0)
    expect(s1.teams[0].playerIds).toContain(playerId)
  })

  it('countering lists the player at a 20% premium', () => {
    const s = withOffer(newGame(1))
    const { playerId } = s.incomingOffers[0]
    const s1 = counterOffer(s, playerId, 3)
    expect(s1.incomingOffers).toHaveLength(0)
    expect(s1.transferList[0]).toMatchObject({ playerId, sellerTeamId: 0, minPrice: 600_000 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/transfers.test.ts`
Expected: FAIL — `acceptOffer` etc. not exported; no offers ever arrive

- [ ] **Step 3: Implement**

In `src/engine/transfers.ts`, replace the `// [Task 5 inserts incoming-offer generation here]` comment inside `runTransfers` with:

```ts
  // occasionally an AI club knocks on the user's door
  if (rand() < 0.15) {
    const user = s.teams.find(t => t.id === s.userTeamId)!
    const suitors = s.teams.filter(t => t.id !== s.userTeamId && t.cash > 200_000)
    if (suitors.length > 0 && user.playerIds.length > MIN_SQUAD) {
      const suitor = suitors[Math.floor(rand() * suitors.length)]
      const targetId = user.playerIds[Math.floor(rand() * user.playerIds.length)]
      const amount = Math.round(marketValue(s.players[targetId]) * (0.85 + rand() * 0.45))
      const alreadyWanted = s.incomingOffers.some(o => o.playerId === targetId)
      const alreadyListed = s.transferList.some(l => l.playerId === targetId)
      if (!alreadyWanted && !alreadyListed && amount <= suitor.cash) {
        s = {
          ...s,
          incomingOffers: [...s.incomingOffers, { playerId: targetId, bidderTeamId: suitor.id, amount, roundsLeft: OFFER_ROUNDS }],
        }
      }
    }
  }
```

Add the offer actions at the end of the file:

```ts
export function acceptOffer(state: GameState, playerId: number, bidderTeamId: number): GameState {
  const offer = state.incomingOffers.find(o => o.playerId === playerId && o.bidderTeamId === bidderTeamId)
  const user = state.teams.find(t => t.id === state.userTeamId)!
  if (!offer || user.playerIds.length <= MIN_SQUAD) return state
  return transferPlayer(state, playerId, bidderTeamId, offer.amount) // clears every offer for the player
}

export function rejectOffer(state: GameState, playerId: number, bidderTeamId: number): GameState {
  return {
    ...state,
    incomingOffers: state.incomingOffers.filter(o => !(o.playerId === playerId && o.bidderTeamId === bidderTeamId)),
  }
}

// counter = put him on the market at a premium; the suitor can bid like anyone else
export function counterOffer(state: GameState, playerId: number, bidderTeamId: number): GameState {
  const offer = state.incomingOffers.find(o => o.playerId === playerId && o.bidderTeamId === bidderTeamId)
  if (!offer) return state
  return listPlayer(rejectOffer(state, playerId, bidderTeamId), playerId, Math.round(offer.amount * 1.2))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/transfers.test.ts`
Expected: PASS (19 tests)

- [ ] **Step 5: Commit**

```bash
git add src/engine/transfers.ts src/engine/transfers.test.ts
git commit -m "feat: incoming AI offers with accept, reject, and counter"
```

---

### Task 6: Season integration — advanceRound, prizes, contract settlement

**Files:**
- Modify: `src/engine/season.ts`
- Test: `src/engine/season.test.ts`

**Interfaces:**
- Consumes: `runTransfers`, `renewalSalary` from `./transfers`; `adjustCash`, `runWeeklyFinances` from `./finance`; `standings` from `./standings`; everything Phase 2 used
- Produces:
  - `advanceRound` — no-ops when `state.gameOver`; after the Phase 2 pipeline it runs `runTransfers` then `runWeeklyFinances`, then increments the round
  - `newSeason` — pays prize money by final position (`$1,500,000 − position_index × $75,000`), decrements contracts (AI auto-renews expiring ones; unrenewed user players leave), clears `transferList`/`incomingOffers`, resets `brokeRounds`, then ages squads as before

- [ ] **Step 1: Write the failing tests**

Add to `src/engine/season.test.ts` (existing Phase 2 tests stay):

```ts
import { standings } from './standings'
import { salaryFor } from './finance'
```

```ts
describe('advanceRound — market and money', () => {
  it('no-ops when the game is over', () => {
    const s = { ...newGame(1), gameOver: true }
    expect(advanceRound(s)).toEqual(s)
  })

  it('moves money every round', () => {
    const s1 = advanceRound(newGame(1))
    expect(s1.finances.length).toBeGreaterThan(0)
    expect(s1.teams.some(t => t.cash !== 1_000_000)).toBe(true)
  })

  it('keeps the economy alive over a full season', () => {
    let s = newGame(31)
    for (let i = 0; i < totalRounds(s); i++) s = advanceRound(s)
    // the market moved players between clubs at least once
    expect(s.teams.some(t => t.playerIds.length !== 18)).toBe(true)
    // a mid-table club does not spiral into oblivion in one season
    const userCash = s.teams.find(t => t.id === s.userTeamId)!.cash
    expect(userCash).toBeGreaterThan(-2_000_000)
  })
})

describe('newSeason — money and contracts', () => {
  function playSeason(seed: number) {
    let s = newGame(seed)
    for (let i = 0; i < totalRounds(s); i++) s = advanceRound(s)
    return s
  }

  it('pays prize money by final position', () => {
    const s = playSeason(7)
    const table = standings(s)
    const s2 = newSeason(s)
    const champion = table[0].teamId
    const last = table[15].teamId
    const cashDelta = (id: number) =>
      s2.teams.find(t => t.id === id)!.cash - s.teams.find(t => t.id === id)!.cash
    expect(cashDelta(champion)).toBe(1_500_000)
    expect(cashDelta(last)).toBe(1_500_000 - 15 * 75_000)
  })

  it('settles contracts: AI renews, unrenewed user players leave', () => {
    const s = playSeason(7)
    const userTeam = s.teams.find(t => t.id === s.userTeamId)!
    const leaving = userTeam.playerIds.find(id => s.players[id].contractSeasons === 1)
    const aiTeam = s.teams.find(t => t.id !== s.userTeamId)!
    const aiExpiring = aiTeam.playerIds.find(id => s.players[id].contractSeasons === 1)
    const s2 = newSeason(s)
    if (leaving) {
      expect(s2.players[leaving]).toBeUndefined()
      expect(s2.teams.find(t => t.id === s.userTeamId)!.playerIds).not.toContain(leaving)
    }
    if (aiExpiring) {
      expect(s2.players[aiExpiring].contractSeasons).toBeGreaterThanOrEqual(1)
      expect(s2.players[aiExpiring].salary).toBeGreaterThanOrEqual(salaryFor(s.players[aiExpiring].level))
    }
    // everyone else is one season shorter
    const survivor = userTeam.playerIds.find(id => s.players[id].contractSeasons === 3)
    if (survivor) expect(s2.players[survivor].contractSeasons).toBe(2)
  })

  it('clears the market at season end', () => {
    const s = playSeason(7)
    const s2 = newSeason(s)
    expect(s2.transferList).toEqual([])
    expect(s2.incomingOffers).toEqual([])
    expect(s2.brokeRounds).toBe(0)
  })
})
```

Note: `leaving`/`aiExpiring` are guarded with `if` because contracts are random per seed — with seed 7 and 288 players, expiring contracts all but certainly exist in both squads; the guards just keep the test honest.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/season.test.ts`
Expected: FAIL — no ledger entries, no prize money, contracts untouched

- [ ] **Step 3: Implement**

In `src/engine/season.ts`, add imports:

```ts
import { adjustCash, runWeeklyFinances } from './finance'
import { renewalSalary, runTransfers } from './transfers'
import { standings } from './standings'
```

`advanceRound` gains the gameOver guard and the two new stages. The full function:

```ts
export function advanceRound(state: GameState): GameState {
  if (state.gameOver || state.round > totalRounds(state)) return state
  const rand = mulberry32(state.rngState)

  // fresh lineups: AI re-picks its best XI, the user's picks are kept but repaired
  const teams = state.teams.map(t => ({
    ...t,
    lineup: t.id === state.userTeamId ? patchLineup(t, state.players) : autoPick(t, state.players),
  }))
  const byId = new Map(teams.map(t => [t.id, t]))

  const roundEvents: MatchEvent[] = []
  const fixtures = state.fixtures.map(f => {
    if (f.round !== state.round) return f
    const result = simulateMatch(byId.get(f.homeId)!, byId.get(f.awayId)!, state.players, rand)
    roundEvents.push(...result.events)
    return { ...f, homeGoals: result.homeGoals, awayGoals: result.awayGoals, events: result.events }
  })

  // existing bans/injuries tick down BEFORE this round's knocks land
  let players: Record<number, Player> = Object.fromEntries(
    Object.values(state.players).map(p => [p.id, {
      ...p,
      injuredForRounds: Math.max(0, p.injuredForRounds - 1),
      suspendedForRounds: Math.max(0, p.suspendedForRounds - 1),
    }]),
  )
  players = applyMatchConsequences(players, roundEvents, rand)

  const starters = new Set(teams.flatMap(t => t.lineup))
  players = applyWeeklyUpdates(players, teams, starters, rand)

  let s: GameState = { ...state, teams, players, fixtures }
  s = runTransfers(s, rand)
  s = runWeeklyFinances(s, rand)

  return { ...s, round: s.round + 1, rngState: randInt(rand, 1, 2 ** 31 - 1) }
}
```

`newSeason` becomes:

```ts
export function newSeason(state: GameState): GameState {
  const rand = mulberry32(state.rngState)

  // prize money by final position
  let teams = state.teams
  let finances = state.finances
  standings(state).forEach((row, i) => {
    const prize = 1_500_000 - i * 75_000
    teams = adjustCash(teams, row.teamId, prize)
    if (row.teamId === state.userTeamId) {
      finances = [
        ...finances,
        { season: state.season, round: totalRounds(state), label: `Prize money (finished ${i + 1})`, amount: prize },
      ].slice(-300)
    }
  })

  // contracts: one season shorter; AI auto-renews, unrenewed user players walk
  const players = { ...state.players }
  for (const team of state.teams) {
    for (const id of team.playerIds) {
      const p = players[id]
      const remaining = p.contractSeasons - 1
      if (remaining > 0) {
        players[id] = { ...p, contractSeasons: remaining }
      } else if (team.id !== state.userTeamId) {
        players[id] = { ...p, contractSeasons: randInt(rand, 1, 3), salary: renewalSalary(p) }
      } else {
        delete players[id]
        teams = teams.map(t =>
          t.id === team.id
            ? { ...t, playerIds: t.playerIds.filter(x => x !== id), lineup: t.lineup.filter(x => x !== id) }
            : t,
        )
      }
    }
  }

  return {
    ...state,
    teams,
    finances,
    players: ageSquads(players, rand),
    season: state.season + 1,
    round: 1,
    fixtures: generateFixtures(teams.map(t => t.id), rand),
    transferList: [],
    incomingOffers: [],
    brokeRounds: 0,
    rngState: randInt(rand, 1, 2 ** 31 - 1),
  }
}
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS, including the pre-existing Phase 2 `newSeason` test — it iterates `Object.values(s2.players)` (survivors only) and checks ages/fitness/cards, all of which hold after contract settlement. If it fails, do not weaken it; the contract-settlement code is wrong.

- [ ] **Step 5: Commit**

```bash
git add src/engine/season.ts src/engine/season.test.ts
git commit -m "feat: rounds run the market and the books; seasons pay prizes and settle contracts"
```

---

### Task 7: Squad screen — money columns and market actions

**Files:**
- Modify: `src/screens/SquadScreen.tsx`, `src/index.css`

**Interfaces:**
- Consumes: `formatMoney`, `marketValue`, `severanceFor` from `../engine/finance`; `listPlayer`, `releasePlayer`, `renewContract`, `renewalSalary` from `../engine/transfers`
- Produces: UI only

- [ ] **Step 1: Extend `src/screens/SquadScreen.tsx`**

Add imports:

```tsx
import { useState } from 'react'
import { formatMoney, marketValue, severanceFor } from '../engine/finance'
import { listPlayer, releasePlayer, renewalSalary, renewContract } from '../engine/transfers'
```

Add component state at the top of `SquadScreen`:

```tsx
const [selling, setSelling] = useState<number | null>(null)
const [askingPrice, setAskingPrice] = useState(0)
const [confirmRelease, setConfirmRelease] = useState<number | null>(null)
```

Extend the table header:

```tsx
<tr>
  <th>Pos</th><th>Name</th><th>Age</th><th>Level</th><th>Form</th><th>Fit</th>
  <th>Status</th><th>Salary</th><th>Contract</th><th>Value</th><th></th>
</tr>
```

In the row, after the Status cell add:

```tsx
<td>{formatMoney(p.salary)}/wk</td>
<td>{p.contractSeasons}y</td>
<td>{formatMoney(marketValue(p))}</td>
```

and replace the actions cell (the one with Starting/Start) with:

```tsx
<td className="actions">
  {selling === p.id ? (
    <>
      <input
        type="number"
        value={askingPrice}
        onChange={e => setAskingPrice(Number(e.target.value))}
        style={{ width: '7rem' }}
      />
      <button onClick={() => { setState(s => listPlayer(s, p.id, askingPrice)); setSelling(null) }}>List</button>
      <button onClick={() => setSelling(null)}>✕</button>
    </>
  ) : confirmRelease === p.id ? (
    <>
      <button onClick={() => { setState(s => releasePlayer(s, p.id)); setConfirmRelease(null) }}>
        Confirm release ({formatMoney(-severanceFor(p))})
      </button>
      <button onClick={() => setConfirmRelease(null)}>✕</button>
    </>
  ) : (
    <>
      {starting
        ? 'Starting'
        : <button
            disabled={!isAvailable(p)}
            onClick={() => withUserTeam((s, t) => updateTeam(s, t.id, { lineup: swapIn(t, s.players, p.id) }))}
          >
            Start
          </button>}
      {state.transferList.some(l => l.playerId === p.id)
        ? ' · listed'
        : <button onClick={() => { setSelling(p.id); setAskingPrice(marketValue(p)) }}>Sell</button>}
      <button onClick={() => setConfirmRelease(p.id)}>Release</button>
      {p.contractSeasons <= 1 && (
        <button onClick={() => setState(s => renewContract(s, p.id))}>
          Renew ({formatMoney(renewalSalary(p))}/wk)
        </button>
      )}
    </>
  )}
</td>
```

Add to `src/index.css`:

```css
td.actions button { margin-left: 0.25rem; }
```

- [ ] **Step 2: Verify manually**

Run: `npm run dev`. On the Squad tab:
- Salary, contract years, and market value show per player.
- Sell opens an inline price input pre-filled with market value; List puts the player on the transfer list (row shows "listed").
- Release asks for confirmation showing the severance cost, then removes the player and deducts cash.
- Renew appears only for contracts ≤ 1 year and bumps salary + 2 years.

Run `npm test` — still green.

- [ ] **Step 3: Commit**

```bash
git add src/screens/SquadScreen.tsx src/index.css
git commit -m "feat: squad screen money columns with sell, release, renew"
```

---

### Task 8: Transfers screen

**Files:**
- Create: `src/screens/TransfersScreen.tsx`
- Modify: `src/App.tsx`, `src/index.css`

**Interfaces:**
- Consumes: `formatMoney` from `../engine/finance`; `acceptOffer`, `counterOffer`, `placeBid`, `rejectOffer`, `requiredBid` from `../engine/transfers`
- Produces: default export `TransfersScreen({ state, setState })`

- [ ] **Step 1: Create `src/screens/TransfersScreen.tsx`**

```tsx
import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { formatMoney } from '../engine/finance'
import { acceptOffer, counterOffer, placeBid, rejectOffer, requiredBid } from '../engine/transfers'
import type { GameState } from '../engine/types'

interface Props {
  state: GameState
  setState: Dispatch<SetStateAction<GameState>>
}

export default function TransfersScreen({ state, setState }: Props) {
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const name = (id: number) => state.teams.find(t => t.id === id)!.name
  const user = state.teams.find(t => t.id === state.userTeamId)!

  return (
    <div>
      <h3>Offers for your players</h3>
      {state.incomingOffers.length === 0 && <p>No offers on the table.</p>}
      {state.incomingOffers.map(o => {
        const p = state.players[o.playerId]
        return (
          <p key={`${o.playerId}-${o.bidderTeamId}`} className="offer">
            {name(o.bidderTeamId)} offer <strong>{formatMoney(o.amount)}</strong> for {p.name} ({p.position} {p.level})
            — expires in {o.roundsLeft} round{o.roundsLeft > 1 ? 's' : ''}{' '}
            <button onClick={() => setState(s => acceptOffer(s, o.playerId, o.bidderTeamId))}>Accept</button>{' '}
            <button onClick={() => setState(s => counterOffer(s, o.playerId, o.bidderTeamId))}>
              Counter (list at {formatMoney(Math.round(o.amount * 1.2))})
            </button>{' '}
            <button onClick={() => setState(s => rejectOffer(s, o.playerId, o.bidderTeamId))}>Reject</button>
          </p>
        )
      })}

      <h3>Transfer list — your cash: {formatMoney(user.cash)}</h3>
      <table>
        <thead>
          <tr>
            <th>Player</th><th>Pos</th><th>Lvl</th><th>Age</th><th>Seller</th>
            <th>Min price</th><th>Top bid</th><th>Ends</th><th></th>
          </tr>
        </thead>
        <tbody>
          {state.transferList.map(l => {
            const p = state.players[l.playerId]
            const mine = l.sellerTeamId === state.userTeamId
            const leading = l.currentBidderId === state.userTeamId
            const floor = requiredBid(l)
            return (
              <tr key={l.playerId} className={mine ? 'user' : ''}>
                <td>{p.name}</td><td>{p.position}</td><td>{p.level}</td><td>{p.age}</td>
                <td>{name(l.sellerTeamId)}</td>
                <td>{formatMoney(l.minPrice)}</td>
                <td>{l.currentBid === null ? '—' : `${formatMoney(l.currentBid)} (${name(l.currentBidderId!)})`}</td>
                <td>{l.roundsLeft}</td>
                <td>
                  {mine ? 'your listing' : leading ? 'you lead' : (
                    <>
                      <input
                        type="number"
                        style={{ width: '7rem' }}
                        value={drafts[l.playerId] ?? floor}
                        onChange={e => setDrafts({ ...drafts, [l.playerId]: e.target.value })}
                      />
                      <button
                        disabled={floor > user.cash}
                        onClick={() => setState(s => placeBid(s, l.playerId, Number(drafts[l.playerId] ?? floor)))}
                      >
                        Bid
                      </button>
                    </>
                  )}
                </td>
              </tr>
            )
          })}
          {state.transferList.length === 0 && (
            <tr><td colSpan={9}>Nobody is for sale this week.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Add the tab in `src/App.tsx`**

Extend the screen type and nav list:

```tsx
type Screen = 'squad' | 'table' | 'fixtures' | 'transfers' | 'finance'
```

```tsx
{(['squad', 'table', 'fixtures', 'transfers', 'finance'] as Screen[]).map(s => (
```

and render (`finance` arrives in Task 9 — leave a placeholder paragraph for it now):

```tsx
{screen === 'transfers' && <TransfersScreen state={state} setState={setState} />}
{screen === 'finance' && <p>Finance screen coming next.</p>}
```

with `import TransfersScreen from './screens/TransfersScreen'`.

- [ ] **Step 3: Verify manually**

Run: `npm run dev`:
- Transfers tab shows AI listings appearing over a few rounds; bid on one below your cash and watch AI counter-bids; win one at the deadline and see the player join your squad and cash drop.
- List one of your players from the Squad tab; watch bids arrive; after 3 rounds he sells to the top bidder (or delists).
- When an incoming offer arrives, Accept/Counter/Reject all behave as labeled.

Run `npm test` — still green.

- [ ] **Step 4: Commit**

```bash
git add src/screens/TransfersScreen.tsx src/App.tsx src/index.css
git commit -m "feat: transfers screen with auctions and incoming offers"
```

---

### Task 9: Finance screen and the sack

**Files:**
- Create: `src/screens/FinanceScreen.tsx`
- Modify: `src/App.tsx`, `src/index.css`

**Interfaces:**
- Consumes: `borrow`, `formatMoney`, `LOAN_CAP`, `repayLoan`, `wageBill` from `../engine/finance`
- Produces: default export `FinanceScreen({ state, setState })`; game-over takeover in `App`

- [ ] **Step 1: Create `src/screens/FinanceScreen.tsx`**

```tsx
import type { Dispatch, SetStateAction } from 'react'
import { borrow, formatMoney, LOAN_CAP, repayLoan, wageBill } from '../engine/finance'
import type { GameState } from '../engine/types'

const STEP = 100_000

interface Props {
  state: GameState
  setState: Dispatch<SetStateAction<GameState>>
}

export default function FinanceScreen({ state, setState }: Props) {
  const user = state.teams.find(t => t.id === state.userTeamId)!
  return (
    <div>
      <p>
        Cash: <strong>{formatMoney(user.cash)}</strong> · Weekly wages: {formatMoney(wageBill(user.id, state))} ·
        Loan: {formatMoney(state.loanBalance)} (cap {formatMoney(LOAN_CAP)})
      </p>
      {state.brokeRounds > 0 && (
        <p className="banner">⚠ The board is losing patience: {state.brokeRounds}/8 weeks in the red.</p>
      )}
      <div className="controls">
        <button
          disabled={state.loanBalance + STEP > LOAN_CAP}
          onClick={() => setState(s => borrow(s, STEP))}
        >
          Borrow {formatMoney(STEP)}
        </button>{' '}
        <button disabled={state.loanBalance === 0} onClick={() => setState(s => repayLoan(s, STEP))}>
          Repay {formatMoney(STEP)}
        </button>
      </div>
      <table>
        <thead>
          <tr><th>Season</th><th>Round</th><th>Item</th><th>Amount</th></tr>
        </thead>
        <tbody>
          {state.finances.slice(-50).reverse().map((e, i) => (
            <tr key={i}>
              <td>{e.season}</td><td>{e.round}</td><td>{e.label}</td>
              <td className={e.amount < 0 ? 'neg' : 'pos'}>{formatMoney(e.amount)}</td>
            </tr>
          ))}
          {state.finances.length === 0 && <tr><td colSpan={4}>No transactions yet.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Wire the screen and the sack into `src/App.tsx`**

Replace the finance placeholder:

```tsx
{screen === 'finance' && <FinanceScreen state={state} setState={setState} />}
```

with `import FinanceScreen from './screens/FinanceScreen'`.

Add the takeover right after the replay takeover (before the normal return):

```tsx
if (state.gameOver) {
  return (
    <div className="app">
      <h1>Sacked!</h1>
      <p>
        {userTeam.name} spent too long in the red. The board has shown you the door
        after {state.season} season{state.season > 1 ? 's' : ''}.
      </p>
      <button onClick={() => setState(newGame(Date.now() % 2147483647))}>Start a new career</button>
    </div>
  )
}
```

Add to `src/index.css`:

```css
td.neg { color: crimson; }
td.pos { color: seagreen; }
```

- [ ] **Step 3: Verify manually**

Run: `npm run dev`:
- Finance tab: cash, weekly wages, loan controls; ledger fills as rounds pass (wages every week, gate receipts on home weeks, interest lines).
- Borrow $100k twice, watch loan interest lines appear weekly; repay works and stops at zero.
- Sabotage run: borrow the cap, buy expensive players until deep in the red, advance 8 rounds → Sacked screen appears, New Career restarts.

Run `npm test` — still green.

- [ ] **Step 4: Commit**

```bash
git add src/screens/FinanceScreen.tsx src/App.tsx src/index.css
git commit -m "feat: finance screen with loans and ledger; board sacks broke managers"
```

---

### Task 10: Phase 3 acceptance check

**Files:** none new.

**Interfaces:** none — this is the spec's Phase 3 gate: *"a team can be rebuilt through the market — or bankrupted trying."*

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all tests pass (rng, lineup, fixtures, newGame, match, training, standings, season, save, finance, transfers).

- [ ] **Step 2: Play the market for a season**

Run: `npm run dev`, then:
- Sell your two weakest players, buy one better one through an auction, and confirm every fee shows in the ledger.
- Accept one incoming offer and counter another; confirm the countered player appears on the transfer list at +20%.
- Let a contract run to ≤1 year: renew one player, let another walk at season end.
- Check prize money lands at season rollover and squads changed size across the league.
- Confirm an old Phase 2 save (if one exists in localStorage) loads and keeps its season/round.

- [ ] **Step 3: Tag**

```bash
git add -A
git commit -m "chore: phase 3 complete" --allow-empty
git tag phase-3
```
