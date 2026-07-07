# Futscript Phase 4 — The Long Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The world grows into a career: 3 divisions with promotion/relegation, a national knockout cup woven into the calendar, friendlies on free weeks, youth intake, retirement, a top-scorer award, and a persistent history/trophy room — so a 10-season climb from Division 3 to the title makes sense.

**Architecture:** The engine stays pure TypeScript over one serializable `GameState` (now `version: 4`, migrations chained v1→v4). The season calendar becomes 36 weeks: 30 league rounds interleaved with 6 fixed cup weeks; `advanceRound` simulates whatever is scheduled in the current week (league fixtures, cup ties, an optional user friendly) and only participants drain fitness. Season rollover moves to a new `rollover.ts` (promotion/relegation, prizes, retirement, youth, world expansion for migrated saves) with `newSeason` composing it. Divisions are a `Team.division` field; **the user remains `teams[0]`, which is now a Division 3 club** (divisions are assigned 3, 2, 1 in generation order) — this keeps every existing test's `teams[0]`-is-the-user assumption intact.

**Tech Stack:** Existing Vite + React + TypeScript (strict) + Vitest. No new dependencies.

## Prerequisite

Phase 3 merged (tag `phase-3`, 94/94 tests green on main). This plan also absorbs these deferred Phase-3 review items: attendance hard-codes league size (fixed by per-division standings), season-end walk-outs can drop the user below the squad floor (fixed by force-renewal to `MIN_SQUAD` + a UI warning), and `newSeason` lacks a `gameOver` guard (added).

## Global Constraints

- Local-only: no network calls, no backend. Persistence is localStorage.
- `src/engine/` must not import React or touch the DOM (exception: `save.ts` defaults `storage: Storage = localStorage`).
- All state changes are pure functions returning a new `GameState`; user actions return the input state unchanged when invalid.
- Randomness only via the seeded RNG threaded through `rngState`; no `Math.random()`. No `Date.now()` in the engine.
- Save schema becomes `version: 4`; `load()` migrates v1/v2/v3 saves. A migrated (16-team) world stays as Division 1 until the next season rollover, when the missing divisions are generated (`ensureThreeDivisions`).
- Money is integer dollars (`Math.round`).
- World: 3 divisions × 16 teams. Generation order gives ids 0–15 to **Division 3** (user = `teams[0]`), 16–31 to Division 2, 32–47 to Division 1. Level ranges at generation: Division 1 45–75, Division 2 38–68, Division 3 30–60.
- Calendar: `CUP_WEEKS = [4, 9, 14, 19, 24, 29]`; league rounds occupy the other 30 weeks; `totalRounds(state)` = the last scheduled week (36 for a fresh v4 world, 30 for a not-yet-expanded migrated one).
- Cup: round 1 = the 32 non-Division-1 clubs; Division 1 enters in round 2; single leg; a drawn tie is decided by a penalty-shootout coin flip. Winner $1,000,000, runner-up $400,000.
- `DIVISION_FACTOR = {1: 1, 2: 0.7, 3: 0.5}` scales gate receipts and league prize money (economy constants remain `ponytail:`-tunable in one place).
- Friendlies: user-only opt-in (`playFriendlies`), played on cup weeks the user isn't in the cup, vs a random idle club; **injury events count, cards and goals do not**; flat gate `(6000 ± 500) × TICKET_PRICE × division factor`.
- Retirement at rollover: age 34 → 35%, 35 → 65%, 36+ → 100%. Youth intake at rollover: squads < 16 players get 2 youths, < 20 get 1 (age 16–18, level 22–45, salary by formula, 3-season contract).
- The user's squad can never drop below `MIN_SQUAD` (14) at rollover: expiring contracts force-renew (cheapest first) until the floor holds.
- TypeScript strict; engine tests colocated `src/engine/*.test.ts`.

## File Structure

- `src/engine/types.ts` — `Team.division`, `Player.seasonGoals`, `CupFixture`, `SeasonRecord`, `GameState` v4 fields
- `src/engine/names.ts` — `TEAM_NAMES` grows to 48
- `src/engine/save.ts` — `migrateV3`
- `src/engine/fixtures.ts` — `CUP_WEEKS`, `LEAGUE_WEEKS`, `generateDivisionFixtures`
- `src/engine/standings.ts` — `standings(state, division = 1)`
- `src/engine/cup.ts` — NEW: draws, `cupWinner`
- `src/engine/newGame.ts` — 48-team world
- `src/engine/season.ts` — week-based `advanceRound` (league + cup + friendly), `applyMatchConsequences` goal tracking, `newSeason` composition
- `src/engine/finance.ts` — per-division gates, `DIVISION_FACTOR`
- `src/engine/rollover.ts` — NEW: promotion/relegation, prizes helpers live in season, retirement, youth, expansion, `seasonRecord`
- `src/engine/training.ts` — `ageSquads` resets `seasonGoals`
- `src/screens/*` — division awareness, Cup tab, History tab, friendlies toggle
- `src/App.tsx` — nav, banner, cup-aware replay

---

### Task 1: Types v4, 48 team names, save migration

**Files:**
- Modify: `src/engine/types.ts`, `src/engine/names.ts`, `src/engine/newGame.ts`, `src/engine/save.ts`
- Modify (helpers only): `src/engine/lineup.test.ts`, `src/engine/match.test.ts`, `src/engine/training.test.ts`, `src/engine/season.test.ts`, `src/engine/standings.test.ts`, `src/engine/finance.test.ts`
- Test: `src/engine/save.test.ts`

**Interfaces:**
- Produces (used by every later task):
  - `Player` gains `seasonGoals: number`
  - `Team` gains `division: number` (1–3)
  - `interface CupFixture { week: number; cupRound: number; homeId: number; awayId: number; homeGoals: number | null; awayGoals: number | null; winnerId: number | null; events?: MatchEvent[] }`
  - `interface SeasonRecord { season: number; champions: string[]; cupWinner: string; topScorer: { player: string; team: string; goals: number }; userDivision: number; userPosition: number }`
  - `GameState` gains `cupFixtures: CupFixture[]`, `history: SeasonRecord[]`, `playFriendlies: boolean`; `version: 4`
  - `TEAM_NAMES` has 48 entries
  - `load()` migrates v3 saves (all teams become division 1; empty cup/history)

- [ ] **Step 1: Write the failing migration test**

Add to `src/engine/save.test.ts` (update the two existing migration tests' expectations from `version 3` to `version 4`, and extend the v1 test's `toMatchObject` for the player with `seasonGoals: 0` and for the team with `division: 1`):

```ts
it('migrates a v3 save to v4', () => {
  const storage = fakeStorage()
  const v3 = {
    version: 3, seed: 1, rngState: 1, season: 2, round: 9, userTeamId: 0,
    players: { 1: {
      id: 1, name: 'P1', age: 25, position: 'GK', level: 50,
      form: 1, fitness: 80, injuredForRounds: 0, suspendedForRounds: 0, yellowCards: 1,
      salary: 6250, contractSeasons: 2,
    } },
    teams: [{ id: 0, name: 'T0', playerIds: [1], formation: '4-4-2', lineup: [1], tactic: 'normal', trainingStyle: 'normal', cash: 500_000 }],
    fixtures: [],
    transferList: [], incomingOffers: [], loanBalance: 100_000, brokeRounds: 2, gameOver: false, finances: [],
  }
  storage.setItem('futscript-save', JSON.stringify(v3))
  const state = load(storage)
  expect(state!.version).toBe(4)
  expect(state!.season).toBe(2) // progress preserved
  expect(state!.round).toBe(9)
  expect(state!.loanBalance).toBe(100_000)
  expect(state!.players[1].seasonGoals).toBe(0)
  expect(state!.teams[0].division).toBe(1) // migrated world lives in Division 1 until expansion
  expect(state!.cupFixtures).toEqual([])
  expect(state!.history).toEqual([])
  expect(state!.playFriendlies).toBe(false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/save.test.ts`
Expected: FAIL — v3 currently loads as-is (version 3 accepted) or rejects; either way the new assertions fail

- [ ] **Step 3: Extend the types**

In `src/engine/types.ts`: `Player` gains (after `contractSeasons`):

```ts
  seasonGoals: number // this season, league + cup (friendlies excluded)
```

`Team` gains (after `cash`):

```ts
  division: number // 1 (top) .. 3
```

Add after `Fixture`:

```ts
export interface CupFixture {
  week: number // calendar week the tie is played
  cupRound: number // 1..6; division 1 clubs enter in round 2
  homeId: number
  awayId: number
  homeGoals: number | null
  awayGoals: number | null
  winnerId: number | null // set when played; a drawn tie is decided on penalties
  events?: MatchEvent[]
}

export interface SeasonRecord {
  season: number
  champions: string[] // champion club name per division, index 0 = Division 1
  cupWinner: string // '—' when no cup ran (not-yet-expanded migrated world)
  topScorer: { player: string; team: string; goals: number }
  userDivision: number
  userPosition: number
}
```

`GameState.version` becomes `4` and it gains:

```ts
  cupFixtures: CupFixture[]
  history: SeasonRecord[] // one record per completed season
  playFriendlies: boolean // user setting: friendlies on free weeks
```

- [ ] **Step 4: Grow the name pool**

In `src/engine/names.ts` replace `TEAM_NAMES` with 48 entries (existing 16 first, then 32 new):

```ts
export const TEAM_NAMES = [
  'União FC', 'Real Bragança', 'Atlético do Vale', 'EC Litoral',
  'Nacional AC', 'Portuária FC', 'Ferroviário EC', 'Comercial FC',
  'Operário FC', 'Independência', 'Guarani do Norte', 'Estrela do Sul',
  'Marítimo FC', 'Alvorada EC', 'Cruzeiro do Oeste', 'Tupi da Serra',
  'Águia Dourada', 'Botafogo da Colina', 'Sereno FC', 'AA Cachoeira',
  'Primavera EC', 'Vila Rica FC', 'Horizonte AC', 'Pantanal EC',
  'Costa Azul FC', 'Mineração EC', 'Bandeirante FC', 'Sete Lagoas AC',
  'Fronteira EC', 'Palmares FC', 'Cabo Verde AC', 'Riacho Grande',
  'Imperial FC', 'Catarinense EC', 'Boa Vista AC', 'Diamante Negro',
  'São Rafael FC', 'Amazônia EC', 'Cerrado FC', 'Litorânea AC',
  'Vale Verde EC', 'Piratininga FC', 'Aurora do Leste', 'Granja Real',
  'Serra Azul FC', 'Baía Formosa', 'Rio Manso EC', 'Lagoa Dourada',
]
```

- [ ] **Step 5: Emit v4 fields from newGame (world still 16 teams — Task 3 expands it)**

In `src/engine/newGame.ts`: player literal gains `seasonGoals: 0`; team literal gains `division: 1`; returned state gains `cupFixtures: [], history: [], playFriendlies: false` and `version: 4`.

- [ ] **Step 6: Chain the migration in save.ts**

`load()` becomes:

```ts
export function load(storage: Storage = localStorage): GameState | null {
  const raw = storage.getItem(KEY)
  if (!raw) return null
  try {
    let state = JSON.parse(raw)
    if (state?.version === 1) state = migrateV1(state)
    if (state?.version === 2) state = migrateV2(state)
    if (state?.version === 3) state = migrateV3(state)
    return state?.version === 4 ? (state as GameState) : null
  } catch {
    return null
  }
}
```

Add (and change `migrateV2`'s return type annotation from `GameState` to `any` — it now produces an intermediate shape):

```ts
// Migrated worlds keep their 16 clubs as Division 1; the next season
// rollover generates Divisions 2 and 3 (ensureThreeDivisions).
function migrateV3(s: any): GameState {
  return {
    ...s,
    version: 4,
    players: Object.fromEntries(
      Object.values<any>(s.players).map(p => [p.id, { ...p, seasonGoals: 0 }]),
    ),
    teams: s.teams.map((t: any) => ({ ...t, division: 1 })),
    cupFixtures: [],
    history: [],
    playFriendlies: false,
  }
}
```

- [ ] **Step 7: Mechanically update the existing test helpers**

Every `Player` literal in test helpers gains `seasonGoals: 0`; every `Team` literal gains `division: 1`; the full-`GameState` literal in `src/engine/standings.test.ts` (`makeState`) gains `version: 4, cupFixtures: [], history: [], playFriendlies: false` (replacing `version: 3`). Files: `lineup.test.ts` (`makeSquad`), `match.test.ts` (`makeTeam` + the inline `base` Player in the `effectiveLevel` test + any inline Player/Team literals), `training.test.ts` (`makePlayer`, `makeTeam`), `season.test.ts` (`makePlayer`), `standings.test.ts` (`makeState`), `finance.test.ts` (`makePlayer`).

- [ ] **Step 8: Run the full suite**

Run: `npm test` and `npx tsc --noEmit`
Expected: PASS everywhere (94 + 1 new).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: v4 game state with divisions, cup, history; v3 save migration"
```

---

### Task 2: Calendar and per-division standings

**Files:**
- Modify: `src/engine/fixtures.ts`, `src/engine/standings.ts`, `src/engine/season.ts` (only `totalRounds`)
- Test: `src/engine/fixtures.test.ts`, `src/engine/standings.test.ts`

**Interfaces:**
- Consumes: `generateFixtures` (unchanged), types
- Produces:
  - `CUP_WEEKS: number[] = [4, 9, 14, 19, 24, 29]`, `LEAGUE_WEEKS: number[]` (the 30 non-cup weeks of 1..36) — exported from `./fixtures`
  - `generateDivisionFixtures(teamIds: number[], rand): Fixture[]` — like `generateFixtures` but `round` holds the calendar week (league rounds remapped onto `LEAGUE_WEEKS`)
  - `standings(state: GameState, division = 1): Standing[]` — table for one division only
  - `totalRounds(state)` — the last scheduled week: `max(fixture rounds, cup weeks)`

- [ ] **Step 1: Write the failing tests**

Add to `src/engine/fixtures.test.ts`:

```ts
import { CUP_WEEKS, generateDivisionFixtures, LEAGUE_WEEKS } from './fixtures'
```

```ts
describe('calendar', () => {
  it('league weeks skip the six cup weeks', () => {
    expect(CUP_WEEKS).toEqual([4, 9, 14, 19, 24, 29])
    expect(LEAGUE_WEEKS).toHaveLength(30)
    expect(LEAGUE_WEEKS.some(w => CUP_WEEKS.includes(w))).toBe(false)
    expect(Math.max(...LEAGUE_WEEKS)).toBe(36)
  })

  it('generateDivisionFixtures schedules rounds onto league weeks', () => {
    const fixtures = generateDivisionFixtures(ids, mulberry32(1))
    expect(fixtures).toHaveLength(240)
    const weeks = new Set(fixtures.map(f => f.round))
    expect(weeks.size).toBe(30)
    for (const w of weeks) expect(CUP_WEEKS.includes(w)).toBe(false)
    // still one match per team per scheduled week
    const week5 = fixtures.filter(f => f.round === 5)
    expect(new Set(week5.flatMap(f => [f.homeId, f.awayId])).size).toBe(16)
  })
})
```

Add to `src/engine/standings.test.ts` (inside the existing describe; `makeState`'s teams are all division 1 after Task 1):

```ts
it('scopes the table to one division', () => {
  const base = makeState([
    { round: 1, homeId: 0, awayId: 1, homeGoals: 2, awayGoals: 0 },
  ])
  const state = {
    ...base,
    teams: base.teams.map(t => (t.id === 2 ? { ...t, division: 2 } : t)),
  }
  const div1 = standings(state, 1)
  expect(div1.map(r => r.teamId).sort()).toEqual([0, 1])
  const div2 = standings(state, 2)
  expect(div2.map(r => r.teamId)).toEqual([2])
  expect(standings(state)).toEqual(div1) // default division 1
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engine/fixtures.test.ts src/engine/standings.test.ts`
Expected: FAIL — `CUP_WEEKS`/`generateDivisionFixtures` not exported; standings ignores division

- [ ] **Step 3: Implement**

Add to `src/engine/fixtures.ts`:

```ts
// 30 league rounds + 6 cup weeks = a 36-week season
export const CUP_WEEKS = [4, 9, 14, 19, 24, 29]
export const TOTAL_WEEKS = 36
export const LEAGUE_WEEKS = Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1)
  .filter(w => !CUP_WEEKS.includes(w))

export function generateDivisionFixtures(teamIds: number[], rand: () => number): Fixture[] {
  return generateFixtures(teamIds, rand).map(f => ({ ...f, round: LEAGUE_WEEKS[f.round - 1] }))
}
```

In `src/engine/standings.ts`, `standings` becomes division-scoped (rows are seeded only for the division's clubs; fixtures touching other clubs are skipped):

```ts
export function standings(state: GameState, division = 1): Standing[] {
  const rows = new Map<number, Standing>()
  for (const t of state.teams) {
    if (t.division !== division) continue
    rows.set(t.id, {
      teamId: t.id, played: 0, won: 0, drawn: 0, lost: 0,
      goalsFor: 0, goalsAgainst: 0, points: 0,
    })
  }
  for (const f of state.fixtures) {
    if (f.homeGoals === null || f.awayGoals === null) continue
    const h = rows.get(f.homeId)
    const a = rows.get(f.awayId)
    if (!h || !a) continue // other division's fixture
    ...rest identical to the current implementation...
  }
  return [...rows.values()].sort(...same comparator...)
}
```

(Only the seeding filter, the `get` null-guards, and the signature change — the accumulation and comparator lines stay exactly as they are.)

In `src/engine/season.ts`, `totalRounds` becomes the last scheduled week:

```ts
export function totalRounds(state: GameState): number {
  return Math.max(
    ...state.fixtures.map(f => f.round),
    ...state.cupFixtures.map(f => f.week),
  )
}
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS. (`newGame` still uses `generateFixtures` with rounds 1..30, so `totalRounds` still returns 30 everywhere — behavior unchanged until Task 3.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: 36-week calendar scaffolding and per-division standings"
```

---

### Task 3: Cup draws and the 48-team world

**Files:**
- Create: `src/engine/cup.ts`
- Modify: `src/engine/newGame.ts`
- Test: `src/engine/cup.test.ts`, `src/engine/newGame.test.ts`, plus assertion-count updates listed in Step 5

**Interfaces:**
- Consumes: `CUP_WEEKS` from `./fixtures`; types
- Produces:
  - `drawFirstCupRound(teams: Team[], rand): CupFixture[]` — the 32 non-Division-1 clubs, shuffled and paired, `cupRound: 1`, `week: CUP_WEEKS[0]`; `[]` if fewer than 2 entrants (unexpanded migrated world)
  - `drawNextCupRound(state: GameState, rand): CupFixture[]` — winners of the latest fully-resolved round (+ all Division 1 clubs when that round was 1), paired at the next cup week; `[]` when the final is done or ties are unresolved
  - `cupWinner(state: GameState): number | null` — winner of the final, if played
  - `newGame(seed)` — 48 teams: ids 0–15 Division 3 (user = `teams[0]`), 16–31 Division 2, 32–47 Division 1; per-division level ranges; per-division league fixtures on the 36-week calendar; cup round 1 drawn

- [ ] **Step 1: Write the failing tests**

`src/engine/cup.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { cupWinner, drawFirstCupRound, drawNextCupRound } from './cup'
import { CUP_WEEKS } from './fixtures'
import { newGame } from './newGame'
import type { GameState } from './types'

describe('drawFirstCupRound', () => {
  it('pairs the 32 non-top-flight clubs at the first cup week', () => {
    const state = newGame(1)
    const round1 = state.cupFixtures
    expect(round1).toHaveLength(16)
    expect(round1.every(f => f.cupRound === 1 && f.week === CUP_WEEKS[0])).toBe(true)
    const entrants = round1.flatMap(f => [f.homeId, f.awayId])
    expect(new Set(entrants).size).toBe(32)
    const div1Ids = new Set(state.teams.filter(t => t.division === 1).map(t => t.id))
    expect(entrants.some(id => div1Ids.has(id))).toBe(false)
  })

  it('returns no fixtures when there are no lower divisions', () => {
    const state = newGame(1)
    const div1Only = state.teams.filter(t => t.division === 1)
    expect(drawFirstCupRound(div1Only, () => 0.5)).toEqual([])
  })
})

describe('drawNextCupRound', () => {
  function resolve(state: GameState, cupRound: number): GameState {
    return {
      ...state,
      cupFixtures: state.cupFixtures.map(f =>
        f.cupRound === cupRound ? { ...f, homeGoals: 1, awayGoals: 0, winnerId: f.homeId } : f,
      ),
    }
  }

  it('adds the top flight in round 2, then halves each round to a final', () => {
    let state = newGame(2)
    const rand = () => 0.42
    const sizes: number[] = [state.cupFixtures.length]
    for (let round = 1; round <= 6; round++) {
      state = resolve(state, round)
      const next = drawNextCupRound(state, rand)
      if (round < 6) {
        state = { ...state, cupFixtures: [...state.cupFixtures, ...next] }
        sizes.push(next.length)
        expect(next.every(f => f.cupRound === round + 1 && f.week === CUP_WEEKS[round])).toBe(true)
      } else {
        expect(next).toEqual([]) // final resolved → nothing left to draw
      }
    }
    expect(sizes).toEqual([16, 16, 8, 4, 2, 1]) // R2 = 16 R1 winners + 16 div-1 clubs
    expect(cupWinner(state)).not.toBeNull()
  })

  it('draws nothing while ties are unresolved', () => {
    const state = newGame(3)
    expect(drawNextCupRound(state, () => 0.5)).toEqual([])
  })
})
```

Add to `src/engine/newGame.test.ts`:

```ts
it('builds a three-division world with the user at the bottom', () => {
  const state = newGame(123)
  expect(state.teams).toHaveLength(48)
  expect(Object.keys(state.players)).toHaveLength(48 * 18)
  for (const division of [1, 2, 3]) {
    expect(state.teams.filter(t => t.division === division)).toHaveLength(16)
  }
  expect(state.teams[0].division).toBe(3)
  expect(state.userTeamId).toBe(state.teams[0].id)
  expect(state.fixtures).toHaveLength(720) // 240 per division
  expect(state.cupFixtures).toHaveLength(16)
  // level bands per division
  for (const team of state.teams) {
    for (const id of team.playerIds) {
      const level = state.players[id].level
      if (team.division === 1) { expect(level).toBeGreaterThanOrEqual(45); expect(level).toBeLessThanOrEqual(75) }
      if (team.division === 2) { expect(level).toBeGreaterThanOrEqual(38); expect(level).toBeLessThanOrEqual(68) }
      if (team.division === 3) { expect(level).toBeGreaterThanOrEqual(30); expect(level).toBeLessThanOrEqual(60) }
    }
  }
  const names = new Set(state.teams.map(t => t.name))
  expect(names.size).toBe(48)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engine/cup.test.ts src/engine/newGame.test.ts`
Expected: FAIL — `./cup` unresolved; world is 16 teams

- [ ] **Step 3: Implement cup.ts**

```ts
import { CUP_WEEKS } from './fixtures'
import type { CupFixture, GameState, Team } from './types'

function pairUp(teamIds: number[], cupRound: number, week: number, rand: () => number): CupFixture[] {
  const ids = [...teamIds]
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
  }
  const fixtures: CupFixture[] = []
  for (let m = 0; m < Math.floor(ids.length / 2); m++) {
    fixtures.push({
      week, cupRound,
      homeId: ids[2 * m], awayId: ids[2 * m + 1],
      homeGoals: null, awayGoals: null, winnerId: null,
    })
  }
  return fixtures
}

// Round 1: the 32 clubs outside the top flight. Division 1 enters in round 2.
export function drawFirstCupRound(teams: Team[], rand: () => number): CupFixture[] {
  const entrants = teams.filter(t => t.division !== 1).map(t => t.id)
  if (entrants.length < 2) return [] // migrated 16-team world: no cup until expansion
  return pairUp(entrants, 1, CUP_WEEKS[0], rand)
}

export function drawNextCupRound(state: GameState, rand: () => number): CupFixture[] {
  const lastRound = Math.max(0, ...state.cupFixtures.map(f => f.cupRound))
  if (lastRound === 0 || lastRound >= CUP_WEEKS.length) return []
  const ties = state.cupFixtures.filter(f => f.cupRound === lastRound)
  if (ties.some(f => f.winnerId === null)) return []
  let entrants = ties.map(f => f.winnerId!)
  if (lastRound === 1) {
    entrants = [...entrants, ...state.teams.filter(t => t.division === 1).map(t => t.id)]
  }
  if (entrants.length < 2) return []
  return pairUp(entrants, lastRound + 1, CUP_WEEKS[lastRound], rand)
}

export function cupWinner(state: GameState): number | null {
  if (state.cupFixtures.length === 0) return null
  const final = state.cupFixtures.reduce((a, b) => (b.cupRound > a.cupRound ? b : a))
  return final.cupRound === CUP_WEEKS.length ? final.winnerId : null
}
```

- [ ] **Step 4: Rebuild newGame's world loop**

In `src/engine/newGame.ts` (imports gain `generateDivisionFixtures` from `./fixtures` — replacing `generateFixtures` — and `drawFirstCupRound` from `./cup`):

```ts
// ids 0-15 are Division 3 (the user's club is teams[0]), 16-31 Division 2, 32-47 Division 1
const DIVISION_OF = (index: number) => (index < 16 ? 3 : index < 32 ? 2 : 1)
const LEVEL_RANGE: Record<number, [number, number]> = { 1: [45, 75], 2: [38, 68], 3: [30, 60] }
```

The team loop runs `for (let t = 0; t < 48; t++)` with `const division = DIVISION_OF(t)`, the player literal's level becomes `randInt(rand, LEVEL_RANGE[division][0], LEVEL_RANGE[division][1])`, and the team literal gains `division`. The returned state's fixtures and cup become:

```ts
fixtures: [3, 2, 1].flatMap(d =>
  generateDivisionFixtures(teams.filter(t => t.division === d).map(t => t.id), rand),
),
cupFixtures: drawFirstCupRound(teams, rand),
```

(`userTeamId: teams[0].id` is unchanged — teams[0] is now a Division 3 club. Delete the old ponytail comment about the team picker if it references division-less worlds; keep the picker deferral note.)

- [ ] **Step 5: Update world-size assertions across the suite**

These existing tests reference the 16-team world; update only the named literals:
- `src/engine/newGame.test.ts` "builds a full, valid world": `toHaveLength(16)` → `48`, players `16 * 18` → `48 * 18`, fixtures `240` → `720`; level bounds `30..70` → `30..75` (the union of division bands).
- `src/engine/season.test.ts` "resets the calendar...": `s2.fixtures).toHaveLength(240)` → `720`.
- `src/engine/finance.test.ts` and `src/engine/transfers.test.ts` use `newGame` relationally (no fixed counts) — leave them; if a transfers test times out from the bigger world, do not weaken it, report it.

- [ ] **Step 6: Run the full suite**

Run: `npm test` and `npx tsc --noEmit`
Expected: PASS. Note `advanceRound` still only simulates `state.fixtures` whose `round` matches — cup weeks are simply empty until Task 4; the season now runs 36 weeks via `totalRounds`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: three-division 48-team world with cup draws"
```

---

### Task 4: Cup matchdays and goal tracking in advanceRound

**Files:**
- Modify: `src/engine/season.ts`
- Test: `src/engine/season.test.ts`

**Interfaces:**
- Consumes: `drawNextCupRound` from `./cup`; `simulateMatch`, `autoPick`, `patchLineup`, `applyWeeklyUpdates`, `runTransfers`, `runWeeklyFinances` (all existing)
- Produces:
  - `advanceRound(state)` — simulates the current week's league fixtures AND cup ties; cup draws resolve to a `winnerId` (penalty coin flip on a draw); after a fully-resolved cup week the next round is drawn; only clubs that actually played this week count as starters for fitness
  - `applyMatchConsequences` — gains a `goal` branch (`seasonGoals + 1`) and a missing-player guard (`if (!p) continue`)

- [ ] **Step 1: Write the failing tests**

Add to `src/engine/season.test.ts`:

```ts
describe('applyMatchConsequences — goals', () => {
  it('counts season goals and ignores events for unknown players', () => {
    const rand = mulberry32(1)
    const goal: MatchEvent = { minute: 10, type: 'goal', teamId: 0, playerId: 1 }
    const ghost: MatchEvent = { minute: 11, type: 'goal', teamId: 0, playerId: 999 }
    const next = applyMatchConsequences({ 1: makePlayer(1) }, [goal, goal, ghost], rand)
    expect(next[1].seasonGoals).toBe(2)
  })
})

describe('advanceRound — cup weeks', () => {
  it('plays cup ties on cup weeks, decides ties, and draws the next round', () => {
    let s = newGame(5)
    for (let week = 1; week <= 9; week++) s = advanceRound(s) // through cup rounds 1 (wk 4) and 2 (wk 9)
    const round1 = s.cupFixtures.filter(f => f.cupRound === 1)
    expect(round1.every(f => f.homeGoals !== null && f.winnerId !== null)).toBe(true)
    for (const f of round1) {
      if (f.homeGoals! > f.awayGoals!) expect(f.winnerId).toBe(f.homeId)
      else if (f.awayGoals! > f.homeGoals!) expect(f.winnerId).toBe(f.awayId)
      else expect([f.homeId, f.awayId]).toContain(f.winnerId) // penalties
    }
    const round2 = s.cupFixtures.filter(f => f.cupRound === 2)
    expect(round2).toHaveLength(16) // 16 winners + 16 div-1 entrants
    // no league fixtures were scheduled on the cup week
    expect(s.fixtures.filter(f => f.round === 4)).toHaveLength(0)
  })

  it('completes the whole cup by season end', () => {
    let s = newGame(6)
    for (let i = 0; i < totalRounds(s); i++) s = advanceRound(s)
    expect(s.cupFixtures.filter(f => f.cupRound === 6)).toHaveLength(1)
    expect(cupWinner(s)).not.toBeNull()
    expect(s.fixtures.every(f => f.homeGoals !== null)).toBe(true) // league unharmed
  })

  it('accumulates season goals matching stored events', () => {
    let s = newGame(7)
    for (let week = 1; week <= 6; week++) s = advanceRound(s)
    const eventGoals = [...s.fixtures, ...s.cupFixtures]
      .flatMap(f => f.events ?? [])
      .filter(e => e.type === 'goal').length
    const playerGoals = Object.values(s.players).reduce((sum, p) => sum + p.seasonGoals, 0)
    expect(playerGoals).toBe(eventGoals)
    expect(eventGoals).toBeGreaterThan(0)
  })

  it('rests non-participants on cup weeks', () => {
    let s = newGame(8)
    for (let week = 1; week <= 3; week++) s = advanceRound(s)
    // week 4 is a cup week: division clubs not in the cup (all of division 1) rest
    const div1 = s.teams.find(t => t.division === 1)!
    const tiredBefore = div1.lineup.map(id => s.players[id].fitness)
    const s2 = advanceRound(s)
    const after = div1.lineup.map(id => s2.players[id].fitness)
    after.forEach((f, i) => expect(f).toBeGreaterThanOrEqual(tiredBefore[i])) // recovery only
  })
})
```

with imports extended: `import { cupWinner } from './cup'` and `MatchEvent` type. (`makePlayer` gained `seasonGoals: 0` in Task 1.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engine/season.test.ts`
Expected: FAIL — cup ties never simulated; seasonGoals stay 0

- [ ] **Step 3: Rewrite advanceRound and extend applyMatchConsequences**

In `src/engine/season.ts`, add to `applyMatchConsequences`'s event loop — a guard at the top and a goal branch:

```ts
  for (const e of events) {
    const p = next[e.playerId]
    if (!p) continue // event for a player no longer in the world
    if (e.type === 'goal') {
      next[p.id] = { ...p, seasonGoals: p.seasonGoals + 1 }
    } else if (e.type === 'yellow') {
    ...existing branches unchanged...
```

Replace `advanceRound` with the week-based version (imports gain `drawNextCupRound` from `./cup`):

```ts
export function advanceRound(state: GameState): GameState {
  if (state.gameOver || state.round > totalRounds(state)) return state
  const rand = mulberry32(state.rngState)
  const week = state.round

  const leagueToday = state.fixtures.filter(f => f.round === week)
  const cupToday = state.cupFixtures.filter(f => f.week === week)
  const playingIds = new Set([...leagueToday, ...cupToday].flatMap(f => [f.homeId, f.awayId]))

  // refresh lineups only for clubs that play this week
  const teams = state.teams.map(t =>
    playingIds.has(t.id)
      ? { ...t, lineup: t.id === state.userTeamId ? patchLineup(t, state.players) : autoPick(t, state.players) }
      : t,
  )
  const byId = new Map(teams.map(t => [t.id, t]))

  const roundEvents: MatchEvent[] = []
  const fixtures = state.fixtures.map(f => {
    if (f.round !== week) return f
    const result = simulateMatch(byId.get(f.homeId)!, byId.get(f.awayId)!, state.players, rand)
    roundEvents.push(...result.events)
    return { ...f, homeGoals: result.homeGoals, awayGoals: result.awayGoals, events: result.events }
  })

  let cupFixtures = state.cupFixtures.map(f => {
    if (f.week !== week || f.winnerId !== null) return f
    const result = simulateMatch(byId.get(f.homeId)!, byId.get(f.awayId)!, state.players, rand)
    roundEvents.push(...result.events)
    const winnerId =
      result.homeGoals > result.awayGoals ? f.homeId
      : result.awayGoals > result.homeGoals ? f.awayId
      : rand() < 0.5 ? f.homeId : f.awayId // ponytail: penalty shootout is a coin flip
    return { ...f, homeGoals: result.homeGoals, awayGoals: result.awayGoals, winnerId, events: result.events }
  })

  // existing bans/injuries tick down BEFORE this week's knocks land
  let players: Record<number, Player> = Object.fromEntries(
    Object.values(state.players).map(p => [p.id, {
      ...p,
      injuredForRounds: Math.max(0, p.injuredForRounds - 1),
      suspendedForRounds: Math.max(0, p.suspendedForRounds - 1),
    }]),
  )
  players = applyMatchConsequences(players, roundEvents, rand)

  // only this week's participants drain fitness; everyone else recovers
  const starters = new Set(teams.filter(t => playingIds.has(t.id)).flatMap(t => t.lineup))
  players = applyWeeklyUpdates(players, teams, starters, rand)

  let s: GameState = { ...state, teams, players, fixtures, cupFixtures }
  s = runTransfers(s, rand)
  s = runWeeklyFinances(s, rand)

  // once a cup week fully resolves, the next round is drawn
  if (cupToday.length > 0) {
    const next = drawNextCupRound(s, rand)
    if (next.length > 0) s = { ...s, cupFixtures: [...s.cupFixtures, ...next] }
  }

  return { ...s, round: week + 1, rngState: randInt(rand, 1, 2 ** 31 - 1) }
}
```

- [ ] **Step 4: Run the full suite**

Run: `npm test` and `npx tsc --noEmit`
Expected: PASS. The Phase-2/3 `advanceRound` tests still hold (week 1 is a league week; determinism is preserved; the discipline-churn test's `played × 1.25` floor now counts all divisions' fixtures).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: cup matchdays, penalty deciders, and season goal tracking"
```

---

### Task 5: Division-aware finances

**Files:**
- Modify: `src/engine/finance.ts`
- Test: `src/engine/finance.test.ts`

**Interfaces:**
- Consumes: `standings(state, division)` from `./standings`; types
- Produces:
  - `DIVISION_FACTOR: Record<number, number> = { 1: 1, 2: 0.7, 3: 0.5 }` (exported — Task 6 and rollover prizes reuse it)
  - `runWeeklyFinances` — position from the club's own division table; gate = `(10_000 + 800 × (16 − position) + jitter) × TICKET_PRICE × divisionFactor`; home cup ties this week earn a gate exactly like home league fixtures

- [ ] **Step 1: Write the failing tests**

Add to `src/engine/finance.test.ts`:

```ts
import { DIVISION_FACTOR } from './finance'
import { CUP_WEEKS } from './fixtures'
```

```ts
describe('division-aware gates', () => {
  it('scales gate receipts by division', () => {
    expect(DIVISION_FACTOR).toEqual({ 1: 1, 2: 0.7, 3: 0.5 })
    const s0 = newGame(1)
    const s1 = runWeeklyFinances(s0, mulberry32(2))
    // a division-1 home club earns at least (10_000 - 1_000 + 800*0) * 15 = 135k;
    // a division-3 home club (factor 0.5) can earn at most ((10_000 + 800*15 + 1_000) * 15) / 2 = 172.5k
    const homeIds = new Set(s0.fixtures.filter(f => f.round === 1).map(f => f.homeId))
    for (const t of s1.teams) {
      if (!homeIds.has(t.id)) continue
      const before = s0.teams.find(x => x.id === t.id)!.cash
      const gate = t.cash - (before - wageBill(t.id, s0)) - (t.id === s0.userTeamId ? interestAdjustments(s1) : 0)
      if (t.division === 1) expect(gate).toBeGreaterThanOrEqual(Math.round(135_000))
      if (t.division === 3 && t.id !== s0.userTeamId) expect(gate).toBeLessThanOrEqual(172_500)
    }
    function interestAdjustments(s: GameState): number {
      return s.finances.filter(e => e.round === 1 && (e.label === 'Deposit interest' || e.label === 'Overdraft charge' || e.label === 'Loan interest')).reduce((sum, e) => sum + e.amount, 0)
    }
  })

  it('pays a gate for a home cup tie', () => {
    let s = newGame(9)
    for (let week = 1; week < CUP_WEEKS[0]; week++) s = advanceRound(s)
    // week 4: only cup ties are scheduled
    const cupHomes = new Set(s.cupFixtures.filter(f => f.week === CUP_WEEKS[0]).map(f => f.homeId))
    expect(cupHomes.size).toBeGreaterThan(0)
    const before = new Map(s.teams.map(t => [t.id, t.cash]))
    const s2 = advanceRound(s)
    for (const id of cupHomes) {
      const t = s2.teams.find(x => x.id === id)!
      // gate income exceeds the wage bill hit for at least the cup hosts as a group
      expect(t.cash).toBeGreaterThan(before.get(id)! - wageBill(id, s) )
    }
  })
})
```

with `advanceRound` imported from `./season` and `GameState` from `./types` in the test file.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engine/finance.test.ts`
Expected: FAIL — `DIVISION_FACTOR` not exported; cup hosts earn nothing

- [ ] **Step 3: Implement**

In `src/engine/finance.ts`:

```ts
// gates and league prizes scale down the pyramid
export const DIVISION_FACTOR: Record<number, number> = { 1: 1, 2: 0.7, 3: 0.5 }
```

In `runWeeklyFinances`, replace the position map and home set:

```ts
  const position = new Map<number, number>()
  for (const division of new Set(state.teams.map(t => t.division))) {
    standings(state, division).forEach((row, i) => position.set(row.teamId, i + 1))
  }
  const homeThisRound = new Set([
    ...state.fixtures.filter(f => f.round === state.round).map(f => f.homeId),
    ...state.cupFixtures.filter(f => f.week === state.round).map(f => f.homeId),
  ])
```

and the gate line becomes:

```ts
      const attendance = 10_000 + 800 * (16 - position.get(team.id)!) + randInt(rand, -1000, 1000)
      const gate = Math.round(attendance * TICKET_PRICE * (DIVISION_FACTOR[team.division] ?? 1))
```

(No other lines change. `position.get` stays non-null: every team belongs to exactly one division and is seeded by that division's standings.)

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS — the Phase-3 gate tests still hold (they assert relational movement, not absolute amounts).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: division-scaled gates and cup-day receipts"
```

---

### Task 6: Friendlies on free weeks

**Files:**
- Modify: `src/engine/season.ts`
- Test: `src/engine/season.test.ts`

**Interfaces:**
- Consumes: `DIVISION_FACTOR`, `TICKET_PRICE`, `adjustCash`, `userLedger` from `./finance`; existing sim machinery
- Produces: inside `advanceRound` — when `playFriendlies` is true, the current week has cup ties, and the user is not in them: the user hosts a random idle club; only `injury` events apply; a flat gate `(6000 + randInt(−500, 500)) × TICKET_PRICE × divisionFactor` lands with a `'Friendly gate receipts'` ledger entry; both sides' starters drain fitness

- [ ] **Step 1: Write the failing tests**

Add to `src/engine/season.test.ts`:

```ts
describe('friendlies', () => {
  function toFreeWeek(seed: number, playFriendlies: boolean) {
    let s: GameState = { ...newGame(seed), playFriendlies }
    // eliminate the user from the cup so week 4 is a free week: resolve their round-1 tie against them
    s = {
      ...s,
      cupFixtures: s.cupFixtures.map(f =>
        f.homeId === s.userTeamId || f.awayId === s.userTeamId
          ? { ...f, homeGoals: 0, awayGoals: 3, winnerId: f.homeId === s.userTeamId ? f.awayId : f.homeId, week: 0 }
          : f,
      ),
    }
    for (let week = 1; week < 4; week++) s = advanceRound(s)
    return s // next advance simulates week 4 (cup week, user idle)
  }

  it('plays a friendly for income when enabled', () => {
    const s = toFreeWeek(11, true)
    const s2 = advanceRound(s)
    expect(s2.finances.some(e => e.label === 'Friendly gate receipts' && e.amount > 0)).toBe(true)
  })

  it('does not play one when disabled', () => {
    const s = toFreeWeek(11, false)
    const s2 = advanceRound(s)
    expect(s2.finances.some(e => e.label === 'Friendly gate receipts')).toBe(false)
  })

  it('friendly goals never reach season tallies', () => {
    const s = toFreeWeek(11, true)
    const before = Object.values(s.players).reduce((sum, p) => sum + p.seasonGoals, 0)
    const s2 = advanceRound(s)
    const storedGoalEvents = [...s2.fixtures, ...s2.cupFixtures]
      .flatMap(f => f.events ?? []).filter(e => e.type === 'goal').length
    const after = Object.values(s2.players).reduce((sum, p) => sum + p.seasonGoals, 0)
    expect(after - before).toBeLessThanOrEqual(storedGoalEvents) // friendly events are not stored anywhere
    // and specifically: tallies match stored events exactly (invariant from Task 4 holds)
    expect(after).toBe(storedGoalEvents)
  })
})
```

(Note: setting the user's round-1 tie to `week: 0` with a recorded winner removes them from week-4 play while keeping the draw pipeline intact — `drawNextCupRound` only needs `winnerId`s.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engine/season.test.ts`
Expected: FAIL — no friendly income ever appears

- [ ] **Step 3: Implement inside advanceRound**

In `src/engine/season.ts` (imports gain `adjustCash`, `userLedger`, `TICKET_PRICE`, `DIVISION_FACTOR` from `./finance`), insert the friendly pairing right after `playingIds` is built and before the lineup refresh:

```ts
  // an idle user on a cup week can host a friendly (user setting)
  let friendly: { homeId: number; awayId: number } | null = null
  if (state.playFriendlies && cupToday.length > 0 && !playingIds.has(state.userTeamId)) {
    const idle = state.teams.filter(t => t.id !== state.userTeamId && !playingIds.has(t.id))
    if (idle.length > 0) {
      friendly = { homeId: state.userTeamId, awayId: idle[Math.floor(rand() * idle.length)].id }
      playingIds.add(friendly.homeId)
      playingIds.add(friendly.awayId)
    }
  }
```

and insert the friendly simulation right after the `cupFixtures` mapping (before the counter tick-down):

```ts
  let friendlyIncome = 0
  if (friendly) {
    const result = simulateMatch(byId.get(friendly.homeId)!, byId.get(friendly.awayId)!, state.players, rand)
    // friendlies: knocks are real, bookings and goals are not
    roundEvents.push(...result.events.filter(e => e.type === 'injury'))
    const user = byId.get(state.userTeamId)!
    friendlyIncome = Math.round(
      (6000 + randInt(rand, -500, 500)) * TICKET_PRICE * (DIVISION_FACTOR[user.division] ?? 1),
    )
  }
```

and after `let s: GameState = { ...state, teams, players, fixtures, cupFixtures }`:

```ts
  if (friendlyIncome > 0) {
    s = {
      ...s,
      teams: adjustCash(s.teams, s.userTeamId, friendlyIncome),
      finances: userLedger(s, 'Friendly gate receipts', friendlyIncome),
    }
  }
```

(The friendly pair is already in `playingIds`, so both squads' lineups refresh and both sides' starters drain fitness via the existing `starters` set.)

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: opt-in friendlies on free weeks"
```

---

### Task 7: Rollover helpers — pyramid, retirement, youth, expansion, season record

**Files:**
- Create: `src/engine/rollover.ts`
- Modify: `src/engine/newGame.ts` (export two constants)
- Test: `src/engine/rollover.test.ts`

**Interfaces:**
- Consumes: `standings`; `cupWinner` from `./cup`; `autoPick` from `./lineup`; `randomName`, `TEAM_NAMES` from `./names`; `salaryFor`, `STARTING_CASH` from `./finance`; `randInt`; `SQUAD_TEMPLATE`, `LEVEL_RANGE` from `./newGame` (exported in this task)
- Produces (Task 8 composes these):
  - `applyPromotionRelegation(state: GameState, teams: Team[]): Team[]` — bottom 3 of divisions 1–2 swap with top 3 of the division below, judged on `state`'s final tables, applied to the passed `teams`
  - `retirePlayers(players, teams, rand): { players; teams }` — age 34: 35%, 35: 65%, 36+: always; retirees vanish from `players`, `playerIds`, `lineup`
  - `youthIntake(players, teams, rand): { players; teams }` — squads < 16 gain 2 youths, < 20 gain 1 (age 16–18, level 22–45, `salaryFor` salary, 3-season contract, position drawn GK 1/6, DF 2/6, MF 2/6, FW 1/6)
  - `ensureThreeDivisions(players, teams, rand): { players; teams }` — generates any missing division (16 clubs each, fresh squads at that division's `LEVEL_RANGE`, unused `TEAM_NAMES`) for migrated worlds; no-op on full worlds
  - `seasonRecord(state: GameState): SeasonRecord`

- [ ] **Step 1: Export the generation constants from newGame**

In `src/engine/newGame.ts`, change `const SQUAD_TEMPLATE` to `export const SQUAD_TEMPLATE` and `const LEVEL_RANGE` to `export const LEVEL_RANGE`.

- [ ] **Step 2: Write the failing tests**

`src/engine/rollover.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { newGame } from './newGame'
import {
  applyPromotionRelegation, ensureThreeDivisions, retirePlayers, seasonRecord, youthIntake,
} from './rollover'
import { mulberry32 } from './rng'
import { advanceRound, totalRounds } from './season'
import { standings } from './standings'
import type { GameState, Player } from './types'

function playSeason(seed: number): GameState {
  let s = newGame(seed)
  for (let i = 0; i < totalRounds(s); i++) s = advanceRound(s)
  return s
}

describe('applyPromotionRelegation', () => {
  it('swaps three clubs at each boundary and keeps divisions at 16', () => {
    const s = playSeason(13)
    const down1 = standings(s, 1).slice(-3).map(r => r.teamId)
    const up2 = standings(s, 2).slice(0, 3).map(r => r.teamId)
    const down2 = standings(s, 2).slice(-3).map(r => r.teamId)
    const up3 = standings(s, 3).slice(0, 3).map(r => r.teamId)
    const teams = applyPromotionRelegation(s, s.teams)
    for (const id of down1) expect(teams.find(t => t.id === id)!.division).toBe(2)
    for (const id of up2) expect(teams.find(t => t.id === id)!.division).toBe(1)
    for (const id of down2) expect(teams.find(t => t.id === id)!.division).toBe(3)
    for (const id of up3) expect(teams.find(t => t.id === id)!.division).toBe(2)
    for (const d of [1, 2, 3]) expect(teams.filter(t => t.division === d)).toHaveLength(16)
  })

  it('no-ops when a division is missing (migrated world)', () => {
    const s = newGame(1)
    const div1Only = { ...s, teams: s.teams.filter(t => t.division === 1).map(t => ({ ...t })) }
    expect(applyPromotionRelegation(div1Only as GameState, div1Only.teams)).toEqual(div1Only.teams)
  })
})

describe('retirePlayers', () => {
  it('retires by age band and strips rosters', () => {
    const s = newGame(2)
    // force known ages on one team
    const team = s.teams[4]
    const [a, b, c] = team.playerIds
    const players: Record<number, Player> = {
      ...s.players,
      [a]: { ...s.players[a], age: 36 }, // always retires
      [b]: { ...s.players[b], age: 30 }, // never
      [c]: { ...s.players[c], age: 34 }, // 35% chance — either is fine
    }
    const out = retirePlayers(players, s.teams, mulberry32(3))
    expect(out.players[a]).toBeUndefined()
    expect(out.players[b]).toBeDefined()
    const newTeam = out.teams.find(t => t.id === team.id)!
    expect(newTeam.playerIds).not.toContain(a)
    expect(newTeam.lineup).not.toContain(a)
  })
})

describe('youthIntake', () => {
  it('replenishes small squads', () => {
    const s = newGame(3)
    const trim = (id: number, keep: number) =>
      s.teams.map(t => (t.id === id ? { ...t, playerIds: t.playerIds.slice(0, keep), lineup: [] } : t))
    let teams = trim(0, 14) // < 16 → +2
    teams = teams.map(t => (t.id === 1 ? { ...t, playerIds: t.playerIds.slice(0, 18), lineup: [] } : t)) // < 20 → +1
    const out = youthIntake(s.players, teams, mulberry32(4))
    const t0 = out.teams.find(t => t.id === 0)!
    const t1 = out.teams.find(t => t.id === 1)!
    const t2 = out.teams.find(t => t.id === 2)! // 18 players... also < 20 → +1
    expect(t0.playerIds).toHaveLength(16)
    expect(t1.playerIds).toHaveLength(19)
    expect(t2.playerIds).toHaveLength(19)
    const rookieId = t0.playerIds[15]
    const rookie = out.players[rookieId]
    expect(rookie.age).toBeGreaterThanOrEqual(16)
    expect(rookie.age).toBeLessThanOrEqual(18)
    expect(rookie.level).toBeGreaterThanOrEqual(22)
    expect(rookie.level).toBeLessThanOrEqual(45)
    expect(rookie.contractSeasons).toBe(3)
    expect(rookie.seasonGoals).toBe(0)
  })
})

describe('ensureThreeDivisions', () => {
  it('expands a one-division world to three', () => {
    const s = newGame(5)
    const div1Teams = s.teams.filter(t => t.division === 1)
    const div1PlayerIds = new Set(div1Teams.flatMap(t => t.playerIds))
    const players = Object.fromEntries(Object.entries(s.players).filter(([id]) => div1PlayerIds.has(Number(id))))
    const out = ensureThreeDivisions(players, div1Teams, mulberry32(6))
    expect(out.teams).toHaveLength(48)
    for (const d of [1, 2, 3]) expect(out.teams.filter(t => t.division === d)).toHaveLength(16)
    expect(new Set(out.teams.map(t => t.name)).size).toBe(48)
    expect(new Set(out.teams.map(t => t.id)).size).toBe(48)
    const newClub = out.teams.find(t => t.division === 3 && !div1Teams.includes(t))!
    expect(newClub.playerIds).toHaveLength(18)
    expect(newClub.lineup).toHaveLength(11)
    for (const id of newClub.playerIds) {
      expect(out.players[id].level).toBeGreaterThanOrEqual(30)
      expect(out.players[id].level).toBeLessThanOrEqual(60)
    }
  })

  it('no-ops on a full world', () => {
    const s = newGame(5)
    const out = ensureThreeDivisions(s.players, s.teams, mulberry32(6))
    expect(out.teams).toBe(s.teams)
    expect(out.players).toBe(s.players)
  })
})

describe('seasonRecord', () => {
  it('captures champions, cup winner, top scorer, and the user finish', () => {
    const s = playSeason(7)
    const record = seasonRecord(s)
    expect(record.season).toBe(1)
    expect(record.champions).toHaveLength(3)
    expect(record.champions[0]).toBe(s.teams.find(t => t.id === standings(s, 1)[0].teamId)!.name)
    expect(record.cupWinner).not.toBe('—')
    expect(record.topScorer.goals).toBeGreaterThan(0)
    expect(record.userDivision).toBe(3)
    expect(record.userPosition).toBeGreaterThanOrEqual(1)
    expect(record.userPosition).toBeLessThanOrEqual(16)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/engine/rollover.test.ts`
Expected: FAIL — cannot resolve `./rollover`

- [ ] **Step 4: Implement rollover.ts**

```ts
import { cupWinner } from './cup'
import { salaryFor, STARTING_CASH } from './finance'
import { autoPick } from './lineup'
import { randomName, TEAM_NAMES } from './names'
import { LEVEL_RANGE, SQUAD_TEMPLATE } from './newGame'
import { randInt } from './rng'
import { standings } from './standings'
import type { GameState, Player, Position, SeasonRecord, Team } from './types'

// bottom three of each upper division swap with the top three below it
export function applyPromotionRelegation(state: GameState, teams: Team[]): Team[] {
  let next = teams
  for (const upper of [1, 2]) {
    const lower = upper + 1
    const upperTable = standings(state, upper)
    const lowerTable = standings(state, lower)
    if (upperTable.length === 0 || lowerTable.length === 0) continue
    const relegated = new Set(upperTable.slice(-3).map(r => r.teamId))
    const promoted = new Set(lowerTable.slice(0, 3).map(r => r.teamId))
    next = next.map(t =>
      relegated.has(t.id) ? { ...t, division: lower }
      : promoted.has(t.id) ? { ...t, division: upper }
      : t,
    )
  }
  return next
}

export function retirePlayers(
  players: Record<number, Player>,
  teams: Team[],
  rand: () => number,
): { players: Record<number, Player>; teams: Team[] } {
  const retired = new Set<number>()
  const nextPlayers = { ...players }
  for (const p of Object.values(players)) {
    const chance = p.age >= 36 ? 1 : p.age === 35 ? 0.65 : p.age === 34 ? 0.35 : 0
    if (chance > 0 && rand() < chance) {
      retired.add(p.id)
      delete nextPlayers[p.id]
    }
  }
  return {
    players: nextPlayers,
    teams: teams.map(t => ({
      ...t,
      playerIds: t.playerIds.filter(id => !retired.has(id)),
      lineup: t.lineup.filter(id => !retired.has(id)),
    })),
  }
}

// GK 1/6, DF 2/6, MF 2/6, FW 1/6
const YOUTH_POSITIONS: Position[] = ['GK', 'DF', 'DF', 'MF', 'MF', 'FW']

function nextFreeId(players: Record<number, Player>): number {
  return Math.max(0, ...Object.keys(players).map(Number)) + 1
}

export function youthIntake(
  players: Record<number, Player>,
  teams: Team[],
  rand: () => number,
): { players: Record<number, Player>; teams: Team[] } {
  const nextPlayers = { ...players }
  let nextId = nextFreeId(players)
  const nextTeams = teams.map(team => {
    const count = team.playerIds.length >= 20 ? 0 : team.playerIds.length < 16 ? 2 : 1
    if (count === 0) return team
    const ids: number[] = []
    for (let i = 0; i < count; i++) {
      const level = randInt(rand, 22, 45)
      const rookie: Player = {
        id: nextId++,
        name: randomName(rand),
        age: randInt(rand, 16, 18),
        position: YOUTH_POSITIONS[randInt(rand, 0, YOUTH_POSITIONS.length - 1)],
        level,
        form: 0, fitness: 100, injuredForRounds: 0, suspendedForRounds: 0, yellowCards: 0,
        salary: salaryFor(level),
        contractSeasons: 3,
        seasonGoals: 0,
      }
      nextPlayers[rookie.id] = rookie
      ids.push(rookie.id)
    }
    return { ...team, playerIds: [...team.playerIds, ...ids] }
  })
  return { players: nextPlayers, teams: nextTeams }
}

// Migrated (pre-division) worlds arrive with 16 clubs in Division 1;
// the first rollover fills in Divisions 2 and 3.
export function ensureThreeDivisions(
  players: Record<number, Player>,
  teams: Team[],
  rand: () => number,
): { players: Record<number, Player>; teams: Team[] } {
  const missing = [2, 3].filter(d => !teams.some(t => t.division === d))
  if (missing.length === 0) return { players, teams }
  const usedNames = new Set(teams.map(t => t.name))
  const freeNames = TEAM_NAMES.filter(n => !usedNames.has(n))
  let nameIndex = 0
  let nextTeamId = Math.max(...teams.map(t => t.id)) + 1
  let nextId = nextFreeId(players)
  const nextPlayers = { ...players }
  const nextTeams = [...teams]
  for (const division of missing) {
    const [lo, hi] = LEVEL_RANGE[division]
    for (let i = 0; i < 16; i++) {
      const playerIds: number[] = []
      for (const position of SQUAD_TEMPLATE) {
        const level = randInt(rand, lo, hi)
        const player: Player = {
          id: nextId++,
          name: randomName(rand),
          age: randInt(rand, 17, 34),
          position,
          level,
          form: 0, fitness: 100, injuredForRounds: 0, suspendedForRounds: 0, yellowCards: 0,
          salary: salaryFor(level),
          contractSeasons: randInt(rand, 1, 3),
          seasonGoals: 0,
        }
        nextPlayers[player.id] = player
        playerIds.push(player.id)
      }
      const team: Team = {
        id: nextTeamId++,
        name: freeNames[nameIndex++] ?? `AC Interior ${nextTeamId}`,
        playerIds,
        formation: '4-4-2',
        lineup: [],
        tactic: 'normal',
        trainingStyle: 'normal',
        cash: STARTING_CASH,
        division,
      }
      team.lineup = autoPick(team, nextPlayers)
      nextTeams.push(team)
    }
  }
  return { players: nextPlayers, teams: nextTeams }
}

export function seasonRecord(state: GameState): SeasonRecord {
  const divisions = [...new Set(state.teams.map(t => t.division))].sort()
  const champions = divisions.map(d => {
    const top = standings(state, d)[0]
    return state.teams.find(t => t.id === top.teamId)!.name
  })
  const winnerId = cupWinner(state)
  const everyone = Object.values(state.players)
  const top = everyone.reduce((best, p) => (p.seasonGoals > best.seasonGoals ? p : best), everyone[0])
  const topTeam = state.teams.find(t => t.playerIds.includes(top.id))
  const userDivision = state.teams.find(t => t.id === state.userTeamId)!.division
  return {
    season: state.season,
    champions,
    cupWinner: winnerId === null ? '—' : state.teams.find(t => t.id === winnerId)!.name,
    topScorer: { player: top.name, team: topTeam?.name ?? 'free agent', goals: top.seasonGoals },
    userDivision,
    userPosition: standings(state, userDivision).findIndex(r => r.teamId === state.userTeamId) + 1,
  }
}

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/engine/rollover.test.ts` then `npm test`
Expected: PASS (full suite untouched — nothing calls rollover.ts yet).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: rollover helpers — pyramid swaps, retirement, youth, expansion, season record"
```

---

### Task 8: newSeason composition — prizes, contracts with a floor, history

**Files:**
- Modify: `src/engine/season.ts`, `src/engine/training.ts`
- Test: `src/engine/season.test.ts`, `src/engine/training.test.ts`

**Interfaces:**
- Consumes: everything from Task 7; `DIVISION_FACTOR` from `./finance`; `CUP_WEEKS` from `./fixtures`; `drawFirstCupRound` from `./cup`; `generateDivisionFixtures`; `MIN_SQUAD`, `renewalSalary` from `./transfers`; `ageSquads` from `./training`
- Produces:
  - `newSeason(state)` — gameOver guard; season record appended to history; division-scaled league prizes; cup prizes ($1M / $400k); promotion/relegation; retirement; contract settlement with the user floor (cheapest expiring contracts force-renew so the squad never drops below `MIN_SQUAD`); youth intake; `ensureThreeDivisions`; aging; fresh per-division fixtures + cup round 1; market cleared
  - `ageSquads` also resets `seasonGoals` to 0

- [ ] **Step 1: Write the failing tests**

In `src/engine/training.test.ts`, extend the existing `ageSquads` test: give player 1 `seasonGoals: 7` in its overrides and assert `expect(next[1].seasonGoals).toBe(0)` alongside the existing reset assertions.

In `src/engine/season.test.ts`: the Phase-3 `newSeason` describes need three updates plus new tests. Replace the "pays prize money by final position" test and the "settles contracts" test with the versions below, keep "clears the market at season end" as is, and in the Phase-2 "resets the calendar, bumps the season, and ages squads" test change the player loop to skip newcomers:

```ts
    for (const p of Object.values(s2.players)) {
      if (!s.players[p.id]) continue // youth arrivals have no previous-season self
      expect(p.age).toBe(s.players[p.id].age + 1)
      expect(p.fitness).toBe(100)
      expect(p.yellowCards).toBe(0)
    }
```

New/replacement tests:

```ts
describe('newSeason — the long game', () => {
  it('no-ops when the game is over', () => {
    const s = { ...newGame(1), gameOver: true }
    expect(newSeason(s)).toBe(s)
  })

  it('pays division-scaled prizes and applies promotion and relegation', () => {
    const s = playSeason(7)
    const div1Champion = standings(s, 1)[0].teamId
    const div3Top = standings(s, 3).slice(0, 3).map(r => r.teamId)
    const div1Bottom = standings(s, 1).slice(-3).map(r => r.teamId)
    const s2 = newSeason(s)
    const delta = (id: number) => s2.teams.find(t => t.id === id)!.cash - s.teams.find(t => t.id === id)!.cash
    expect(delta(div1Champion)).toBeGreaterThanOrEqual(1_500_000) // full-factor first prize (+ maybe cup money)
    for (const id of div3Top) {
      expect(s2.teams.find(t => t.id === id)!.division).toBe(2)
      // division-3 factor halves the prize table
      expect(delta(id)).toBeGreaterThanOrEqual(Math.round((1_500_000 - 2 * 75_000) * 0.5))
    }
    for (const id of div1Bottom) expect(s2.teams.find(t => t.id === id)!.division).toBe(2)
    for (const d of [1, 2, 3]) expect(s2.teams.filter(t => t.division === d)).toHaveLength(16)
  })

  it('writes the season into history and restarts the calendar', () => {
    const s = playSeason(7)
    const s2 = newSeason(s)
    expect(s2.history).toHaveLength(1)
    expect(s2.history[0].season).toBe(1)
    expect(s2.history[0].champions).toHaveLength(3)
    expect(s2.season).toBe(2)
    expect(s2.round).toBe(1)
    expect(s2.fixtures).toHaveLength(720)
    expect(s2.fixtures.every(f => f.homeGoals === null)).toBe(true)
    expect(s2.cupFixtures).toHaveLength(16)
    expect(s2.cupFixtures.every(f => f.cupRound === 1 && f.winnerId === null)).toBe(true)
  })

  it('retires the old guard', () => {
    const s = playSeason(7)
    const s2 = newSeason(s)
    expect(Object.values(s2.players).every(p => p.age <= 36)).toBe(true) // 36+ retired before the +1 birthday
  })

  it('force-renews the cheapest expiring contracts so the user squad never drops below MIN_SQUAD', () => {
    const s0 = newGame(1)
    const user = s0.teams[0]
    const kept = user.playerIds.slice(0, 15)
    const expiring = kept.slice(0, 3)
    const players = { ...s0.players }
    for (const id of kept) players[id] = { ...players[id], age: 25, contractSeasons: expiring.includes(id) ? 1 : 2 }
    // make salaries unambiguous: expiring[2] is the priciest and must be the one who walks
    players[expiring[0]] = { ...players[expiring[0]], salary: 1000 }
    players[expiring[1]] = { ...players[expiring[1]], salary: 2000 }
    players[expiring[2]] = { ...players[expiring[2]], salary: 9000 }
    const s: GameState = {
      ...s0,
      players,
      teams: s0.teams.map(t => (t.id === user.id ? { ...t, playerIds: kept, lineup: [] } : t)),
    }
    const s2 = newSeason(s)
    const userAfter = s2.teams.find(t => t.id === user.id)!
    expect(s2.players[expiring[2]]).toBeUndefined() // priciest expiring walked
    expect(userAfter.playerIds).not.toContain(expiring[2])
    expect(s2.players[expiring[0]]).toBeDefined() // cheapest two force-renewed
    expect(s2.players[expiring[1]]).toBeDefined()
    expect(s2.players[expiring[0]].contractSeasons).toBeGreaterThanOrEqual(1)
    expect(userAfter.playerIds.length).toBeGreaterThanOrEqual(MIN_SQUAD)
  })
})
```

with imports extended: `newSeason` already imported; add `MIN_SQUAD` from `./transfers`, `standings` from `./standings`, and a local `playSeason` helper if the file does not already have one:

```ts
function playSeason(seed: number): GameState {
  let s = newGame(seed)
  for (let i = 0; i < totalRounds(s); i++) s = advanceRound(s)
  return s
}
```

(Note: the force-renew test keeps ages at 25 so retirement cannot interfere, and expects youth intake afterwards may add rookies — assertions only reference the crafted ids and the floor.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engine/season.test.ts src/engine/training.test.ts`
Expected: FAIL — no history, prizes unscaled, no retirement, no floor, seasonGoals survives aging

- [ ] **Step 3: Implement**

In `src/engine/training.ts`, `ageSquads`'s returned player literal gains `seasonGoals: 0`.

In `src/engine/season.ts`, imports gain:

```ts
import { drawFirstCupRound, drawNextCupRound } from './cup'
import { CUP_WEEKS, generateDivisionFixtures } from './fixtures'
import { adjustCash, DIVISION_FACTOR, runWeeklyFinances, TICKET_PRICE, userLedger } from './finance'
import { applyPromotionRelegation, ensureThreeDivisions, retirePlayers, seasonRecord, youthIntake } from './rollover'
import { MIN_SQUAD, renewalSalary, runTransfers } from './transfers'
```

(merge with what's already there; `generateFixtures` is no longer needed by this file). Replace `newSeason` entirely:

```ts
export function newSeason(state: GameState): GameState {
  if (state.gameOver) return state
  const rand = mulberry32(state.rngState)

  // the season's story is written before anything moves
  const history = [...state.history, seasonRecord(state)]

  let teams = state.teams
  let finances = state.finances
  const addEntry = (label: string, amount: number) => {
    finances = [...finances, { season: state.season, round: totalRounds(state), label, amount }].slice(-300)
  }

  // league prize money, scaled down the pyramid
  for (const division of [...new Set(state.teams.map(t => t.division))].sort()) {
    standings(state, division).forEach((row, i) => {
      const prize = Math.round((1_500_000 - i * 75_000) * (DIVISION_FACTOR[division] ?? 1))
      teams = adjustCash(teams, row.teamId, prize)
      if (row.teamId === state.userTeamId) addEntry(`Prize money (finished ${i + 1} in Division ${division})`, prize)
    })
  }

  // cup prizes
  if (state.cupFixtures.length > 0) {
    const final = state.cupFixtures.reduce((a, b) => (b.cupRound > a.cupRound ? b : a))
    if (final.cupRound === CUP_WEEKS.length && final.winnerId !== null) {
      const runnerUp = final.winnerId === final.homeId ? final.awayId : final.homeId
      teams = adjustCash(teams, final.winnerId, 1_000_000)
      teams = adjustCash(teams, runnerUp, 400_000)
      if (final.winnerId === state.userTeamId) addEntry('Cup winners prize', 1_000_000)
      if (runnerUp === state.userTeamId) addEntry('Cup runners-up prize', 400_000)
    }
  }

  // up and down the pyramid, judged on the final tables
  teams = applyPromotionRelegation(state, teams)

  // retirements
  let players: Record<number, Player> = { ...state.players }
  ;({ players, teams } = retirePlayers(players, teams, rand))

  // contracts: one season shorter; AI auto-renews; unrenewed user players walk,
  // but never below MIN_SQUAD — the cheapest expiring contracts force-renew first
  const userTeamNow = teams.find(t => t.id === state.userTeamId)!
  const expiring = userTeamNow.playerIds.filter(id => players[id].contractSeasons - 1 <= 0)
  const mustKeep = Math.max(0, MIN_SQUAD - (userTeamNow.playerIds.length - expiring.length))
  const forceRenewed = new Set(
    [...expiring].sort((a, b) => players[a].salary - players[b].salary).slice(0, mustKeep),
  )
  for (const team of teams) {
    for (const id of [...team.playerIds]) {
      const p = players[id]
      const remaining = p.contractSeasons - 1
      if (remaining > 0) {
        players[id] = { ...p, contractSeasons: remaining }
      } else if (team.id !== state.userTeamId || forceRenewed.has(id)) {
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

  // fresh legs and (for migrated worlds) the missing divisions
  ;({ players, teams } = youthIntake(players, teams, rand))
  ;({ players, teams } = ensureThreeDivisions(players, teams, rand))

  players = ageSquads(players, rand)

  const fixtures = [...new Set(teams.map(t => t.division))].sort().flatMap(d =>
    generateDivisionFixtures(teams.filter(t => t.division === d).map(t => t.id), rand),
  )

  return {
    ...state,
    teams,
    players,
    finances,
    history,
    season: state.season + 1,
    round: 1,
    fixtures,
    cupFixtures: drawFirstCupRound(teams, rand),
    transferList: [],
    incomingOffers: [],
    brokeRounds: 0,
    rngState: randInt(rand, 1, 2 ** 31 - 1),
  }
}
```

- [ ] **Step 4: Run the full suite**

Run: `npm test` and `npx tsc --noEmit`
Expected: PASS. If the Phase-3 "keeps the economy alive" test trips on the new world, investigate — the division economy is tuned to keep a mid-table club near break-even; do not weaken the threshold without understanding why.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: season rollover with prizes, pyramid, retirement, youth, and history"
```

---

### Task 9: Division-aware UI — header, banner, table, fixtures, cup replays

**Files:**
- Modify: `src/App.tsx`, `src/screens/MatchScreen.tsx`, `src/screens/TableScreen.tsx`, `src/screens/FixturesScreen.tsx`

**Interfaces:**
- Consumes: `standings(state, division)`; types
- Produces:
  - `MatchScreen` exports `interface MatchLike { homeId: number; awayId: number; homeGoals: number | null; awayGoals: number | null; events?: MatchEvent[] }` and its `fixture` prop becomes `MatchLike` (cup ties replay too)
  - `App`: header shows the division; `advance()` finds the user's match in league OR cup fixtures; season-over banner names the user-division champions, the cup winners, and warns about expiring contracts; nav gains `cup` and `history` tabs with placeholders (`<p>Cup screen coming next.</p>`, `<p>History screen coming next.</p>`)
  - `TableScreen` and `FixturesScreen` get a division `<select>` defaulting to the user's division

- [ ] **Step 1: MatchScreen accepts any played match**

In `src/screens/MatchScreen.tsx`, add and use:

```tsx
export interface MatchLike {
  homeId: number
  awayId: number
  homeGoals: number | null
  awayGoals: number | null
  events?: MatchEvent[]
}
```

and change `interface Props { fixture: Fixture; ... }` to `fixture: MatchLike` (drop the now-unused `Fixture` import; keep `MatchEvent`).

- [ ] **Step 2: Update App.tsx**

- Screen union: `type Screen = 'squad' | 'table' | 'fixtures' | 'cup' | 'transfers' | 'finance' | 'history'`; nav array matches that order.
- Replay state becomes `useState<MatchLike | null>(null)` (import `MatchLike` from `./screens/MatchScreen`).
- `advance()` searches both calendars:

```tsx
  const advance = () => {
    const next = advanceRound(state)
    const mine = (f: { homeId: number; awayId: number }) =>
      f.homeId === state.userTeamId || f.awayId === state.userTeamId
    const played =
      next.fixtures.find(f => f.round === state.round && mine(f)) ??
      next.cupFixtures.find(f => f.week === state.round && mine(f)) ??
      null
    setState(next)
    setReplay(played)
  }
```

- Header span becomes:

```tsx
        <span>
          {userTeam.name} (Div {userTeam.division}) — Season {state.season}, Week {Math.min(state.round, total)}/{total}
        </span>
```

- Champion banner: replace the `champion` computation and banner with:

```tsx
  const champion = seasonOver
    ? state.teams.find(t => t.id === standings(state, userTeam.division)[0].teamId)!
    : null
  const cupChampId = seasonOver ? cupWinner(state) : null
  const expiringCount = seasonOver
    ? userTeam.playerIds.filter(id => state.players[id].contractSeasons <= 1).length
    : 0
```

```tsx
      {champion && (
        <div className="banner">
          🏆 {champion.name} are the Division {userTeam.division} champions!
          {cupChampId !== null && <> · 🏆 {state.teams.find(t => t.id === cupChampId)!.name} win the Cup!</>}
          {expiringCount > 0 && (
            <> · ⚠ {expiringCount} contract{expiringCount > 1 ? 's' : ''} expire — unrenewed players leave
            (cheapest are kept automatically if the squad would drop below 14)</>
          )}
        </div>
      )}
```

with `import { cupWinner } from './engine/cup'`. Render placeholders for the new tabs:

```tsx
      {screen === 'cup' && <p>Cup screen coming next.</p>}
      {screen === 'history' && <p>History screen coming next.</p>}
```

- [ ] **Step 3: Division selects on Table and Fixtures**

`src/screens/TableScreen.tsx` — full replacement:

```tsx
import { useState } from 'react'
import { standings } from '../engine/standings'
import type { GameState } from '../engine/types'

export default function TableScreen({ state }: { state: GameState }) {
  const userDivision = state.teams.find(t => t.id === state.userTeamId)!.division
  const [division, setDivision] = useState(userDivision)
  const divisions = [...new Set(state.teams.map(t => t.division))].sort()
  const rows = standings(state, division)
  const name = (id: number) => state.teams.find(t => t.id === id)!.name
  return (
    <div>
      {divisions.length > 1 && (
        <div className="controls">
          <label>
            Division:{' '}
            <select value={division} onChange={e => setDivision(Number(e.target.value))}>
              {divisions.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
        </div>
      )}
      <table>
        <thead>
          <tr>
            <th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th>
            <th>GF</th><th>GA</th><th>GD</th><th>Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.teamId} className={r.teamId === state.userTeamId ? 'user' : ''}>
              <td>{i + 1}</td>
              <td>{name(r.teamId)}</td>
              <td>{r.played}</td><td>{r.won}</td><td>{r.drawn}</td><td>{r.lost}</td>
              <td>{r.goalsFor}</td><td>{r.goalsAgainst}</td>
              <td>{r.goalsFor - r.goalsAgainst}</td>
              <td><strong>{r.points}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

`src/screens/FixturesScreen.tsx` — add the same division select and scope the fixture filter; keep the existing report behavior. The filtered list becomes:

```tsx
  const userDivision = state.teams.find(t => t.id === state.userTeamId)!.division
  const [division, setDivision] = useState(userDivision)
  const divisions = [...new Set(state.teams.map(t => t.division))].sort()
  const divisionOf = (teamId: number) => state.teams.find(t => t.id === teamId)!.division
  const fixtures = state.fixtures.filter(f => f.round === round && divisionOf(f.homeId) === division)
```

with the select rendered next to the round navigation (same markup pattern as TableScreen), and an empty-week row when a cup week is selected:

```tsx
          {fixtures.length === 0 && (
            <tr><td colSpan={3}>Cup week — see the Cup tab.</td></tr>
          )}
```

- [ ] **Step 4: Verify manually**

Run: `npm test`, `npx tsc --noEmit`, `npm run build`, then `npm run dev` briefly:
- Header shows `(Div 3)` and `Week N/36`; table and fixtures default to Division 3 and switch divisions cleanly.
- Advance to week 4: if the user has a cup tie, the ticker replays it; fixtures screen shows "Cup week" for league divisions.
- Play to season end: the banner names your division's champions and the cup winners and warns about expiring contracts.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: division-aware header, banner, tables, fixtures, and cup replays"
```

---

### Task 10: Cup screen

**Files:**
- Create: `src/screens/CupScreen.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `CUP_WEEKS` from `../engine/fixtures`; `eventText` from `./MatchScreen`; types
- Produces: default export `CupScreen({ state })`

- [ ] **Step 1: Create `src/screens/CupScreen.tsx`**

```tsx
import { useState } from 'react'
import { CUP_WEEKS } from '../engine/fixtures'
import type { CupFixture, GameState } from '../engine/types'
import { eventText } from './MatchScreen'

const ROUND_NAMES = ['Round 1', 'Round 2', 'Round of 16', 'Quarter-finals', 'Semi-finals', 'Final']

export default function CupScreen({ state }: { state: GameState }) {
  const [selected, setSelected] = useState<CupFixture | null>(null)
  const name = (id: number) => state.teams.find(t => t.id === id)!.name
  if (state.cupFixtures.length === 0) return <p>No cup this season.</p>
  const rounds = [...new Set(state.cupFixtures.map(f => f.cupRound))].sort((a, b) => a - b)
  const final = state.cupFixtures.reduce((a, b) => (b.cupRound > a.cupRound ? b : a))
  const champion =
    final.cupRound === CUP_WEEKS.length && final.winnerId !== null ? name(final.winnerId) : null
  return (
    <div>
      {champion && <div className="banner">🏆 {champion} win the Cup!</div>}
      {rounds.map(r => (
        <div key={r}>
          <h3>{ROUND_NAMES[r - 1]} — week {CUP_WEEKS[r - 1]}</h3>
          <table>
            <tbody>
              {state.cupFixtures.filter(f => f.cupRound === r).map((f, i) => (
                <tr
                  key={i}
                  className={[f.homeId, f.awayId].includes(state.userTeamId) ? 'user' : ''}
                  onClick={() => setSelected(f.homeGoals !== null && f !== selected ? f : null)}
                  style={{ cursor: f.homeGoals !== null ? 'pointer' : 'default' }}
                >
                  <td className="home">{name(f.homeId)}</td>
                  <td>
                    {f.homeGoals === null ? 'vs' : `${f.homeGoals} – ${f.awayGoals}`}
                    {f.winnerId !== null && f.homeGoals === f.awayGoals ? ' (p)' : ''}
                  </td>
                  <td>{name(f.awayId)}</td>
                  <td>{f.winnerId === null ? '' : `${name(f.winnerId)} through`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {selected && (
        <div className="report">
          <h3>{name(selected.homeId)} {selected.homeGoals} – {selected.awayGoals} {name(selected.awayId)}</h3>
          <ul className="ticker">
            {(selected.events ?? []).map((e, i) => (
              <li key={i}><strong>{e.minute}'</strong> {eventText(e, state)} <em>({name(e.teamId)})</em></li>
            ))}
            {(selected.events ?? []).length === 0 && <li>No report available for this match.</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire into App**

Replace `{screen === 'cup' && <p>Cup screen coming next.</p>}` with `{screen === 'cup' && <CupScreen state={state} />}` and add `import CupScreen from './screens/CupScreen'`.

- [ ] **Step 3: Verify manually**

`npm test`, `npx tsc --noEmit`, `npm run build`, quick `npm run dev`: rounds appear as they are drawn, penalty ties show `(p)`, clicking a played tie shows its report, the final's winner gets the banner.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: cup screen with rounds, penalty markers, and match reports"
```

---

### Task 11: History screen and the friendlies toggle

**Files:**
- Create: `src/screens/HistoryScreen.tsx`
- Modify: `src/App.tsx`, `src/screens/SquadScreen.tsx`

**Interfaces:**
- Consumes: `SeasonRecord` via `state.history`
- Produces: default export `HistoryScreen({ state })`; a `playFriendlies` checkbox in the squad controls

- [ ] **Step 1: Create `src/screens/HistoryScreen.tsx`**

```tsx
import type { GameState } from '../engine/types'

export default function HistoryScreen({ state }: { state: GameState }) {
  const userName = state.teams.find(t => t.id === state.userTeamId)!.name
  const titles = state.history.filter(h => h.champions[0] === userName).length
  const cups = state.history.filter(h => h.cupWinner === userName).length
  if (state.history.length === 0) {
    return <p>No completed seasons yet — history is written at each season's end.</p>
  }
  return (
    <div>
      <p>
        Your honours: <strong>{titles}</strong> Division 1 title{titles === 1 ? '' : 's'} ·{' '}
        <strong>{cups}</strong> cup{cups === 1 ? '' : 's'}
      </p>
      <table>
        <thead>
          <tr><th>Season</th><th>D1 champions</th><th>Cup winners</th><th>Top scorer</th><th>Your finish</th></tr>
        </thead>
        <tbody>
          {state.history.slice().reverse().map(h => (
            <tr key={h.season}>
              <td>{h.season}</td>
              <td>{h.champions[0] ?? '—'}</td>
              <td>{h.cupWinner}</td>
              <td>{h.topScorer.player} ({h.topScorer.goals}) — {h.topScorer.team}</td>
              <td>Division {h.userDivision}, P{h.userPosition}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Wire into App and add the friendlies toggle**

In `src/App.tsx`: replace the history placeholder with `{screen === 'history' && <HistoryScreen state={state} />}` plus the import.

In `src/screens/SquadScreen.tsx`, append inside the `.controls` div (after the Auto-pick button):

```tsx
        {' '}
        <label>
          <input
            type="checkbox"
            checked={state.playFriendlies}
            onChange={e => {
              const playFriendlies = e.target.checked
              setState(s => ({ ...s, playFriendlies }))
            }}
          />{' '}
          Friendlies on free weeks
        </label>
```

- [ ] **Step 3: Verify manually**

`npm test`, `npx tsc --noEmit`, `npm run build`, quick `npm run dev`: history empty-state shows; after a season rollover a row appears with honours counted; the friendlies checkbox persists across reload and produces "Friendly gate receipts" ledger lines on free cup weeks.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: history screen with honours and a friendlies toggle"
```

---

### Task 12: Phase 4 acceptance check

**Files:** none new.

**Interfaces:** none — this is the spec's Phase 4 gate: *"a 10-season career from Division 3 to the title makes sense."*

- [ ] **Step 1: Full test suite**

Run: `npm test` and `npx tsc --noEmit` and `npm run build`
Expected: everything green.

- [ ] **Step 2: Play through**

Run: `npm run dev`, then:
- New game: you manage a Division 3 club; tables/fixtures default to Division 3; week counter reads /36.
- Cup weeks: round 1 appears on the Cup tab at week 4; Division 1 clubs join at week 9; penalty ties show `(p)`; your cup ties replay in the ticker.
- Enable friendlies, get eliminated (or advance past your tie), and confirm a "Friendly gate receipts" ledger line on the next free cup week.
- Finish the season: banner names your division champions + cup winners; history gains a row; promotion/relegation moves clubs; retired veterans vanish; a youth rookie appears in a thin squad; season 2 draws a fresh cup.
- Load-test the long game: advance through 2–3 seasons and confirm the pyramid holds (three 16-club divisions), finances stay playable in Division 3, and honours accumulate.

- [ ] **Step 3: Tag**

```bash
git add -A
git commit -m "chore: phase 4 complete" --allow-empty
git tag phase-4
```
