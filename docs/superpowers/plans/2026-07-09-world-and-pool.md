# Fourth Division & Demotion Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grow the world to four divisions of sixteen, rebalance squad levels, and give the bottom division a one-season demotion pool — while existing 3-division saves keep working unchanged.

**Architecture:** New games build 68 clubs (64 active across 4 divisions + 4 pre-seeded in a demotion pool). A `Team.poolReturn?: number` marks a dormant club and the season it rejoins D4; `standings` and every full-league iteration filter dormant clubs out. The cup draw generalises to a bye-filled 64-slot bracket so it's clean for 64 clubs and reproduces today's behaviour for a migrated 48-club save. No save-version bump — `poolReturn` is an optional additive field.

**Tech Stack:** TypeScript, Vitest.

## Global Constraints

- Engine stays pure; randomness threaded through `rand`/`rngState`; money is integer dollars.
- Engine must be **generic over division count** — a v7 save has 3 divisions, a new game has 4. Never assume exactly 3 or 4 divisions, or that a specific number is the lowest.
- **No version bump.** `poolReturn` is optional and additive; old saves omit it and the pool never runs (they have no division 4).
- New i18n keys → both `en.ts` and `pt.ts` (this plan adds none; it is engine-only).
- Typecheck `npx tsc -b --force`; tests `npm test` / `npx vitest run <file>`.
- Commit trailers per repo convention.

## File Structure

| File | Change |
|------|--------|
| `src/engine/names.ts` | expand `TEAM_NAMES` 48 → 68 |
| `src/engine/finance.ts` | division-4 entries in `DIVISION_FACTOR`, `SPONSOR_BASE`; active filter in `runWeeklyFinances` |
| `src/engine/stadium.ts` | division-4 entry in `INITIAL_CAPACITY` |
| `src/engine/newGame.ts` | 4-tier `LEVEL_RANGE`, `DIVISION_OF`, 64 active clubs + 4 pooled, user starts D4, active-team fixtures |
| `src/engine/types.ts` | `Team.poolReturn?`, `isActive`/`activeTeams` helpers |
| `src/engine/standings.ts` | exclude dormant clubs |
| `src/engine/rollover.ts` | generic promotion/relegation (3↔4) |
| `src/engine/cup.ts` | generic bye-filled 64-slot bracket |
| `src/engine/season.ts` | demotion-pool rollover; active-team fixture regen |

---

### Task 1: Constants — names, level ranges, division-4 economy

**Files:**
- Modify: `src/engine/names.ts` (`TEAM_NAMES`)
- Modify: `src/engine/newGame.ts:20` (`LEVEL_RANGE`)
- Modify: `src/engine/finance.ts:12,26` (`DIVISION_FACTOR`, `SPONSOR_BASE`)
- Modify: `src/engine/stadium.ts:6` (`INITIAL_CAPACITY`)

**Interfaces:**
- Produces: 68 team names; `LEVEL_RANGE` with keys 1–4; economy maps with key 4.

- [ ] **Step 1: Expand `TEAM_NAMES` to 68**

`TEAM_NAMES` currently holds 48 names (the first array in `src/engine/names.ts`). Append 20 more entries in the same Brazilian-club style so the array length is exactly 68. Add after the existing last name (`'Lagoa Dourada'`):
```ts
  'Vitória do Cerrado', 'Grêmio Serrano', 'Náutico do Vale', 'Esperança FC',
  'União Barrense', 'Atlético Ipê', 'Rio Verde EC', 'Sport Colinas',
  'Guará AC', 'Flor do Campo', 'Cristal FC', 'Ypê Amarelo EC',
  'Anhanguera FC', 'Tocantins AC', 'Real Palmeira', 'Brava Costa FC',
  'Sol Nascente EC', 'Monte Belo AC', 'Vale do Aço FC', 'Jacarandá EC',
```

- [ ] **Step 2: Write the failing test**

Create `src/engine/world.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { TEAM_NAMES } from './names'
import { LEVEL_RANGE } from './newGame'

describe('world constants', () => {
  it('supplies 68 unique team names', () => {
    expect(TEAM_NAMES).toHaveLength(68)
    expect(new Set(TEAM_NAMES).size).toBe(68)
  })

  it('has a level range for all four divisions, narrower down low', () => {
    for (const d of [1, 2, 3, 4]) expect(LEVEL_RANGE[d]).toBeDefined()
    const span = (d: number) => LEVEL_RANGE[d][1] - LEVEL_RANGE[d][0]
    expect(span(4)).toBeLessThan(span(1))
    expect(span(3)).toBeLessThan(span(2))
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/engine/world.test.ts`
Expected: FAIL — `TEAM_NAMES` has 48; `LEVEL_RANGE[4]` undefined.

- [ ] **Step 4: Update the constants**

`src/engine/newGame.ts` line 20:
```ts
export const LEVEL_RANGE: Record<number, [number, number]> = {
  1: [58, 80], // span 22
  2: [46, 66], // span 20
  3: [40, 52], // span 12 — ponytail: lower divisions kept uniformly weak
  4: [30, 40], // span 10
}
```
`src/engine/finance.ts`:
```ts
export const DIVISION_FACTOR: Record<number, number> = { 1: 1, 2: 0.8, 3: 0.6, 4: 0.45 }
```
```ts
export const SPONSOR_BASE: Record<number, number> = { 1: 40_000, 2: 24_000, 3: 15_000, 4: 10_000 }
```
`src/engine/stadium.ts` line 6:
```ts
export const INITIAL_CAPACITY: Record<number, number> = { 1: 25_000, 2: 15_000, 3: 9_000, 4: 6_000 }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/engine/world.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**
```bash
git add src/engine/names.ts src/engine/newGame.ts src/engine/finance.ts src/engine/stadium.ts src/engine/world.test.ts
git commit -m "feat(engine): 4-tier level ranges + division-4 constants + 68 club names"
```

---

### Task 2: Four-division world generation

**Files:**
- Modify: `src/engine/newGame.ts` (`DIVISION_OF`, loop bound, user draw, fixtures)
- Test: `src/engine/world.test.ts`

**Interfaces:**
- Consumes: `LEVEL_RANGE` keys 1–4 (Task 1).
- Produces: `newGame(seed)` returns a world of **64 clubs**, 16 per division (1–4), the user's club a random **D4** club.

- [ ] **Step 1: Write the failing test**

Append to `src/engine/world.test.ts`:
```ts
import { newGame } from './newGame'

describe('newGame world', () => {
  it('builds 64 clubs across four divisions of 16', () => {
    const s = newGame(1)
    expect(s.teams).toHaveLength(64)
    for (const d of [1, 2, 3, 4]) {
      expect(s.teams.filter(t => t.division === d)).toHaveLength(16)
    }
  })

  it('starts the manager in a Division 4 club', () => {
    const s = newGame(7)
    const user = s.teams.find(t => t.id === s.userTeamId)!
    expect(user.division).toBe(4)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/engine/world.test.ts`
Expected: FAIL — 48 teams; user in D3.

- [ ] **Step 3: Implement**

In `src/engine/newGame.ts`:

Replace `DIVISION_OF` (line 18–19):
```ts
// ids 0-15 = Division 4 (user's club is a random draw among them), 16-31 D3, 32-47 D2, 48-63 D1
const DIVISION_OF = (index: number) => (index < 16 ? 4 : index < 32 ? 3 : index < 48 ? 2 : 1)
```

Change the world loop bound (line 28) from `t < 48` to `t < 64`.

Replace the fixtures line (line 63–65):
```ts
  const fixtures = [4, 3, 2, 1].flatMap(d =>
    generateDivisionFixtures(teams.filter(t => t.division === d).map(t => t.id), rand),
  )
```

Replace the user-club draw (lines 77–78):
```ts
  const divisionFour = teams.filter(t => t.division === 4)
  const userTeamId = divisionFour[randInt(rand, 0, divisionFour.length - 1)].id
```
(Update the surrounding comments referring to "Division 3" to "Division 4".)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/engine/world.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite**

Run: `npm test`
Expected: PASS — existing tests that call `newGame` still pass (division-generic; economy maps now have a D4 key). Investigate any failure that assumed 48 teams or D3-as-lowest and fix within this task if it's a hard-coded assumption the spec says to generalise.

- [ ] **Step 6: Commit**
```bash
git add src/engine/newGame.ts src/engine/world.test.ts
git commit -m "feat(engine): four divisions of 16, manager starts in D4"
```

---

### Task 3: Generic promotion & relegation (3 ↔ 4)

**Files:**
- Modify: `src/engine/rollover.ts` (`applyPromotionRelegation`)
- Test: `src/engine/rollover.test.ts`

**Interfaces:**
- Produces: `applyPromotionRelegation(state, teams)` promotes/relegates across **every adjacent division pair** present in the world (1↔2, 2↔3, 3↔4 for a 4-division world; unchanged for a 3-division save).

- [ ] **Step 1: Write the failing test**

Append to `src/engine/rollover.test.ts` (it already imports `applyPromotionRelegation`, `newGame`, `advanceRound` — add any missing). This test drives a full season so real standings exist:
```ts
describe('promotion/relegation across four divisions', () => {
  it('moves clubs between divisions 3 and 4', () => {
    let s = newGame(3)
    // play a whole season
    while (s.round <= 30 + 6) s = advanceRound(s)
    const before = new Map(s.teams.map(t => [t.id, t.division]))
    const moved = applyPromotionRelegation(s, s.teams)
    const changed = moved.filter(t => t.division !== before.get(t.id))
    // at least one D4 club promoted to D3 and one D3 club relegated to D4
    expect(changed.some(t => before.get(t.id) === 4 && t.division === 3)).toBe(true)
    expect(changed.some(t => before.get(t.id) === 3 && t.division === 4)).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/engine/rollover.test.ts`
Expected: FAIL — the current loop only covers `upper` of `[1, 2]`, so nothing moves between D3 and D4.

- [ ] **Step 3: Implement**

In `src/engine/rollover.ts`, replace the fixed `for (const upper of [1, 2])` in `applyPromotionRelegation` with a loop over every adjacent pair present:
```ts
export function applyPromotionRelegation(state: GameState, teams: Team[]): Team[] {
  const divisions = [...new Set(state.teams.map(t => t.division))].sort((a, b) => a - b)
  let next = teams
  for (const upper of divisions.slice(0, -1)) {
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
```
(`divisions.slice(0, -1)` drops the lowest division, whose relegations are handled by the pool in Task 7. For a 3-division save this yields `[1, 2]` — identical to today.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/engine/rollover.test.ts`
Expected: PASS. Then `npm test` — existing 3-division promotion tests still pass.

- [ ] **Step 5: Commit**
```bash
git add src/engine/rollover.ts src/engine/rollover.test.ts
git commit -m "feat(engine): promotion/relegation across every adjacent division"
```

---

### Task 4: Generic cup bracket (bye-filled 64 slots)

**Files:**
- Modify: `src/engine/cup.ts` (`drawFirstCupRound`, `drawNextCupRound`)
- Test: `src/engine/cup.test.ts`

**Interfaces:**
- Produces: a cup that fills a **64-slot round-1 bracket** — all clubs enter; when fewer than 64, the strongest (highest division, then squad strength) get round-1 byes. For 64 clubs → 0 byes (clean 6-round knockout). For 48 clubs → 16 byes to the D1 clubs (reproduces the current "top flight enters round 2").
- `drawNextCupRound` derives round-2 entrants as round-1 winners **plus** the clubs that received byes (active clubs that played no round-1 tie), with no stored bye state.

- [ ] **Step 1: Write the failing test**

Append to `src/engine/cup.test.ts` (imports `drawFirstCupRound`, `drawNextCupRound`, `newGame`, `mulberry32`, `CUP_WEEKS` — add missing):
```ts
describe('cup bracket sizing', () => {
  it('a 64-club world plays a clean 32-tie first round with no byes', () => {
    const s = newGame(1) // 64 clubs
    const r1 = drawFirstCupRound(s.teams, mulberry32(9))
    expect(r1).toHaveLength(32)
    const playing = new Set(r1.flatMap(f => [f.homeId, f.awayId]))
    expect(playing.size).toBe(64) // everyone plays
  })

  it('round 2 merges winners with bye clubs to 32 competitors', () => {
    let s = newGame(2)
    const rand = mulberry32(4)
    const r1 = drawFirstCupRound(s.teams, rand)
    // decide round 1 arbitrarily: home wins every tie
    const decided = r1.map(f => ({ ...f, homeGoals: 1, awayGoals: 0, winnerId: f.homeId }))
    s = { ...s, cupFixtures: decided }
    const r2 = drawNextCupRound(s, rand)
    const competitors = new Set(r2.flatMap(f => [f.homeId, f.awayId]))
    expect(competitors.size).toBe(32)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/engine/cup.test.ts`
Expected: FAIL — current `drawFirstCupRound` enters only non-D1 clubs (48), producing 24 ties, not 32.

- [ ] **Step 3: Implement**

Rewrite `src/engine/cup.ts`'s draw functions (keep `pairUp` and `cupWinner` as they are):
```ts
const BRACKET_SLOTS = 2 ** CUP_WEEKS.length // 64: a 6-round knockout

// active clubs, strongest first (top division first, then total squad level)
function seededEntrants(state: GameState): number[] {
  const active = state.teams.filter(t => t.poolReturn == null || t.poolReturn <= state.season)
  const strength = (t: Team) => t.playerIds.reduce((s, id) => s + (state.players[id]?.level ?? 0), 0)
  return [...active]
    .sort((a, b) => a.division - b.division || strength(b) - strength(a))
    .map(t => t.id)
}

// Round 1: fill a 64-slot bracket. The strongest clubs bye when there are fewer than 64 entrants.
export function drawFirstCupRound(teams: Team[], rand: () => number): CupFixture[] {
  // build a throwaway state view so seeding can read player levels via the caller's teams
  return drawFirstFromEntrants(teams, rand)
}
```
Because `drawFirstCupRound` is called with `teams` (not full `state`) from `newGame`, keep its signature but seed by division only when player levels aren't available; use a state-aware path from `newSeason`. Concretely, replace both draw functions with:
```ts
export function drawFirstCupRound(teams: Team[], rand: () => number): CupFixture[] {
  const active = teams.filter(t => t.poolReturn == null) // newGame/newSeason pass post-rollover teams; dormant excluded
  if (active.length < 2) return []
  // strongest first: top division first (player levels aren't threaded here, division is the proxy)
  const seeded = [...active].sort((a, b) => a.division - b.division).map(t => t.id)
  const byes = Math.max(0, BRACKET_SLOTS - seeded.length)
  const round1 = seeded.slice(byes) // the rest play round 1
  return pairUp(round1, 1, CUP_WEEKS[0], rand)
}

export function drawNextCupRound(state: GameState, rand: () => number): CupFixture[] {
  const lastRound = Math.max(0, ...state.cupFixtures.map(f => f.cupRound))
  if (lastRound === 0 || lastRound >= CUP_WEEKS.length) return []
  const ties = state.cupFixtures.filter(f => f.cupRound === lastRound)
  if (ties.some(f => f.winnerId === null)) return []
  let entrants = ties.map(f => f.winnerId!)
  if (lastRound === 1) {
    // bye clubs = active clubs that played no round-1 tie
    const played = new Set(state.cupFixtures.filter(f => f.cupRound === 1).flatMap(f => [f.homeId, f.awayId]))
    const byes = state.teams
      .filter(t => (t.poolReturn == null || t.poolReturn <= state.season) && !played.has(t.id))
      .map(t => t.id)
    entrants = [...entrants, ...byes]
  }
  if (entrants.length < 2) return []
  return pairUp(entrants, lastRound + 1, CUP_WEEKS[lastRound], rand)
}
```
Add `Team` to the `types` import in `cup.ts` if not already present. Remove the old `entrants.length < 2` "migrated 16-team world" comment block (superseded).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/engine/cup.test.ts`
Expected: PASS (64-club: 32 ties, 0 byes; round 2: 32 competitors). Then `npm test` — a migrated 48-team save still yields the D1-bye shape (seeded by division puts the 16 D1 clubs in the bye slice).

- [ ] **Step 5: Commit**
```bash
git add src/engine/cup.ts src/engine/cup.test.ts
git commit -m "feat(engine): generic bye-filled 64-slot cup bracket"
```

---

### Task 5: `poolReturn` field + dormant-club exclusion

**Files:**
- Modify: `src/engine/types.ts` (`Team.poolReturn?`, `isActive`/`activeTeams`)
- Modify: `src/engine/standings.ts` (exclude dormant)
- Modify: `src/engine/finance.ts` (`runWeeklyFinances` skips dormant)
- Test: `src/engine/standings.test.ts`

**Interfaces:**
- Produces:
  - `Team.poolReturn?: number` — the season a dormant (pooled) club rejoins D4; `undefined` = active.
  - `isActive(team: Team, season: number): boolean` = `team.poolReturn == null || team.poolReturn <= season`.
  - `activeTeams(state: GameState): Team[]`.
- `standings(state, division)` excludes dormant clubs; `runWeeklyFinances` leaves dormant clubs untouched.

- [ ] **Step 1: Write the failing test**

Append to `src/engine/standings.test.ts`:
```ts
import { newGame } from './newGame'

describe('standings excludes pooled clubs', () => {
  it('omits a club whose poolReturn is in the future', () => {
    const s0 = newGame(1)
    const d4 = s0.teams.filter(t => t.division === 4)
    const pooled = d4[0].id
    const s = { ...s0, teams: s0.teams.map(t => (t.id === pooled ? { ...t, poolReturn: s0.season + 1 } : t)) }
    const table = standings(s, 4)
    expect(table.some(r => r.teamId === pooled)).toBe(false)
    expect(table).toHaveLength(15) // 16 D4 clubs minus the pooled one
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/engine/standings.test.ts`
Expected: FAIL — the pooled club still appears (16 rows).

- [ ] **Step 3: Implement**

In `src/engine/types.ts`, add to `Team` (after `managerHiredSeason`):
```ts
  poolReturn?: number // set while dormant in the demotion pool; the season the club rejoins D4
```
And add helpers (near `isManaged`):
```ts
export function isActive(team: Team, season: number): boolean {
  return team.poolReturn == null || team.poolReturn <= season
}
export function activeTeams(state: GameState): Team[] {
  return state.teams.filter(t => isActive(t, state.season))
}
```

In `src/engine/standings.ts`, add the dormant guard inside the team loop:
```ts
  for (const t of state.teams) {
    if (t.division !== division) continue
    if (t.poolReturn != null && t.poolReturn > state.season) continue // dormant in the pool
    rows.set(t.id, { teamId: t.id, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 })
  }
```

In `src/engine/finance.ts` `runWeeklyFinances`, skip dormant clubs at the top of the `state.teams.map(team => …)` callback (dormancy is judged on `state.season`):
```ts
  const teams = state.teams.map(team => {
    if (team.poolReturn != null && team.poolReturn > state.season) return team // dormant: no wages, no gate
    const user = state.manager.employed && team.id === state.userTeamId
    // …rest of the callback unchanged…
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/engine/standings.test.ts`
Expected: PASS. Then `npm test` — nothing pools clubs yet, so all existing behaviour is unchanged.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc -b --force`
Expected: no errors.
```bash
git add src/engine/types.ts src/engine/standings.ts src/engine/finance.ts src/engine/standings.test.ts
git commit -m "feat(engine): poolReturn field + dormant-club exclusion"
```

---

### Task 6: Pre-seed four pool clubs at world-gen

**Files:**
- Modify: `src/engine/newGame.ts`
- Test: `src/engine/world.test.ts`

**Interfaces:**
- Consumes: `isActive` (Task 5).
- Produces: `newGame` builds **68 clubs** — 64 active + **4 dormant** with `poolReturn = 2`; each division still fields 16 **active** clubs in season 1.

- [ ] **Step 1: Write the failing test**

Append to `src/engine/world.test.ts`:
```ts
import { isActive } from './types'

describe('demotion pool seeding', () => {
  it('seeds four dormant clubs that rejoin in season 2', () => {
    const s = newGame(1)
    expect(s.teams).toHaveLength(68)
    const dormant = s.teams.filter(t => !isActive(t, s.season))
    expect(dormant).toHaveLength(4)
    expect(dormant.every(t => t.poolReturn === 2)).toBe(true)
    // every division still fields 16 active clubs in season 1
    for (const d of [1, 2, 3, 4]) {
      expect(s.teams.filter(t => t.division === d && isActive(t, s.season))).toHaveLength(16)
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/engine/world.test.ts`
Expected: FAIL — 64 teams, no dormant clubs.

- [ ] **Step 3: Implement**

In `src/engine/newGame.ts`, after the `for (let t = 0; t < 64; t++) { … }` world loop and before `for (const team of teams) team.lineup = autoPick(...)`, create the four pool clubs (ids 64–67, division 4, dormant):
```ts
  // four clubs wait in the demotion pool so D4 stays at 16 from the first rollover (they rejoin season 2)
  for (let t = 64; t < 68; t++) {
    const playerIds: number[] = []
    for (const position of SQUAD_TEMPLATE) {
      const level = randInt(rand, LEVEL_RANGE[4][0], LEVEL_RANGE[4][1])
      const player: Player = {
        id: nextPlayerId++, name: randomName(rand), age: randInt(rand, 17, 34), position, level,
        form: 0, fitness: 100, injuredForRounds: 0, suspendedForRounds: 0, yellowCards: 0,
        salary: salaryFor(level), contractSeasons: randInt(rand, 1, 3), seasonGoals: 0,
      }
      players[player.id] = player
      playerIds.push(player.id)
    }
    teams.push({
      id: t, name: TEAM_NAMES[t], playerIds, formation: '4-4-2', lineup: [], tactic: 'normal',
      trainingStyle: 'normal', cash: STARTING_CASH, division: 4, capacity: INITIAL_CAPACITY[4],
      ticketPrice: 15, fanMood: 50, manager: randomName(rand), managerHiredSeason: 0,
      poolReturn: 2,
    })
  }
```
The fixtures line already filters by `t.division === d`; add the active guard so the 4 dormant clubs are excluded from season-1 D4 fixtures:
```ts
  const fixtures = [4, 3, 2, 1].flatMap(d =>
    generateDivisionFixtures(teams.filter(t => t.division === d && isActive(t, 1)).map(t => t.id), rand),
  )
```
Import `isActive`:
```ts
import { isActive } from './types'
```
(and ensure `Player` is already imported — it is.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/engine/world.test.ts`
Expected: PASS. Then `npm test` — the cup draw already excludes `poolReturn != null` clubs (Task 4), so the 64 active clubs still make a clean bracket.

- [ ] **Step 5: Commit**
```bash
git add src/engine/newGame.ts src/engine/world.test.ts
git commit -m "feat(engine): pre-seed four demotion-pool clubs (68 total)"
```

---

### Task 7: Demotion-pool rollover

**Files:**
- Modify: `src/engine/season.ts` (`newSeason` — pool step + active-team fixture regen)
- Test: `src/engine/season.test.ts`

**Interfaces:**
- Consumes: `standings`, `isActive`.
- Behavior: at each rollover, gated on the world having a division 4:
  1. clubs whose `poolReturn === nextSeason` rejoin **D4** (`poolReturn` cleared);
  2. the **bottom 4** of the finished D4 table get `poolReturn = nextSeason + 1`.
  Fixtures for the new season are generated from **active** clubs only.

- [ ] **Step 1: Write the failing test**

Append to `src/engine/season.test.ts`:
```ts
describe('demotion pool rollover', () => {
  it('keeps D4 at 16 active while rotating the bottom four through the pool', () => {
    let s = newGame(5)
    for (let season = 0; season < 3; season++) {
      while (s.round <= 30 + 6) s = advanceRound(s)
      const finishedD4Bottom = standings(s, 4).slice(-4).map(r => r.teamId)
      s = newSeason(s)
      // exactly four clubs are dormant, and they are last season's bottom four
      const dormant = s.teams.filter(t => t.poolReturn != null && t.poolReturn > s.season).map(t => t.id)
      expect(dormant).toHaveLength(4)
      expect(new Set(dormant)).toEqual(new Set(finishedD4Bottom))
      // D4 still fields 16 active clubs
      expect(s.teams.filter(t => t.division === 4 && (t.poolReturn == null || t.poolReturn <= s.season))).toHaveLength(16)
    }
  })
})
```
(Ensure `standings` and `newSeason` are imported in `season.test.ts`.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/engine/season.test.ts`
Expected: FAIL — no pool step exists; the finished bottom four are not pooled and D4 active count drifts.

- [ ] **Step 3: Implement**

In `src/engine/season.ts` `newSeason`, immediately after the promotion/relegation block (the `teams = applyPromotionRelegation(state, teams)` line and its news loop, before `teams = rolloverMood(state, teams)`), insert the pool step:
```ts
  // demotion pool: the bottom division has no lower league — its worst clubs sit out one season.
  // Gated on a division 4 existing, so migrated 3-division saves keep their stand-still bottom.
  if (state.teams.some(t => t.division === 4)) {
    const nextSeason = state.season + 1
    // returns: clubs whose wait is up rejoin D4
    teams = teams.map(t => (t.poolReturn === nextSeason ? { ...t, division: 4, poolReturn: undefined } : t))
    // demote: the finished D4 bottom four wait one season
    const demoted = new Set(standings(state, 4).slice(-4).map(r => r.teamId))
    teams = teams.map(t => (demoted.has(t.id) ? { ...t, poolReturn: nextSeason + 1 } : t))
  }
```
Change the fixtures regeneration (currently line ~324) to build from **active** clubs for the new season:
```ts
  const nextSeason = state.season + 1
  const activeForNext = (t: Team) => t.poolReturn == null || t.poolReturn <= nextSeason
  const fixtures = [...new Set(teams.filter(activeForNext).map(t => t.division))].sort().flatMap(d =>
    generateDivisionFixtures(teams.filter(t => t.division === d && activeForNext(t)).map(t => t.id), rand),
  )
```
(If a `const nextSeason` already exists from the pool step above, reuse it rather than redeclaring — declare it once before the pool step and use it in both places.)

`drawFirstCupRound(teams, rand)` in the return object already excludes `poolReturn != null` clubs (Task 4), so a just-demoted club won't be entered in the new season's cup. No change needed there.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/engine/season.test.ts`
Expected: PASS. Then `npm test`.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc -b --force`
Expected: no errors.
```bash
git add src/engine/season.ts src/engine/season.test.ts
git commit -m "feat(engine): demotion-pool rollover keeps D4 at 16"
```

---

## Final verification

- [ ] `npm test` — all green.
- [ ] `npx tsc -b --force` — no errors.
- [ ] Drive a headless multi-season game from `newGame(1)` and assert every season: 4 divisions × 16 active clubs, 4 dormant, a clean 32-tie cup round 1.
- [ ] Load a real v7 (3-division) save via `migrateToCurrent` and confirm it still advances a season (pool dormant, cup uses D1 byes) — no crash, D3 remains the stand-still bottom.
- [ ] The remaining batch plans (cup extra-time/shootout, fixture balance, direct offers, UI polish) are separate files and can follow.
