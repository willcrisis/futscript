# Futscript Phase 5 — Club Life Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Elifoot money loop — a real stadium (capacity, ticket price, expansion, maintenance), sponsors, fan mood driving attendance, stats pages, and multiple save slots with JSON export/import — plus the Phase-4 review backlog (goal-density retune, suspension semantics, retirement squad floor, composed migration test, week label).

**Architecture:** The engine stays pure TypeScript over one serializable `GameState` (now `version: 5`, migrations chained v1→v5). Stadium state lives on `Team` (`capacity`, `ticketPrice`, `fanMood`) with one shared finance code path for all 48 clubs; user-only actions (`expandStadium`, `setTicketPrice`) and the construction ticker live in a new `stadium.ts`. The attendance model becomes `min(capacity, interest × priceFactor × moodFactor)` and replaces the flat Phase-4 gate formula. `save.ts` grows a slot layer (3 slots + active-slot pointer + legacy-key adoption) with `migrateToCurrent` shared by load and import.

**Tech Stack:** Existing Vite + React + TypeScript (strict) + Vitest. No new dependencies. Typecheck with `npx tsc -b --force` (plain `tsc --noEmit` is a no-op in this repo).

## Prerequisite

Phase 4 merged (tag `phase-4`, 123/123 tests green on main).

## Global Constraints

- Local-only; engine purity (`src/engine/` no React/DOM — `save.ts` may touch `localStorage` via its default `storage` parameter only); pure functions; seeded RNG only (no `Math.random()`/`Date.now()` in the engine); money integer dollars (`Math.round`); TypeScript strict.
- Save schema becomes `version: 5`; `load()` migrates v1–v4. Saves move to slot keys `futscript-slot-<n>` (n = 1..3) with active-slot pointer `futscript-active-slot`; a legacy `futscript-save` key is adopted into slot 1 on first load and removed.
- Stadium: `INITIAL_CAPACITY = {1: 25_000, 2: 15_000, 3: 9_000}`; `ticketPrice` starts 15, user-settable, clamped 5–60; expansion tier `EXPANSION = { seats: 2000, cost: 600_000, weeks: 6 }`, one construction at a time, user-only (`ponytail:` AI clubs never expand); maintenance `round(capacity × 1.2)` weekly for every club (retuned at acceptance per Task 12's tuning note).
- Attendance: `interest = round((9_000 + 900 × (16 − position)) × (DIVISION_FACTOR[division] ?? 1))`; `priceFactor = (15 / ticketPrice) ** 1.5`; `moodFactor = 0.8 + (fanMood / 100) × 0.3` (retuned at acceptance per Task 12's tuning note); `attendance = max(0, min(capacity, round(interest × priceFactor × moodFactor) + randInt(−500, 500)))`; `gate = attendance × ticketPrice`. `DIVISION_FACTOR` (currently `{1: 1, 2: 0.8, 3: 0.6}`) now scales fan interest and league prizes.
- Sponsors: weekly `round(SPONSOR_BASE[division] × (0.5 + fanMood / 100))` for every club, `SPONSOR_BASE = {1: 40_000, 2: 24_000, 3: 15_000}` (retuned at acceptance per Task 12's tuning note; mood 50 → exactly the base). `SPONSOR_BASE` lives in `finance.ts` (stadium.ts imports from finance, never the reverse — no cycles).
- Fan mood: 0–100, starts 50; per played league/cup match: win +6, loss −5, 90-minute draw +1 to both (shootouts don't change mood); at rollover: division champions +20, cup winner +25, promoted +30, relegated −20 (cumulative, clamped).
- All-time scorers: `GameState.allTimeScorers: { playerId, player, team, goals }[]`, upserted at rollover from every player with `seasonGoals > 0` (keyed by playerId — ids are world-unique), sorted desc, capped at 50.
- Backlog absorptions: match engine `CHANCE_RATE` 0.1 → 0.2 (real goal density rises from ~1.2 to ~2.4 per match); `suspendedForRounds` ticks down only for clubs that played that week (`injuredForRounds` keeps ticking weekly — physio time, not matches); `youthIntake` tops the user squad up to `MIN_SQUAD`; a composed migrated-save → first-rollover → expansion test; FixturesScreen label "Round" → "Week".
- Economy stays `ponytail:`-tunable in the same places; the acceptance task re-runs the passive-survival balance probe (bar: ≥ 4/5 seeds survive two passive seasons).

## File Structure

- `src/engine/types.ts` — `Team` + stadium fields; `GameState` + `construction`, `allTimeScorers`, `version: 5`
- `src/engine/stadium.ts` — NEW: `INITIAL_CAPACITY`, `EXPANSION`, `clampMood`, `expandStadium`, `setTicketPrice`, `tickConstruction`
- `src/engine/save.ts` — v4→v5 migration; slot layer; `migrateToCurrent`, `exportSave`, `importSave`, `listSlots`, …
- `src/engine/finance.ts` — new attendance model, maintenance, sponsors
- `src/engine/match.ts` — `CHANCE_RATE` retune
- `src/engine/season.ts` — mood deltas, suspension-tick semantics, construction tick wiring, all-time scorer upsert
- `src/engine/rollover.ts` — youth floor top-up; stadium fields on generated clubs; rollover mood bumps helper
- `src/engine/newGame.ts` — stadium fields
- `src/screens/FinanceScreen.tsx` — stadium panel (capacity, price, expand, construction, mood)
- `src/screens/StatsScreen.tsx` — NEW: season top scorers + all-time list
- `src/screens/SavesScreen.tsx` — NEW: slots, export, import
- `src/App.tsx` — `stats` + `saves` tabs
- `src/screens/FixturesScreen.tsx` — week label

---

### Task 1: Types v5, stadium constants, migrations, world generation

**Files:**
- Modify: `src/engine/types.ts`, `src/engine/newGame.ts`, `src/engine/rollover.ts`, `src/engine/save.ts`
- Create: `src/engine/stadium.ts` (constants only in this task)
- Modify (helpers only): every test helper that builds `Team` literals
- Test: `src/engine/save.test.ts`

**Interfaces:**
- Produces (used by every later task):
  - `Team` gains `capacity: number`, `ticketPrice: number`, `fanMood: number`
  - `GameState` gains `construction: { addedCapacity: number; weeksLeft: number } | null`, `allTimeScorers: ScorerRecord[]`; `version: 5`
  - `interface ScorerRecord { playerId: number; player: string; team: string; goals: number }` (in types.ts)
  - `stadium.ts`: `INITIAL_CAPACITY: Record<number, number> = {1: 25_000, 2: 15_000, 3: 9_000}`, `EXPANSION = { seats: 2000, cost: 600_000, weeks: 6 }`, `clampMood(m: number): number` (0–100)
  - `migrateV4(s: any): GameState` chained into `load()`

- [ ] **Step 1: Write the failing migration test**

Add to `src/engine/save.test.ts` (and update the three existing migration tests' final-version expectations from 4 to 5, extending their `toMatchObject`s: team gains `capacity` by division, `ticketPrice: 15`, `fanMood: 50`; state gains `construction: null`, `allTimeScorers: []`):

```ts
it('migrates a v4 save to v5', () => {
  const storage = fakeStorage()
  const v4 = {
    version: 4, seed: 1, rngState: 1, season: 3, round: 12, userTeamId: 0,
    players: { 1: {
      id: 1, name: 'P1', age: 25, position: 'GK', level: 50,
      form: 0, fitness: 100, injuredForRounds: 0, suspendedForRounds: 0, yellowCards: 0,
      salary: 5000, contractSeasons: 2, seasonGoals: 3,
    } },
    teams: [
      { id: 0, name: 'T0', playerIds: [1], formation: '4-4-2', lineup: [1], tactic: 'normal', trainingStyle: 'normal', cash: 500_000, division: 3 },
      { id: 1, name: 'T1', playerIds: [], formation: '4-4-2', lineup: [], tactic: 'normal', trainingStyle: 'normal', cash: 500_000, division: 1 },
    ],
    fixtures: [], cupFixtures: [], history: [], playFriendlies: true,
    transferList: [], incomingOffers: [], loanBalance: 0, brokeRounds: 0, gameOver: false, finances: [],
  }
  storage.setItem('futscript-save', JSON.stringify(v4))
  const state = load(storage)
  expect(state!.version).toBe(5)
  expect(state!.season).toBe(3) // progress preserved
  expect(state!.playFriendlies).toBe(true)
  expect(state!.teams[0]).toMatchObject({ capacity: 9_000, ticketPrice: 15, fanMood: 50 }) // division 3
  expect(state!.teams[1]).toMatchObject({ capacity: 25_000 }) // division 1
  expect(state!.construction).toBeNull()
  expect(state!.allTimeScorers).toEqual([])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/save.test.ts`
Expected: FAIL — version 4 currently terminal

- [ ] **Step 3: Extend the types**

In `src/engine/types.ts`: `Team` gains (after `division`):

```ts
  capacity: number // stadium seats
  ticketPrice: number // dollars, user-settable 5-60
  fanMood: number // 0-100; drives attendance and sponsors
```

Add near `SeasonRecord`:

```ts
export interface ScorerRecord {
  playerId: number
  player: string
  team: string // last club they scored for
  goals: number
}
```

`GameState.version` becomes `5` and it gains:

```ts
  construction: { addedCapacity: number; weeksLeft: number } | null // user stadium expansion in progress
  allTimeScorers: ScorerRecord[] // top 50, updated at each rollover
```

- [ ] **Step 4: Create `src/engine/stadium.ts` (constants only — actions arrive in Task 6)**

```ts
// ponytail: stadium economy constants — retune here and nowhere else
export const INITIAL_CAPACITY: Record<number, number> = { 1: 25_000, 2: 15_000, 3: 9_000 }
export const EXPANSION = { seats: 2000, cost: 600_000, weeks: 6 }

export function clampMood(mood: number): number {
  return Math.max(0, Math.min(100, mood))
}
```

- [ ] **Step 5: Emit stadium fields from world generation**

In `src/engine/newGame.ts` (import `INITIAL_CAPACITY` from `./stadium`): the team literal gains

```ts
      capacity: INITIAL_CAPACITY[division],
      ticketPrice: 15,
      fanMood: 50,
```

and the returned state gains `construction: null, allTimeScorers: []` with `version: 5`.

In `src/engine/rollover.ts` (`ensureThreeDivisions`, same import): the generated team literal gains the same three fields (`capacity: INITIAL_CAPACITY[division]`).

- [ ] **Step 6: Chain the migration in save.ts**

`load()` gains `if (state?.version === 4) state = migrateV4(state)` and its terminal check becomes `version === 5`. `migrateV3`'s return type annotation becomes `any`. Add (import `INITIAL_CAPACITY` from `./stadium`):

```ts
function migrateV4(s: any): GameState {
  return {
    ...s,
    version: 5,
    teams: s.teams.map((t: any) => ({
      ...t,
      capacity: INITIAL_CAPACITY[t.division] ?? INITIAL_CAPACITY[3],
      ticketPrice: 15,
      fanMood: 50,
    })),
    construction: null,
    allTimeScorers: [],
  }
}
```

- [ ] **Step 7: Mechanically update test helpers**

Every `Team` literal in test helpers gains `capacity: 9_000, ticketPrice: 15, fanMood: 50`; full-`GameState` literals (only `standings.test.ts` `makeState`) gain `version: 5, construction: null, allTimeScorers: []`. Files: `lineup.test.ts` (`makeSquad`), `match.test.ts` (`makeTeam` + inline Team literals), `training.test.ts` (`makeTeam`), `standings.test.ts` (`makeState`).

- [ ] **Step 8: Run the full suite**

Run: `npm test` and `npx tsc -b --force`
Expected: PASS (123 + 1).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: v5 game state with stadium fields, construction, all-time scorers"
```

---

### Task 2: Backlog — goal-density retune and match-based suspensions

**Files:**
- Modify: `src/engine/match.ts`, `src/engine/season.ts`
- Test: `src/engine/season.test.ts` (+ literal updates where noted)

**Interfaces:**
- Consumes: existing engine
- Produces:
  - `CHANCE_RATE` becomes `0.2` (goal density ≈ 2.4/match instead of ~1.2)
  - In `advanceRound`, `suspendedForRounds` ticks down only for players whose club played this week; `injuredForRounds` ticks for everyone (physio time, not matches)

- [ ] **Step 1: Write the failing tests**

Add to `src/engine/season.test.ts`:

```ts
describe('backlog semantics', () => {
  it('goal density lands near 2.4 per match', () => {
    let s = newGame(41)
    s = { ...s, teams: adjustCash(s.teams, s.userTeamId, 50_000_000) } // bankruptcy must not truncate the sample
    for (let i = 0; i < totalRounds(s); i++) s = advanceRound(s)
    const played = s.fixtures.filter(f => f.homeGoals !== null)
    const goals = played.reduce((sum, f) => sum + f.homeGoals! + f.awayGoals!, 0)
    const density = goals / played.length
    expect(density).toBeGreaterThan(2.0)
    expect(density).toBeLessThan(3.0)
  })

  it('suspensions only count weeks the club actually plays', () => {
    let s = newGame(8)
    // week 4 is a cup week; division-1 clubs (not in cup round 1) rest
    const restingClub = s.teams.find(t => t.division === 1)!
    const restingPlayer = restingClub.lineup[3]
    const playingClub = s.cupFixtures[0].homeId
    const playingPlayer = s.teams.find(t => t.id === playingClub)!.lineup[3]
    for (let week = 1; week <= 3; week++) s = advanceRound(s)
    s = {
      ...s,
      players: {
        ...s.players,
        [restingPlayer]: { ...s.players[restingPlayer], suspendedForRounds: 2, injuredForRounds: 0 },
        [playingPlayer]: { ...s.players[playingPlayer], suspendedForRounds: 2, injuredForRounds: 0 },
      },
    }
    const s2 = advanceRound(s) // cup week
    expect(s2.players[restingPlayer].suspendedForRounds).toBe(2) // no match, no tick
    expect(s2.players[playingPlayer].suspendedForRounds).toBe(1) // club played (he sat it out)
  })

  it('injuries heal by the week regardless of the calendar', () => {
    let s = newGame(8)
    const restingClub = s.teams.find(t => t.division === 1)!
    const hurt = restingClub.lineup[4]
    for (let week = 1; week <= 3; week++) s = advanceRound(s)
    s = { ...s, players: { ...s.players, [hurt]: { ...s.players[hurt], injuredForRounds: 3 } } }
    const s2 = advanceRound(s) // cup week, club rests — physio still works
    expect(s2.players[hurt].injuredForRounds).toBe(2)
  })
})
```

Also update the existing discipline-density floor in this file: the line asserting `goals > played * 1.1` becomes `goals > played * 2.0` and its comment becomes `// ~2.4 goals/match after the Phase-5 retune, floored for variance`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engine/season.test.ts`
Expected: FAIL — density ~1.2; suspensions tick for resting clubs

- [ ] **Step 3: Implement**

In `src/engine/match.ts`: `const CHANCE_RATE = 0.1` becomes `const CHANCE_RATE = 0.2` and the tuning comment becomes `// Tuned for ~2.4 goals per match between even sides (defense outweighs attack in the share, so the rate is higher than intuition suggests). ponytail: retune here if seasons come out goal-starved or goal-flooded.`

In `src/engine/season.ts` (`advanceRound`), the counter tick-down block becomes (note it sits after `playingIds` is final — friendly participants included):

```ts
  // injuries heal by the week (physio time); bans only burn on matchdays the club plays
  let players: Record<number, Player> = Object.fromEntries(
    Object.values(state.players).map(p => {
      const clubPlayed = teams.some(t => playingIds.has(t.id) && t.playerIds.includes(p.id))
      return [p.id, {
        ...p,
        injuredForRounds: Math.max(0, p.injuredForRounds - 1),
        suspendedForRounds: clubPlayed ? Math.max(0, p.suspendedForRounds - 1) : p.suspendedForRounds,
      }]
    }),
  )
```

(Performance note: this is a per-player `some` over 48 teams — build a lookup first:)

```ts
  const playingPlayerIds = new Set(
    teams.filter(t => playingIds.has(t.id)).flatMap(t => t.playerIds),
  )
  let players: Record<number, Player> = Object.fromEntries(
    Object.values(state.players).map(p => [p.id, {
      ...p,
      injuredForRounds: Math.max(0, p.injuredForRounds - 1),
      suspendedForRounds: playingPlayerIds.has(p.id) ? Math.max(0, p.suspendedForRounds - 1) : p.suspendedForRounds,
    }]),
  )
```

Use the second (Set-based) version.

- [ ] **Step 4: Run the full suite**

Run: `npm test` and `npx tsc -b --force`
Expected: PASS. If any other statistical test trips on the new goal rate, update only its density literal (never its direction) and note it in the report.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: realistic goal density; suspensions burn only on club matchdays"
```

---

### Task 3: Backlog — retirement squad floor and the composed migration test

**Files:**
- Modify: `src/engine/rollover.ts`
- Test: `src/engine/rollover.test.ts`, `src/engine/save.test.ts`

**Interfaces:**
- Consumes: `MIN_SQUAD` from `./transfers`
- Produces: `youthIntake(players, teams, rand, userTeamId?: number)` — for the user's club, intake count becomes `max(normal count, MIN_SQUAD − squad size)` so retirement can never leave the user below the floor; `newSeason` passes `state.userTeamId`

- [ ] **Step 1: Write the failing tests**

Add to `src/engine/rollover.test.ts`:

```ts
it('tops the user squad back up to MIN_SQUAD after heavy retirement', () => {
  const s = newGame(3)
  const trimmed = s.teams.map(t => (t.id === s.userTeamId ? { ...t, playerIds: t.playerIds.slice(0, 11), lineup: [] } : t))
  const out = youthIntake(s.players, trimmed, mulberry32(4), s.userTeamId)
  const user = out.teams.find(t => t.id === s.userTeamId)!
  expect(user.playerIds.length).toBeGreaterThanOrEqual(14) // MIN_SQUAD
})

it('AI clubs keep the normal intake thresholds', () => {
  const s = newGame(3)
  const trimmed = s.teams.map(t => (t.id === 5 ? { ...t, playerIds: t.playerIds.slice(0, 11), lineup: [] } : t))
  const out = youthIntake(s.players, trimmed, mulberry32(4), s.userTeamId)
  expect(out.teams.find(t => t.id === 5)!.playerIds).toHaveLength(13) // 11 + 2, no user floor
})
```

Add to `src/engine/save.test.ts` (the composed migrated-world test — needs `newSeason` and `totalRounds` imports from `./season`):

```ts
it('a migrated 16-team world expands to three divisions at its first rollover', () => {
  const storage = fakeStorage()
  // minimal-but-valid v3 world: reuse a real 48-team game and keep only division 1,
  // stripping every v4/v5 field so the payload is version-3-shaped
  const base = newGame(77)
  const div1 = base.teams.filter(t => t.division === 1)
  const keep = new Set(div1.flatMap(t => t.playerIds))
  const { cupFixtures: _c, history: _h, playFriendlies: _p, construction: _k, allTimeScorers: _a, ...v3state } = base
  void _c; void _h; void _p; void _k; void _a
  const v3ish = {
    ...v3state,
    version: 3,
    fixtures: [],
    teams: div1.map(t => {
      const { division: _d, capacity: _cap, ticketPrice: _t, fanMood: _f, ...v3team } = t
      void _d; void _cap; void _t; void _f
      return v3team
    }),
    players: Object.fromEntries(
      Object.entries(base.players)
        .filter(([id]) => keep.has(Number(id)))
        .map(([id, p]) => {
          const { seasonGoals: _g, ...v3player } = p
          void _g
          return [id, v3player]
        }),
    ),
  }
  storage.setItem('futscript-save', JSON.stringify(v3ish))
  const migrated = load(storage)!
  expect(migrated.version).toBe(5)
  expect(migrated.teams).toHaveLength(16)
  expect(migrated.teams.every(t => t.division === 1)).toBe(true)
  // give it played fixtures so standings/prizes are meaningful, then roll over
  const played = { ...migrated, fixtures: generateFixtures(migrated.teams.map(t => t.id), mulberry32(1)).map(f => ({ ...f, homeGoals: 1, awayGoals: 0 })) }
  const next = newSeason(played)
  expect(next.teams).toHaveLength(48)
  for (const d of [1, 2, 3]) expect(next.teams.filter(t => t.division === d)).toHaveLength(16)
  expect(next.fixtures).toHaveLength(720)
  expect(next.cupFixtures).toHaveLength(16)
  expect(next.history).toHaveLength(1)
  expect(next.history[0].cupWinner).toBe('—')
  expect(next.history[0].champions).toHaveLength(1)
  expect(next.teams.every(t => t.capacity > 0 && t.fanMood >= 0)).toBe(true)
})
```

(Imports for this test: `generateFixtures` from `./fixtures`, `mulberry32` from `./rng`, `newGame` from `./newGame`, `newSeason` from `./season`, `Player` type. If the inline v3-shape stripping reads awkwardly, simplify it — the requirement is only: a version-3-shaped payload with 16 division-less teams, no v4/v5 fields, that `load()` accepts and `newSeason` then expands. Keep all the assertions.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engine/rollover.test.ts src/engine/save.test.ts`
Expected: FAIL — youthIntake has no userTeamId param; composed test fails on whatever the migration chain gets wrong (that's the point)

- [ ] **Step 3: Implement**

In `src/engine/rollover.ts` (import `MIN_SQUAD` from `./transfers`):

```ts
export function youthIntake(
  players: Record<number, Player>,
  teams: Team[],
  rand: () => number,
  userTeamId?: number,
): { players: Record<number, Player>; teams: Team[] } {
```

and the count line becomes:

```ts
    let count = team.playerIds.length >= 20 ? 0 : team.playerIds.length < 16 ? 2 : 1
    if (team.id === userTeamId) count = Math.max(count, MIN_SQUAD - team.playerIds.length)
```

In `src/engine/season.ts` (`newSeason`), the call becomes `youthIntake(players, teams, rand, state.userTeamId)`.

- [ ] **Step 4: Run the full suite**

Run: `npm test` and `npx tsc -b --force`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: user youth floor after retirement; composed migration-expansion test"
```

---

### Task 4: The stadium attendance model — gates, maintenance, sponsors

**Files:**
- Modify: `src/engine/finance.ts`
- Test: `src/engine/finance.test.ts`

**Interfaces:**
- Consumes: `Team.capacity/ticketPrice/fanMood` (Task 1)
- Produces: `runWeeklyFinances` — for every club, every week: `− wages`, `− round(capacity × 1.5)` maintenance, `+ round(SPONSOR_BASE[division] × (0.5 + fanMood/100))` sponsors; on home weeks the gate uses the new attendance model (`min(capacity, interest × priceFactor × moodFactor + jitter) × ticketPrice`). User ledger entries: `'Wages'`, `'Stadium maintenance'`, `'Sponsors'`, `` `Gate receipts (${attendance} fans)` `` plus the existing interest/loan lines.

- [ ] **Step 1: Write the failing tests**

In `src/engine/finance.test.ts`, DELETE the Phase-4 "scales gate receipts by division" test (its bounds assume the retired flat formula) and add:

```ts
describe('stadium finances', () => {
  it('every club pays maintenance and earns mood-scaled sponsors weekly', () => {
    const s0 = newGame(1)
    const s1 = runWeeklyFinances(s0, mulberry32(2))
    const awayDiv1 = s1.teams.find(t =>
      t.division === 1 &&
      !s0.fixtures.some(f => f.round === 1 && f.homeId === t.id) &&
      t.id !== s0.userTeamId,
    )!
    const before = s0.teams.find(t => t.id === awayDiv1.id)!
    // away week: wages out, maintenance out, sponsors in — nothing else
    const expected = before.cash - wageBill(awayDiv1.id, s0) - Math.round(before.capacity * 1.5)
      + Math.round(SPONSOR_BASE[1] * (0.5 + before.fanMood / 100))
    expect(awayDiv1.cash).toBe(expected)
  })

  it('attendance is capped by capacity and scales with price and mood', () => {
    const s0 = newGame(1)
    // pump the user's mood and drop the price: the division-3 ground sells out
    const cheap = {
      ...s0,
      teams: s0.teams.map(t => (t.id === s0.userTeamId ? { ...t, ticketPrice: 5, fanMood: 100 } : t)),
    }
    // make the user play at home in week 1 by swapping their fixture if needed
    const userHome = cheap.fixtures.some(f => f.round === 1 && f.homeId === cheap.userTeamId)
    const withHome = userHome ? cheap : {
      ...cheap,
      fixtures: cheap.fixtures.map(f =>
        f.round === 1 && f.awayId === cheap.userTeamId ? { ...f, homeId: f.awayId, awayId: f.homeId } : f,
      ),
    }
    const s1 = runWeeklyFinances(withHome, mulberry32(3))
    const gate = s1.finances.find(e => e.label.startsWith('Gate receipts'))!
    const fans = Number(gate.label.match(/\((\d+) fans\)/)![1])
    expect(fans).toBe(9_000) // capacity-capped sellout
    expect(gate.amount).toBe(9_000 * 5)

    // same week at price 60 and mood 0: a sliver of the ground
    const dear = {
      ...withHome,
      teams: withHome.teams.map(t => (t.id === s0.userTeamId ? { ...t, ticketPrice: 60, fanMood: 0 } : t)),
    }
    const s2 = runWeeklyFinances(dear, mulberry32(3))
    const gate2 = s2.finances.find(e => e.label.startsWith('Gate receipts'))!
    const fans2 = Number(gate2.label.match(/\((\d+) fans\)/)![1])
    expect(fans2).toBeLessThan(1_500) // (15/60)^1.5 = 0.125, mood factor 0.6
    expect(fans2).toBeGreaterThanOrEqual(0)
  })

  it('user ledger carries the new lines', () => {
    const s1 = runWeeklyFinances(newGame(1), mulberry32(2))
    const labels = s1.finances.map(e => e.label)
    expect(labels).toContain('Wages')
    expect(labels).toContain('Stadium maintenance')
    expect(labels).toContain('Sponsors')
  })
})
```

with imports extended: `SPONSOR_BASE` from `./finance` (it is defined there in Step 3 — exported next to `DIVISION_FACTOR`, keeping stadium.ts → finance.ts imports one-directional).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engine/finance.test.ts`
Expected: FAIL — no maintenance/sponsor lines; old flat gate formula

- [ ] **Step 3: Implement**

In `src/engine/finance.ts`, add near the other constants (no stadium import — finance must stay import-upstream of stadium.ts):

```ts
const MAINTENANCE_PER_SEAT = 1.5
// ponytail: sponsor money — retune here and nowhere else
export const SPONSOR_BASE: Record<number, number> = { 1: 40_000, 2: 22_000, 3: 12_000 }
```

Inside `runWeeklyFinances`'s team map, after the wages deduction (`let cash = team.cash - wages`; the user's `addEntry('Wages', -wages)` stays), add:

```ts
    const maintenance = Math.round(team.capacity * MAINTENANCE_PER_SEAT)
    cash -= maintenance
    if (user) addEntry('Stadium maintenance', -maintenance)

    const sponsors = Math.round((SPONSOR_BASE[team.division] ?? SPONSOR_BASE[3]) * (0.5 + team.fanMood / 100))
    cash += sponsors
    if (user) addEntry('Sponsors', sponsors)
```

and replace the home-gate block's attendance/gate lines with the stadium model:

```ts
    if (homeThisRound.has(team.id)) {
      const interest = Math.round(
        (9_000 + 900 * (16 - position.get(team.id)!)) * (DIVISION_FACTOR[team.division] ?? 1),
      )
      const priceFactor = (15 / team.ticketPrice) ** 1.5
      const moodFactor = 0.6 + (team.fanMood / 100) * 0.6
      const attendance = Math.max(
        0,
        Math.min(team.capacity, Math.round(interest * priceFactor * moodFactor) + randInt(rand, -500, 500)),
      )
      const gate = attendance * team.ticketPrice
      cash += gate
      if (user) addEntry(`Gate receipts (${attendance} fans)`, gate)
    }
```

Update `DIVISION_FACTOR`'s comment to `// scales fan interest and league prizes down the pyramid`. `TICKET_PRICE` becomes unused by this function — keep the export (the friendly-gate code in season.ts still uses it; Task 5 leaves that flat friendly formula alone).

- [ ] **Step 4: Run the full suite**

Run: `npm test` and `npx tsc -b --force`
Expected: PASS. The Phase-4 cup-gate test ("pays a gate for a home cup tie") still holds — it asserts relational cash movement, not the formula. If a Phase-3-era finance test pins the old attendance arithmetic, update only its literals to the new model and say so in the report.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: stadium attendance model with maintenance and sponsors"
```

---

### Task 5: Fan mood dynamics

**Files:**
- Modify: `src/engine/season.ts`, `src/engine/rollover.ts`
- Test: `src/engine/season.test.ts`, `src/engine/rollover.test.ts`

**Interfaces:**
- Consumes: `clampMood` from `./stadium`
- Produces:
  - In `advanceRound`: after this week's league + cup results, each participant's `fanMood` moves (win +6, loss −5, 90-minute draw +1 both — shootout winners get the draw's +1)
  - `rolloverMood(state: GameState, teams: Team[]): Team[]` in rollover.ts — division champions +20, cup winner +25, promoted +30, relegated −20 (cumulative, judged on `state`'s final tables); `newSeason` applies it right after `applyPromotionRelegation`

- [ ] **Step 1: Write the failing tests**

Add to `src/engine/season.test.ts`:

```ts
describe('fan mood', () => {
  it('moves with results and stays clamped', () => {
    const s0 = newGame(9)
    const s1 = advanceRound(s0)
    const week1 = s1.fixtures.filter(f => f.round === 1)
    for (const f of week1) {
      const home = s1.teams.find(t => t.id === f.homeId)!
      const away = s1.teams.find(t => t.id === f.awayId)!
      if (f.homeGoals! > f.awayGoals!) {
        expect(home.fanMood).toBe(56)
        expect(away.fanMood).toBe(45)
      } else if (f.homeGoals! < f.awayGoals!) {
        expect(home.fanMood).toBe(45)
        expect(away.fanMood).toBe(56)
      } else {
        expect(home.fanMood).toBe(51)
        expect(away.fanMood).toBe(51)
      }
    }
  })

  it('never escapes 0..100', () => {
    let s = newGame(9)
    for (let i = 0; i < totalRounds(s); i++) s = advanceRound(s)
    for (const t of s.teams) {
      expect(t.fanMood).toBeGreaterThanOrEqual(0)
      expect(t.fanMood).toBeLessThanOrEqual(100)
    }
  })
})
```

Add to `src/engine/rollover.test.ts`:

```ts
describe('rolloverMood', () => {
  it('cheers champions, promotions, and cups; sours relegation', () => {
    const s = playSeason(13)
    const d1Champ = standings(s, 1)[0].teamId
    const d1Bottom = standings(s, 1).slice(-3).map(r => r.teamId)
    const d2Top = standings(s, 2).slice(0, 3).map(r => r.teamId)
    const teams = rolloverMood(s, s.teams)
    const moodOf = (id: number) => teams.find(t => t.id === id)!.fanMood
    const before = (id: number) => s.teams.find(t => t.id === id)!.fanMood
    expect(moodOf(d1Champ)).toBe(Math.min(100, before(d1Champ) + 20))
    for (const id of d2Top) expect(moodOf(id)).toBeGreaterThanOrEqual(Math.min(100, before(id) + 30)) // +30 promoted (+20 more if d2 champion)
    for (const id of d1Bottom) expect(moodOf(id)).toBe(Math.max(0, before(id) - 20))
  })
})
```

(`playSeason` helper already exists in rollover.test.ts from Phase 4; `rolloverMood` import joins the existing ones. Note the d2Top assertion uses `>=` because the D2 champion gets champion +20 AND promotion +30.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engine/season.test.ts src/engine/rollover.test.ts`
Expected: FAIL — mood never moves

- [ ] **Step 3: Implement**

In `src/engine/season.ts` (`advanceRound`), import `clampMood` from `./stadium`. After the `cupFixtures` mapping (and after the friendly block), insert:

```ts
  // fans react to results (friendlies don't count; shootout wins still feel like draws)
  const moodDelta = new Map<number, number>()
  const bump = (id: number, d: number) => moodDelta.set(id, (moodDelta.get(id) ?? 0) + d)
  for (const f of [...fixtures.filter(f => f.round === week), ...cupFixtures.filter(f => f.week === week)]) {
    if (f.homeGoals === null || f.awayGoals === null) continue
    if (f.homeGoals > f.awayGoals) { bump(f.homeId, 6); bump(f.awayId, -5) }
    else if (f.homeGoals < f.awayGoals) { bump(f.awayId, 6); bump(f.homeId, -5) }
    else { bump(f.homeId, 1); bump(f.awayId, 1) }
  }
  const teamsWithMood = teams.map(t =>
    moodDelta.has(t.id) ? { ...t, fanMood: clampMood(t.fanMood + moodDelta.get(t.id)!) } : t,
  )
```

and the state composition line uses `teamsWithMood`:

```ts
  let s: GameState = { ...state, teams: teamsWithMood, players, fixtures, cupFixtures }
```

(The `starters` set computed earlier keeps using `teams` — lineups are identical between the two arrays. One caveat: pre-resolved cup ties from other weeks are excluded because the loop filters on this week's fixtures only, and cup ties resolved in earlier weeks have `f.week !== week`.)

In `src/engine/rollover.ts`, add (imports gain `clampMood` from `./stadium` and `cupWinner` is already imported):

```ts
// season-end emotions: silverware and promotion lift the town, the drop empties it
export function rolloverMood(state: GameState, teams: Team[]): Team[] {
  const delta = new Map<number, number>()
  const bump = (id: number, d: number) => delta.set(id, (delta.get(id) ?? 0) + d)
  const divisions = [...new Set(state.teams.map(t => t.division))].sort()
  for (const division of divisions) {
    const table = standings(state, division)
    if (table.length === 0) continue
    bump(table[0].teamId, 20)
    if (division <= 2 && divisions.includes(division + 1)) {
      for (const row of table.slice(-3)) bump(row.teamId, -20) // relegated
    }
    if (division >= 2) {
      for (const row of table.slice(0, 3)) bump(row.teamId, 30) // promoted
    }
  }
  const champ = cupWinner(state)
  if (champ !== null) bump(champ, 25)
  return teams.map(t => (delta.has(t.id) ? { ...t, fanMood: clampMood(t.fanMood + delta.get(t.id)!) } : t))
}
```

In `src/engine/season.ts` (`newSeason`), right after `teams = applyPromotionRelegation(state, teams)` add:

```ts
  teams = rolloverMood(state, teams)
```

(import `rolloverMood` alongside the other rollover imports).

Guard note: `rolloverMood`'s promotion/relegation bumps mirror `applyPromotionRelegation`'s guards — a single-division migrated world only gets the champion +20 (no `division + 1` present → no relegation bump; no division ≥ 2 → no promotion bump).

- [ ] **Step 4: Run the full suite**

Run: `npm test` and `npx tsc -b --force`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: fan mood reacts to results and season outcomes"
```

---

### Task 6: Stadium actions — expansion, ticket price, construction

**Files:**
- Modify: `src/engine/stadium.ts`, `src/engine/season.ts`
- Test: `src/engine/stadium.test.ts` (new)

**Interfaces:**
- Consumes: `adjustCash`, `userLedger` from `./finance`; `EXPANSION` (Task 1)
- Produces:
  - `expandStadium(state: GameState): GameState` — no-op when gameOver, already building, or cash < cost; otherwise cash −600k, `construction: { addedCapacity: 2000, weeksLeft: 6 }`, ledger entry
  - `setTicketPrice(state: GameState, price: number): GameState` — clamps 5–60 (rounded), user team only
  - `tickConstruction(state: GameState): GameState` — weekly decrement; at 0 the seats land on the user's `capacity` with a $0 ledger note; `advanceRound` calls it after `runWeeklyFinances`

- [ ] **Step 1: Write the failing tests**

`src/engine/stadium.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { adjustCash } from './finance'
import { newGame } from './newGame'
import { advanceRound } from './season'
import { EXPANSION, expandStadium, setTicketPrice } from './stadium'
import type { GameState } from './types'

function userTeam(s: GameState) {
  return s.teams.find(t => t.id === s.userTeamId)!
}

describe('setTicketPrice', () => {
  it('sets and clamps the user price only', () => {
    const s = newGame(1)
    expect(userTeam(setTicketPrice(s, 25)).ticketPrice).toBe(25)
    expect(userTeam(setTicketPrice(s, 1)).ticketPrice).toBe(5)
    expect(userTeam(setTicketPrice(s, 900)).ticketPrice).toBe(60)
    expect(setTicketPrice(s, 25).teams.find(t => t.id !== s.userTeamId)!.ticketPrice).toBe(15)
  })
})

describe('expandStadium', () => {
  it('starts construction, charges the cost, and refuses double-builds', () => {
    const s0 = newGame(1)
    const s1 = expandStadium(s0)
    expect(s1.construction).toEqual({ addedCapacity: EXPANSION.seats, weeksLeft: EXPANSION.weeks })
    expect(userTeam(s1).cash).toBe(userTeam(s0).cash - EXPANSION.cost)
    expect(s1.finances.some(e => e.amount === -EXPANSION.cost)).toBe(true)
    expect(expandStadium(s1)).toBe(s1) // one at a time
  })

  it('refuses when broke or sacked', () => {
    const s0 = newGame(1)
    const broke = { ...s0, teams: adjustCash(s0.teams, s0.userTeamId, -900_000) }
    expect(expandStadium(broke)).toBe(broke)
    const over = { ...s0, gameOver: true }
    expect(expandStadium(over)).toBe(over)
  })
})

describe('construction over the weeks', () => {
  it('finishes after EXPANSION.weeks advances and lands the seats', () => {
    let s = expandStadium(newGame(1))
    const before = userTeam(s).capacity
    for (let i = 0; i < EXPANSION.weeks - 1; i++) {
      s = advanceRound(s)
      expect(s.construction).not.toBeNull()
      expect(userTeam(s).capacity).toBe(before)
    }
    s = advanceRound(s)
    expect(s.construction).toBeNull()
    expect(userTeam(s).capacity).toBe(before + EXPANSION.seats)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engine/stadium.test.ts`
Expected: FAIL — actions not exported

- [ ] **Step 3: Implement**

Add to `src/engine/stadium.ts`:

```ts
import { adjustCash, userLedger } from './finance'
import type { GameState } from './types'

export function expandStadium(state: GameState): GameState {
  const user = state.teams.find(t => t.id === state.userTeamId)!
  if (state.gameOver || state.construction !== null || user.cash < EXPANSION.cost) return state
  return {
    ...state,
    construction: { addedCapacity: EXPANSION.seats, weeksLeft: EXPANSION.weeks },
    teams: adjustCash(state.teams, state.userTeamId, -EXPANSION.cost),
    finances: userLedger(state, `Stadium expansion (+${EXPANSION.seats} seats)`, -EXPANSION.cost),
  }
}

export function setTicketPrice(state: GameState, price: number): GameState {
  const clamped = Math.max(5, Math.min(60, Math.round(price)))
  return {
    ...state,
    teams: state.teams.map(t => (t.id === state.userTeamId ? { ...t, ticketPrice: clamped } : t)),
  }
}

export function tickConstruction(state: GameState): GameState {
  if (state.construction === null) return state
  const weeksLeft = state.construction.weeksLeft - 1
  if (weeksLeft > 0) return { ...state, construction: { ...state.construction, weeksLeft } }
  return {
    ...state,
    construction: null,
    teams: state.teams.map(t =>
      t.id === state.userTeamId ? { ...t, capacity: t.capacity + state.construction!.addedCapacity } : t,
    ),
    finances: userLedger(state, `Stadium expansion complete (+${state.construction.addedCapacity} seats)`, 0),
  }
}
```

In `src/engine/season.ts` (`advanceRound`), import `tickConstruction` from `./stadium` and add after `s = runWeeklyFinances(s, rand)`:

```ts
  s = tickConstruction(s)
```

- [ ] **Step 4: Run the full suite**

Run: `npm test` and `npx tsc -b --force`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: stadium expansion, ticket pricing, and construction ticks"
```

---

### Task 7: All-time scorers

**Files:**
- Modify: `src/engine/season.ts`
- Test: `src/engine/season.test.ts`

**Interfaces:**
- Consumes: `ScorerRecord` from `./types`
- Produces: in `newSeason`, immediately after the history append (so it reads the untouched `state.players`), `allTimeScorers` is upserted from every player with `seasonGoals > 0` (keyed by `playerId`; `team` updated to the club they scored for this season), sorted by goals desc, capped at 50, and carried in the returned state

- [ ] **Step 1: Write the failing test**

Add to `src/engine/season.test.ts`:

```ts
describe('all-time scorers', () => {
  it('accumulates season goals across rollovers and survives retirement', () => {
    const s = playSeason(7)
    const seasonTotal = Object.values(s.players).reduce((sum, p) => sum + p.seasonGoals, 0)
    const s2 = newSeason(s)
    const listTotal = s2.allTimeScorers.reduce((sum, e) => sum + e.goals, 0)
    expect(listTotal).toBe(seasonTotal) // season 1: list total equals the season's goals (fewer than 50 scorers is fine either way for totals only if list is uncapped — see below)
    expect(s2.allTimeScorers.length).toBeLessThanOrEqual(50)
    expect([...s2.allTimeScorers].sort((a, b) => b.goals - a.goals)).toEqual(s2.allTimeScorers)
    // a second season accumulates onto existing entries
    let s3 = s2
    for (let i = 0; i < totalRounds(s3) && !s3.gameOver; i++) s3 = advanceRound(s3)
    const repeatId = s3.allTimeScorers?.[0]?.playerId
    const s4 = newSeason({ ...s3, gameOver: false })
    if (repeatId !== undefined && s4.players[repeatId]) {
      const before = s2.allTimeScorers.find(e => e.playerId === repeatId)?.goals ?? 0
      const after = s4.allTimeScorers.find(e => e.playerId === repeatId)?.goals ?? 0
      expect(after).toBeGreaterThanOrEqual(before)
    }
    expect(s4.allTimeScorers.length).toBeLessThanOrEqual(50)
  })
})
```

Note on the first assertion: if season 1 produces more than 50 distinct scorers, the cap makes `listTotal < seasonTotal`. Guard it:

```ts
    const distinctScorers = Object.values(s.players).filter(p => p.seasonGoals > 0).length
    if (distinctScorers <= 50) expect(listTotal).toBe(seasonTotal)
    else expect(listTotal).toBeLessThanOrEqual(seasonTotal)
```

Use the guarded version.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/season.test.ts`
Expected: FAIL — allTimeScorers stays empty

- [ ] **Step 3: Implement**

In `src/engine/season.ts` (`newSeason`), after the `history` line add:

```ts
  // the record books remember every goal, even after retirement
  const scorers = new Map(state.allTimeScorers.map(e => [e.playerId, { ...e }]))
  for (const p of Object.values(state.players)) {
    if (p.seasonGoals === 0) continue
    const club = state.teams.find(t => t.playerIds.includes(p.id))
    const entry = scorers.get(p.id)
    if (entry) {
      entry.goals += p.seasonGoals
      entry.team = club?.name ?? entry.team
    } else {
      scorers.set(p.id, { playerId: p.id, player: p.name, team: club?.name ?? '—', goals: p.seasonGoals })
    }
  }
  const allTimeScorers = [...scorers.values()].sort((a, b) => b.goals - a.goals).slice(0, 50)
```

and add `allTimeScorers,` to the returned object literal.

- [ ] **Step 4: Run the full suite**

Run: `npm test` and `npx tsc -b --force`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: all-time scorer records accumulate at rollover"
```

---

### Task 8: Save slots, export, import

**Files:**
- Modify: `src/engine/save.ts`
- Test: `src/engine/save.test.ts`

**Interfaces:**
- Consumes: the migration chain (Tasks 1 and prior phases)
- Produces (SavesScreen consumes these; `App` keeps calling `save(state)`/`load()` unchanged):
  - `SLOTS = [1, 2, 3]`
  - `migrateToCurrent(raw: unknown): GameState | null` — the v1→v5 chain extracted; returns null unless it lands on version 5
  - `activeSlot(storage?): number` (default 1), `setActiveSlot(slot: number, storage?): void`
  - `save(state, storage?)` — writes to the active slot's key `futscript-slot-<n>`
  - `load(storage?)` — adopts a legacy `futscript-save` key into slot 1 (then removes it) if slot 1 is empty, then loads + migrates the active slot
  - `loadSlot(slot, storage?): GameState | null`, `saveToSlot(state, slot, storage?): void`, `deleteSlot(slot, storage?): void`
  - `interface SlotInfo { slot: number; season: number; teamName: string; division: number; cash: number }`; `listSlots(storage?): (SlotInfo | null)[]`
  - `exportSave(state): string`, `importSave(json: string): GameState | null`

- [ ] **Step 1: Write the failing tests**

Add to `src/engine/save.test.ts`:

```ts
import {
  activeSlot, deleteSlot, exportSave, importSave, listSlots, load, loadSlot,
  save, saveToSlot, setActiveSlot,
} from './save'
```

```ts
describe('save slots', () => {
  it('adopts a legacy save into slot 1 and keeps loading it', () => {
    const storage = fakeStorage()
    storage.setItem('futscript-save', JSON.stringify(newGame(5)))
    const state = load(storage)
    expect(state).not.toBeNull()
    expect(storage.getItem('futscript-save')).toBeNull() // legacy key removed
    expect(storage.getItem('futscript-slot-1')).not.toBeNull()
    expect(activeSlot(storage)).toBe(1)
  })

  it('saves to the active slot and round-trips per slot', () => {
    const storage = fakeStorage()
    const a = newGame(1)
    const b = newGame(2)
    save(a, storage) // active defaults to 1
    setActiveSlot(2, storage)
    save(b, storage)
    expect(load(storage)!.seed).toBe(2) // active slot 2
    setActiveSlot(1, storage)
    expect(load(storage)!.seed).toBe(1)
    expect(loadSlot(2, storage)!.seed).toBe(2)
  })

  it('lists slot summaries and deletes', () => {
    const storage = fakeStorage()
    const s = newGame(3)
    saveToSlot(s, 2, storage)
    const slots = listSlots(storage)
    expect(slots[0]).toBeNull()
    expect(slots[1]).toMatchObject({ slot: 2, season: 1, division: 3 })
    expect(slots[1]!.teamName).toBe(s.teams[0].name)
    deleteSlot(2, storage)
    expect(listSlots(storage)[1]).toBeNull()
  })

  it('exports and imports across versions', () => {
    const s = newGame(4)
    const round = importSave(exportSave(s))
    expect(round).toEqual(s)
    // an old v3-era export still imports via the migration chain
    const v3ish: Record<string, unknown> = { ...JSON.parse(exportSave(s)) }
    v3ish.version = 4
    delete v3ish.construction
    delete v3ish.allTimeScorers
    ;(v3ish.teams as Record<string, unknown>[]).forEach(t => {
      delete t.capacity; delete t.ticketPrice; delete t.fanMood
    })
    const imported = importSave(JSON.stringify(v3ish))
    expect(imported).not.toBeNull()
    expect(imported!.version).toBe(5)
    expect(importSave('not json at all')).toBeNull()
    expect(importSave('{"version": 999}')).toBeNull()
  })
})
```

(The pre-existing migration tests that plant `futscript-save` directly keep working through the adoption path — their `load(storage)` still returns the migrated state.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engine/save.test.ts`
Expected: FAIL — slot functions not exported

- [ ] **Step 3: Implement**

Restructure `src/engine/save.ts` (migration functions `migrateV1..migrateV4` stay exactly as they are):

```ts
const LEGACY_KEY = 'futscript-save'
const SLOT_KEY = (slot: number) => `futscript-slot-${slot}`
const ACTIVE_KEY = 'futscript-active-slot'
export const SLOTS = [1, 2, 3]

// The one migration entry point: raw parsed JSON in, current GameState (or null) out.
export function migrateToCurrent(raw: unknown): GameState | null {
  try {
    let state = raw as any
    if (state?.version === 1) state = migrateV1(state)
    if (state?.version === 2) state = migrateV2(state)
    if (state?.version === 3) state = migrateV3(state)
    if (state?.version === 4) state = migrateV4(state)
    return state?.version === 5 ? (state as GameState) : null
  } catch {
    return null
  }
}

export function activeSlot(storage: Storage = localStorage): number {
  const raw = Number(storage.getItem(ACTIVE_KEY))
  return SLOTS.includes(raw) ? raw : 1
}

export function setActiveSlot(slot: number, storage: Storage = localStorage): void {
  if (SLOTS.includes(slot)) storage.setItem(ACTIVE_KEY, String(slot))
}

function parseSlot(slot: number, storage: Storage): GameState | null {
  const raw = storage.getItem(SLOT_KEY(slot))
  if (!raw) return null
  try {
    return migrateToCurrent(JSON.parse(raw))
  } catch {
    return null
  }
}

export function save(state: GameState, storage: Storage = localStorage): void {
  storage.setItem(SLOT_KEY(activeSlot(storage)), JSON.stringify(state))
}

export function load(storage: Storage = localStorage): GameState | null {
  const legacy = storage.getItem(LEGACY_KEY)
  if (legacy && !storage.getItem(SLOT_KEY(1))) {
    storage.setItem(SLOT_KEY(1), legacy)
    storage.removeItem(LEGACY_KEY)
  }
  return parseSlot(activeSlot(storage), storage)
}

export function loadSlot(slot: number, storage: Storage = localStorage): GameState | null {
  return parseSlot(slot, storage)
}

export function saveToSlot(state: GameState, slot: number, storage: Storage = localStorage): void {
  if (SLOTS.includes(slot)) storage.setItem(SLOT_KEY(slot), JSON.stringify(state))
}

export function deleteSlot(slot: number, storage: Storage = localStorage): void {
  storage.removeItem(SLOT_KEY(slot))
}

export interface SlotInfo {
  slot: number
  season: number
  teamName: string
  division: number
  cash: number
}

export function listSlots(storage: Storage = localStorage): (SlotInfo | null)[] {
  return SLOTS.map(slot => {
    const state = parseSlot(slot, storage)
    if (!state) return null
    const user = state.teams.find(t => t.id === state.userTeamId)!
    return { slot, season: state.season, teamName: user.name, division: user.division, cash: user.cash }
  })
}

export function exportSave(state: GameState): string {
  return JSON.stringify(state)
}

export function importSave(json: string): GameState | null {
  try {
    return migrateToCurrent(JSON.parse(json))
  } catch {
    return null
  }
}
```

(The old `load` body's version chain moves into `migrateToCurrent`; nothing else keeps a copy.)

- [ ] **Step 4: Run the full suite**

Run: `npm test` and `npx tsc -b --force`
Expected: PASS — including all pre-existing migration tests, which now flow through adoption + `migrateToCurrent`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: three save slots with legacy adoption, export, and import"
```

---

### Task 9: Stadium panel on the finance screen (+ week label)

**Files:**
- Modify: `src/screens/FinanceScreen.tsx`, `src/screens/FixturesScreen.tsx`, `src/index.css`

**Interfaces:**
- Consumes: `EXPANSION`, `expandStadium`, `setTicketPrice` from `../engine/stadium`; `formatMoney` (existing)
- Produces: UI only. This is a UI task: no unit tests; verification is `npm test` (no regressions), `npx tsc -b --force`, `npm run build`, brief dev smoke, stop. No interactive browser testing (acceptance covers it).

- [ ] **Step 1: Add the stadium panel to `src/screens/FinanceScreen.tsx`**

Add imports:

```tsx
import { EXPANSION, expandStadium, setTicketPrice } from '../engine/stadium'
```

Insert after the loan controls `<div className="controls">…</div>` block:

```tsx
      <h3>Stadium</h3>
      <p>
        Capacity: <strong>{user.capacity.toLocaleString('en-US')}</strong> seats ·
        Fan mood: {user.fanMood}/100 ·
        Maintenance: {formatMoney(Math.round(user.capacity * 1.5))}/wk
      </p>
      <div className="controls">
        <label>
          Ticket price:{' '}
          <input
            type="number"
            min={5}
            max={60}
            value={user.ticketPrice}
            style={{ width: '4rem' }}
            onChange={e => {
              const price = Number(e.target.value)
              setState(s => setTicketPrice(s, price))
            }}
          />
        </label>{' '}
        {state.construction ? (
          <span>
            🏗 +{state.construction.addedCapacity.toLocaleString('en-US')} seats ready in{' '}
            {state.construction.weeksLeft} week{state.construction.weeksLeft > 1 ? 's' : ''}
          </span>
        ) : (
          <button
            disabled={user.cash < EXPANSION.cost}
            onClick={() => setState(s => expandStadium(s))}
          >
            Expand +{EXPANSION.seats.toLocaleString('en-US')} seats ({formatMoney(EXPANSION.cost)}, {EXPANSION.weeks} wks)
          </button>
        )}
      </div>
```

- [ ] **Step 2: Week label**

In `src/screens/FixturesScreen.tsx`, the round-nav label `Round {round}` becomes `Week {round}`.

- [ ] **Step 3: Verify**

`npm test`, `npx tsc -b --force`, `npm run build`, quick `npm run dev` smoke (page serves), stop.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: stadium panel with pricing and expansion; week labels"
```

---

### Task 10: Stats screen

**Files:**
- Create: `src/screens/StatsScreen.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `state.players` (live `seasonGoals`), `state.allTimeScorers`
- Produces: default export `StatsScreen({ state })`; App gains a `stats` tab (union + nav, between `cup` and `transfers`). UI task — same verification as Task 9.

- [ ] **Step 1: Create `src/screens/StatsScreen.tsx`**

```tsx
import type { GameState } from '../engine/types'

export default function StatsScreen({ state }: { state: GameState }) {
  const teamOf = (playerId: number) => state.teams.find(t => t.playerIds.includes(playerId))?.name ?? '—'
  const thisSeason = Object.values(state.players)
    .filter(p => p.seasonGoals > 0)
    .sort((a, b) => b.seasonGoals - a.seasonGoals)
    .slice(0, 15)
  return (
    <div>
      <h3>Top scorers — this season</h3>
      {thisSeason.length === 0 && <p>No goals yet.</p>}
      {thisSeason.length > 0 && (
        <table>
          <thead>
            <tr><th>#</th><th>Player</th><th>Club</th><th>Goals</th></tr>
          </thead>
          <tbody>
            {thisSeason.map((p, i) => (
              <tr key={p.id}>
                <td>{i + 1}</td><td>{p.name}</td><td>{teamOf(p.id)}</td><td><strong>{p.seasonGoals}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h3>All-time top scorers</h3>
      {state.allTimeScorers.length === 0 && <p>The record books open at the end of the first season.</p>}
      {state.allTimeScorers.length > 0 && (
        <table>
          <thead>
            <tr><th>#</th><th>Player</th><th>Last club</th><th>Goals</th></tr>
          </thead>
          <tbody>
            {state.allTimeScorers.slice(0, 20).map((e, i) => (
              <tr key={e.playerId}>
                <td>{i + 1}</td><td>{e.player}</td><td>{e.team}</td><td><strong>{e.goals}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire into App**

Screen union and nav array gain `'stats'` (after `'cup'`); render `{screen === 'stats' && <StatsScreen state={state} />}`; add the import.

- [ ] **Step 3: Verify and commit**

`npm test`, `npx tsc -b --force`, `npm run build`, dev smoke.

```bash
git add -A
git commit -m "feat: stats screen with season and all-time scorers"
```

---

### Task 11: Saves screen

**Files:**
- Create: `src/screens/SavesScreen.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `SLOTS`, `activeSlot`, `deleteSlot`, `exportSave`, `importSave`, `listSlots`, `loadSlot`, `saveToSlot`, `setActiveSlot` from `../engine/save`; `formatMoney` from `../engine/finance`
- Produces: default export `SavesScreen({ state, setState })`; App gains a `saves` tab (last in the nav). UI task — same verification as Task 9.

- [ ] **Step 1: Create `src/screens/SavesScreen.tsx`**

```tsx
import { useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { formatMoney } from '../engine/finance'
import {
  activeSlot, deleteSlot, exportSave, importSave, listSlots, loadSlot,
  saveToSlot, setActiveSlot, SLOTS,
} from '../engine/save'
import type { GameState } from '../engine/types'

interface Props {
  state: GameState
  setState: Dispatch<SetStateAction<GameState>>
}

export default function SavesScreen({ state, setState }: Props) {
  const [, bump] = useState(0) // slots live in localStorage; re-render after writes
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  const [importError, setImportError] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const slots = listSlots()
  const active = activeSlot()

  const refresh = () => bump(n => n + 1)

  const download = () => {
    const blob = new Blob([exportSave(state)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `futscript-season-${state.season}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const onImportFile = async (file: File) => {
    const imported = importSave(await file.text())
    if (!imported) {
      setImportError(true)
      return
    }
    setImportError(false)
    saveToSlot(imported, active)
    setState(imported)
    refresh()
  }

  return (
    <div>
      <h3>Save slots</h3>
      <table>
        <thead>
          <tr><th>Slot</th><th>Career</th><th></th></tr>
        </thead>
        <tbody>
          {SLOTS.map((slot, i) => {
            const info = slots[i]
            return (
              <tr key={slot} className={slot === active ? 'user' : ''}>
                <td>{slot}{slot === active ? ' (active)' : ''}</td>
                <td>
                  {info
                    ? `${info.teamName} — Season ${info.season}, Division ${info.division}, ${formatMoney(info.cash)}`
                    : 'empty'}
                </td>
                <td className="actions">
                  <button onClick={() => { saveToSlot(state, slot); setActiveSlot(slot); refresh() }}>
                    Save here
                  </button>
                  {info && slot !== active && (
                    <button onClick={() => {
                      const loaded = loadSlot(slot)
                      if (loaded) { setActiveSlot(slot); setState(loaded); refresh() }
                    }}>
                      Load
                    </button>
                  )}
                  {info && (confirmDelete === slot ? (
                    <>
                      <button onClick={() => { deleteSlot(slot); setConfirmDelete(null); refresh() }}>
                        Confirm delete
                      </button>
                      <button onClick={() => setConfirmDelete(null)}>✕</button>
                    </>
                  ) : (
                    <button onClick={() => setConfirmDelete(slot)}>Delete</button>
                  ))}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <h3>Backup</h3>
      <div className="controls">
        <button onClick={download}>Export current game</button>{' '}
        <button onClick={() => fileInput.current?.click()}>Import from file…</button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={e => {
            const file = e.target.files?.[0]
            if (file) void onImportFile(file)
            e.target.value = ''
          }}
        />
        {importError && <p className="banner">⚠ That file is not a valid futscript save.</p>}
      </div>
      <p>Importing replaces the active slot. Deleting slot {active} (the active one) keeps your in-memory game until the next autosave.</p>
    </div>
  )
}
```

- [ ] **Step 2: Wire into App**

Screen union and nav gain `'saves'` (last); render `{screen === 'saves' && <SavesScreen state={state} setState={setState} />}`; add the import.

- [ ] **Step 3: Verify and commit**

`npm test`, `npx tsc -b --force`, `npm run build`, dev smoke.

```bash
git add -A
git commit -m "feat: saves screen with slots, export, and import"
```

---

### Task 12: Phase 5 acceptance check

**Files:** none new.

**Interfaces:** none — this is the spec's Phase 5 gate: *"the stadium↔fans↔results money loop feels like Elifoot."*

- [ ] **Step 1: Full suite + balance probe**

Run: `npm test`, `npx tsc -b --force`, `npm run build`.
Then re-run the passive balance probe (temporary scratch test, deleted afterwards): for seeds 1–5, play two passive seasons; the bar is ≥ 4/5 seeds survive (`gameOver === false`). The stadium model (maintenance vs sponsors at mood 50) was designed cash-neutral-ish against the Phase-4 economy; if more than one seed dies, retune `MAINTENANCE_PER_SEAT` / `SPONSOR_BASE` (one place each) rather than the attendance formula.

- [ ] **Step 2: Play in the browser**

- Finance tab: stadium panel shows capacity/mood/maintenance; drop the ticket price to 5 → next home gate sells out (capacity-capped attendance in the ledger label); raise to 60 → a sliver attends.
- Start an expansion: cash drops 600k, construction counter ticks weekly, capacity +2,000 on completion (ledger note).
- Fan mood moves with results (squad wins → mood up; check after a few rounds).
- Stats tab: live season scorers; after a rollover the all-time list appears and accumulates.
- Saves tab: save to slot 2, start a fresh game in slot 3, load slot 2 back; export downloads a JSON; re-import it; import garbage shows the error banner.
- Sponsors and maintenance lines appear weekly in the ledger.

- [ ] **Step 3: Tag**

```bash
git add -A
git commit -m "chore: phase 5 complete" --allow-empty
git tag phase-5
```
