# Futscript Phase 2 — Matchday Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Matches become minute-by-minute simulations with a watchable text ticker; players pick up cards, suspensions, and injuries; form, fitness, home advantage, tactics, training styles, and season-end aging make squads live and change.

**Architecture:** The engine stays pure TypeScript in `src/engine/` over one serializable `GameState` (now `version: 2`, with a v1→v2 migration in `save.ts`). `simulateMatch` is rewritten as a 90-minute event loop that returns a `MatchResult` with an event list; events are stored on fixtures for the UI to replay, and `advanceRound` derives all player consequences (cards, injuries, training, fitness, form) from them. The ticker is a pure-UI replay of stored events — the sim itself is still instant.

**Tech Stack:** Existing Vite + React + TypeScript (strict) + Vitest. No new dependencies.

## Global Constraints

- Local-only: no network calls, no backend. Persistence is localStorage.
- `src/engine/` must not import React or touch the DOM (exception: `save.ts` defaults `storage: Storage = localStorage`).
- All state changes are pure functions returning a new `GameState`; never mutate an existing state object.
- Randomness only via the seeded RNG (`mulberry32`) threaded through `rngState` — no `Math.random()`.
- Save schema becomes `version: 2`; `load()` must migrate a v1 save instead of discarding it.
- Player levels stay clamped to 1–99; form −3…+3; fitness 0–100.
- Existing Phase 1 behavior stays: 16 teams, 30 rounds, standings, save/load.

## File Structure

- `src/engine/types.ts` — extend `Player`, `Team`, `Fixture`; add `Tactic`, `TrainingStyle`, `MatchEvent`; `version: 2`
- `src/engine/lineup.ts` — availability-aware `autoPick`, new `isAvailable` + `patchLineup`
- `src/engine/match.ts` — rewritten minute-loop engine (`simulateMatch`, `effectiveLevel`, `MatchResult`)
- `src/engine/training.ts` — NEW: `applyWeeklyUpdates` (training gains, fitness, form), `ageSquads` (season end)
- `src/engine/season.ts` — `advanceRound` orchestration + `applyMatchConsequences`; `newSeason` ages squads
- `src/engine/save.ts` — v1→v2 migration
- `src/screens/MatchScreen.tsx` — NEW: ticker replay + `eventText`
- `src/screens/SquadScreen.tsx` — form/fitness/status columns, tactic + training pickers
- `src/screens/FixturesScreen.tsx` — click a played match to see its report
- `src/App.tsx` — show `MatchScreen` after advancing a round

---

### Task 1: Types v2, newGame fields, save migration

**Files:**
- Modify: `src/engine/types.ts`, `src/engine/newGame.ts`, `src/engine/save.ts`
- Modify (helpers only): `src/engine/lineup.test.ts`, `src/engine/match.test.ts`, `src/engine/standings.test.ts`
- Test: `src/engine/save.test.ts`

**Interfaces:**
- Consumes: existing Phase 1 types
- Produces (used by every later task):
  - `Player` gains `form: number` (−3…3), `fitness: number` (0–100), `injuredForRounds: number`, `suspendedForRounds: number`, `yellowCards: number`
  - `type Tactic = 'defensive' | 'normal' | 'attacking'`
  - `type TrainingStyle = 'light' | 'normal' | 'intensive' | 'youth'`
  - `Team` gains `tactic: Tactic`, `trainingStyle: TrainingStyle`
  - `interface MatchEvent { minute: number; type: 'goal' | 'chance' | 'yellow' | 'red' | 'injury'; teamId: number; playerId: number; playerInId?: number }`
  - `Fixture` gains `events?: MatchEvent[]`
  - `GameState.version` becomes `2`
  - `load()` migrates v1 saves

- [ ] **Step 1: Write the failing migration test**

Add to `src/engine/save.test.ts` (keep the existing tests; the `fakeStorage` helper is already there):

```ts
it('migrates a v1 save to v2 with default new fields', () => {
  const storage = fakeStorage()
  const v1 = {
    version: 1, seed: 1, rngState: 1, season: 1, round: 5, userTeamId: 0,
    players: { 1: { id: 1, name: 'P1', age: 25, position: 'GK', level: 50 } },
    teams: [{ id: 0, name: 'T0', playerIds: [1], formation: '4-4-2', lineup: [1] }],
    fixtures: [],
  }
  storage.setItem('futscript-save', JSON.stringify(v1))
  const state = load(storage)
  expect(state).not.toBeNull()
  expect(state!.version).toBe(2)
  expect(state!.round).toBe(5) // progress preserved
  expect(state!.players[1]).toMatchObject({
    level: 50, form: 0, fitness: 100, injuredForRounds: 0, suspendedForRounds: 0, yellowCards: 0,
  })
  expect(state!.teams[0]).toMatchObject({ tactic: 'normal', trainingStyle: 'normal' })
})
```

Also update the existing version-mismatch test: `version: 999` must still return null (unchanged), and the round-trip test still passes once `newGame` emits v2.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/save.test.ts`
Expected: FAIL — migration test gets `null` (version 1 rejected by current `load`)

- [ ] **Step 3: Extend the types**

In `src/engine/types.ts`, replace `Player`, add the new types, extend `Team`/`Fixture`/`GameState`:

```ts
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
```

Extend `Team`:

```ts
export interface Team {
  id: number
  name: string
  playerIds: number[]
  formation: FormationName
  lineup: number[] // 11 player ids, always valid for the formation
  tactic: Tactic
  trainingStyle: TrainingStyle
}
```

Extend `Fixture` with `events?: MatchEvent[]` (after `awayGoals`), and change `GameState.version` to `version: 2`.

- [ ] **Step 4: Emit the new fields from newGame**

In `src/engine/newGame.ts`, the generated player gains the new defaults:

```ts
const player: Player = {
  id: nextPlayerId++,
  name: randomName(rand),
  age: randInt(rand, 17, 34),
  position,
  level: randInt(rand, 30, 70),
  form: 0,
  fitness: 100,
  injuredForRounds: 0,
  suspendedForRounds: 0,
  yellowCards: 0,
}
```

The team literal gains `tactic: 'normal', trainingStyle: 'normal'`, and the returned state's `version` becomes `2`.

- [ ] **Step 5: Migrate in save.ts**

Replace `load` in `src/engine/save.ts`:

```ts
export function load(storage: Storage = localStorage): GameState | null {
  const raw = storage.getItem(KEY)
  if (!raw) return null
  try {
    const state = JSON.parse(raw)
    if (state?.version === 2) return state as GameState
    if (state?.version === 1) return migrateV1(state)
    return null
  } catch {
    return null
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function migrateV1(s: any): GameState {
  return {
    ...s,
    version: 2,
    players: Object.fromEntries(
      Object.values<any>(s.players).map(p => [p.id, {
        ...p, form: 0, fitness: 100, injuredForRounds: 0, suspendedForRounds: 0, yellowCards: 0,
      }]),
    ),
    teams: s.teams.map((t: any) => ({ ...t, tactic: 'normal', trainingStyle: 'normal' })),
  }
}
```

- [ ] **Step 6: Fix the existing test helpers to compile**

`src/engine/lineup.test.ts` — in `makeSquad`, the player literal becomes:

```ts
players[id] = {
  id, name: `P${id}`, age: 25, position, level: 90 - i,
  form: 0, fitness: 100, injuredForRounds: 0, suspendedForRounds: 0, yellowCards: 0,
}
```

and the team literal becomes:

```ts
const team: Team = {
  id: 0, name: 'Test FC', playerIds, formation: '4-4-2', lineup: [],
  tactic: 'normal', trainingStyle: 'normal',
}
```

`src/engine/match.test.ts` — in `makeTeam`, the player literal becomes:

```ts
players[pid] = {
  id: pid, name: `P${pid}`, age: 25, position, level,
  form: 0, fitness: 100, injuredForRounds: 0, suspendedForRounds: 0, yellowCards: 0,
}
```

and the returned team gains `tactic: 'normal', trainingStyle: 'normal'`.

`src/engine/standings.test.ts` — in `makeState`, the team literal gains `tactic: 'normal', trainingStyle: 'normal'` and the state literal becomes `version: 2`.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS — all Phase 1 tests plus the new migration test.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: v2 game state with form, fitness, discipline, tactics; v1 save migration"
```

---

### Task 2: Availability-aware lineups

**Files:**
- Modify: `src/engine/lineup.ts`
- Test: `src/engine/lineup.test.ts`

**Interfaces:**
- Consumes: `Player`, `Team`, `Position`, `FORMATIONS` from `./types`
- Produces:
  - `isAvailable(p: Player): boolean` — not injured, not suspended
  - `autoPick(team, players): number[]` — unchanged signature, now skips unavailable players and back-fills shortfalls with the best available players of any position
  - `patchLineup(team: Team, players: Record<number, Player>): number[]` — keeps the user's available starters, fills gaps (same position first, then best available)

- [ ] **Step 1: Write the failing tests**

Add to `src/engine/lineup.test.ts`:

```ts
import { autoPick, isAvailable, patchLineup, swapIn } from './lineup'
```

```ts
describe('availability', () => {
  it('autoPick skips injured and suspended players', () => {
    const { team, players } = makeSquad()
    players[1] = { ...players[1], injuredForRounds: 3 } // best GK out
    players[3] = { ...players[3], suspendedForRounds: 1 } // best DF out
    const lineup = autoPick(team, players)
    expect(lineup).toHaveLength(11)
    expect(lineup).not.toContain(1)
    expect(lineup).not.toContain(3)
    expect(lineup).toContain(2) // backup GK steps in
  })

  it('autoPick back-fills from other positions when a group runs dry', () => {
    const { team, players } = makeSquad()
    players[1] = { ...players[1], injuredForRounds: 2 }
    players[2] = { ...players[2], injuredForRounds: 2 } // both GKs out
    const lineup = autoPick(team, players)
    expect(lineup).toHaveLength(11) // still fields 11, someone deputizes
    expect(lineup).not.toContain(1)
    expect(lineup).not.toContain(2)
  })

  it('patchLineup keeps available starters and replaces unavailable ones', () => {
    const { team, players } = makeSquad()
    const original = autoPick(team, players)
    const t = { ...team, lineup: original }
    const starter = original.find(id => players[id].position === 'MF')!
    players[starter] = { ...players[starter], suspendedForRounds: 1 }
    const patched = patchLineup(t, players)
    expect(patched).toHaveLength(11)
    expect(patched).not.toContain(starter)
    // every other starter kept
    for (const id of original) if (id !== starter) expect(patched).toContain(id)
    // replacement is the best benched MF (all MFs available: ids 9-14, 9-12 start in 4-4-2 → 13 is next)
    expect(patched).toContain(13)
  })

  it('patchLineup returns the lineup unchanged when everyone is available', () => {
    const { team, players } = makeSquad()
    const original = autoPick(team, players)
    expect(patchLineup({ ...team, lineup: original }, players)).toEqual(original)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/lineup.test.ts`
Expected: FAIL — `isAvailable`/`patchLineup` not exported, and autoPick still picks player 1

- [ ] **Step 3: Implement**

In `src/engine/lineup.ts`, add `isAvailable`, make `autoPick` availability-aware with shortfall back-fill, and add `patchLineup`:

```ts
import { FORMATIONS, type GameState, type Player, type Position, type Team } from './types'

export function isAvailable(p: Player): boolean {
  return p.injuredForRounds === 0 && p.suspendedForRounds === 0
}

export function autoPick(team: Team, players: Record<number, Player>): number[] {
  const squad = team.playerIds.map(id => players[id]).filter(isAvailable)
  const lineup: number[] = []
  for (const [position, count] of Object.entries(FORMATIONS[team.formation])) {
    const best = squad
      .filter(p => p.position === position)
      .sort((a, b) => b.level - a.level)
      .slice(0, count)
    lineup.push(...best.map(p => p.id))
  }
  // ponytail: a dried-up position group is filled by the best available anyone —
  // no out-of-position penalty; the wrong shape is penalty enough
  if (lineup.length < 11) {
    const rest = squad
      .filter(p => !lineup.includes(p.id))
      .sort((a, b) => b.level - a.level)
    lineup.push(...rest.slice(0, 11 - lineup.length).map(p => p.id))
  }
  return lineup
}

// Repair the user's hand-picked lineup: keep available starters,
// fill holes with the best available bench player (same position first).
export function patchLineup(team: Team, players: Record<number, Player>): number[] {
  const kept = team.lineup.filter(id => isAvailable(players[id]))
  if (kept.length === 11) return kept
  const bench = team.playerIds
    .map(id => players[id])
    .filter(p => isAvailable(p) && !kept.includes(p.id))
    .sort((a, b) => b.level - a.level)
  const counts: Record<Position, number> = { GK: 0, DF: 0, MF: 0, FW: 0 }
  for (const id of kept) counts[players[id].position]++
  const lineup = [...kept]
  for (const [position, needed] of Object.entries(FORMATIONS[team.formation]) as [Position, number][]) {
    const fill = bench
      .filter(p => p.position === position && !lineup.includes(p.id))
      .slice(0, Math.max(0, needed - counts[position]))
    lineup.push(...fill.map(p => p.id))
  }
  if (lineup.length < 11) {
    const rest = bench.filter(p => !lineup.includes(p.id))
    lineup.push(...rest.slice(0, 11 - lineup.length).map(p => p.id))
  }
  return lineup
}
```

(`swapIn` and `updateTeam` stay as they are.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/lineup.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/engine/lineup.ts src/engine/lineup.test.ts
git commit -m "feat: availability-aware auto-pick and lineup patching"
```

---

### Task 3: Minute-by-minute match engine

**Files:**
- Modify: `src/engine/match.ts` (full rewrite)
- Test: `src/engine/match.test.ts`

**Interfaces:**
- Consumes: `Player`, `Team`, `Tactic`, `TrainingStyle`, `MatchEvent` from `./types`; `isAvailable` from `./lineup`
- Produces:
  - `effectiveLevel(p: Player): number` — level scaled by form (±9%) and fitness (down to −30%)
  - `interface MatchResult { homeGoals: number; awayGoals: number; events: MatchEvent[] }`
  - `simulateMatch(home: Team, away: Team, players: Record<number, Player>, rand: () => number): MatchResult` — home advantage and tactics applied internally
  - `teamStrength` is DELETED (nothing else uses it)

- [ ] **Step 1: Rewrite the test file**

Replace `src/engine/match.test.ts` entirely:

```ts
import { describe, expect, it } from 'vitest'
import { effectiveLevel, simulateMatch } from './match'
import { mulberry32 } from './rng'
import type { Player, Position, Team, TrainingStyle } from './types'

function makeTeam(
  id: number,
  level: number,
  players: Record<number, Player>,
  trainingStyle: TrainingStyle = 'normal',
): Team {
  const positions: Position[] = [
    'GK', 'GK',
    'DF', 'DF', 'DF', 'DF', 'DF', 'DF',
    'MF', 'MF', 'MF', 'MF', 'MF', 'MF',
    'FW', 'FW', 'FW', 'FW',
  ]
  const playerIds = positions.map((position, i) => {
    const pid = id * 100 + i
    players[pid] = {
      id: pid, name: `P${pid}`, age: 25, position, level,
      form: 0, fitness: 100, injuredForRounds: 0, suspendedForRounds: 0, yellowCards: 0,
    }
    return pid
  })
  // 4-4-2 starting XI: GK 0, DF 2-5, MF 8-11, FW 14-15
  const lineup = [0, 2, 3, 4, 5, 8, 9, 10, 11, 14, 15].map(i => id * 100 + i)
  return { id, name: `T${id}`, playerIds, formation: '4-4-2', lineup, tactic: 'normal', trainingStyle }
}

describe('effectiveLevel', () => {
  it('scales with form and fitness', () => {
    const base: Player = {
      id: 1, name: 'P', age: 25, position: 'MF', level: 50,
      form: 0, fitness: 100, injuredForRounds: 0, suspendedForRounds: 0, yellowCards: 0,
    }
    expect(effectiveLevel(base)).toBe(50)
    expect(effectiveLevel({ ...base, form: 3 })).toBeCloseTo(50 * 1.09)
    expect(effectiveLevel({ ...base, form: -3 })).toBeCloseTo(50 * 0.91)
    expect(effectiveLevel({ ...base, fitness: 0 })).toBeCloseTo(50 * 0.7)
  })
})

describe('simulateMatch', () => {
  it('is deterministic for the same rand', () => {
    const players: Record<number, Player> = {}
    const a = makeTeam(1, 60, players)
    const b = makeTeam(2, 55, players)
    expect(simulateMatch(a, b, players, mulberry32(9))).toEqual(simulateMatch(a, b, players, mulberry32(9)))
  })

  it('score always equals the goal events', () => {
    const players: Record<number, Player> = {}
    const a = makeTeam(1, 60, players)
    const b = makeTeam(2, 55, players)
    const rand = mulberry32(3)
    for (let i = 0; i < 100; i++) {
      const r = simulateMatch(a, b, players, rand)
      expect(r.homeGoals).toBe(r.events.filter(e => e.type === 'goal' && e.teamId === a.id).length)
      expect(r.awayGoals).toBe(r.events.filter(e => e.type === 'goal' && e.teamId === b.id).length)
      expect(r.homeGoals + r.awayGoals).toBeLessThanOrEqual(15)
      for (const e of r.events) {
        expect(e.minute).toBeGreaterThanOrEqual(1)
        expect(e.minute).toBeLessThanOrEqual(90)
      }
    }
  })

  it('lets the clearly stronger team win far more often', () => {
    const players: Record<number, Player> = {}
    const strong = makeTeam(1, 90, players)
    const weak = makeTeam(2, 40, players)
    const rand = mulberry32(42)
    let strongWins = 0
    let weakWins = 0
    for (let i = 0; i < 300; i++) {
      const r = simulateMatch(strong, weak, players, rand)
      if (r.homeGoals > r.awayGoals) strongWins++
      if (r.awayGoals > r.homeGoals) weakWins++
    }
    expect(strongWins).toBeGreaterThan(weakWins * 2)
  })

  it('gives the home side an edge between equal teams', () => {
    const players: Record<number, Player> = {}
    const a = makeTeam(1, 60, players)
    const b = makeTeam(2, 60, players)
    const rand = mulberry32(7)
    let homeWins = 0
    let awayWins = 0
    for (let i = 0; i < 1000; i++) {
      const r = simulateMatch(a, b, players, rand)
      if (r.homeGoals > r.awayGoals) homeWins++
      if (r.awayGoals > r.homeGoals) awayWins++
    }
    expect(homeWins).toBeGreaterThan(awayWins)
  })

  it('a sent-off or injured-without-sub player appears in no later events', () => {
    const players: Record<number, Player> = {}
    const a = makeTeam(1, 60, players)
    const b = makeTeam(2, 60, players)
    const rand = mulberry32(11)
    for (let i = 0; i < 300; i++) {
      const r = simulateMatch(a, b, players, rand)
      for (const red of r.events.filter(e => e.type === 'red')) {
        const later = r.events.filter(e => e.minute > red.minute)
        expect(later.some(e => e.playerId === red.playerId || e.playerInId === red.playerId)).toBe(false)
      }
    }
  })

  it('intensive training causes more injuries than light', () => {
    const count = (style: TrainingStyle, seed: number) => {
      const players: Record<number, Player> = {}
      const a = makeTeam(1, 60, players, style)
      const b = makeTeam(2, 60, players, style)
      const rand = mulberry32(seed)
      let injuries = 0
      for (let i = 0; i < 400; i++) {
        injuries += simulateMatch(a, b, players, rand).events.filter(e => e.type === 'injury').length
      }
      return injuries
    }
    const intensive = count('intensive', 5)
    const light = count('light', 5)
    expect(intensive).toBeGreaterThan(light)
    expect(light).toBeGreaterThan(0) // injuries do happen even on light training
  })

  it('attacking tactic produces more total goals than defensive', () => {
    const total = (tactic: 'attacking' | 'defensive') => {
      const players: Record<number, Player> = {}
      const a = { ...makeTeam(1, 60, players), tactic }
      const b = { ...makeTeam(2, 60, players), tactic }
      const rand = mulberry32(13)
      let goals = 0
      for (let i = 0; i < 400; i++) {
        const r = simulateMatch(a, b, players, rand)
        goals += r.homeGoals + r.awayGoals
      }
      return goals
    }
    expect(total('attacking')).toBeGreaterThan(total('defensive'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/match.test.ts`
Expected: FAIL — `effectiveLevel` not exported; `simulateMatch` returns no `events`

- [ ] **Step 3: Rewrite the engine**

Replace `src/engine/match.ts` entirely:

```ts
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
```

Note `teamStrength` is gone — `src/engine/season.ts` doesn't use it and nothing else imports it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/engine/match.test.ts`
Expected: PASS (8 tests). `season.test.ts` will still pass because `advanceRound` only reads `homeGoals`/`awayGoals` from the result — run `npm test` to confirm nothing else broke (the `toEqual` determinism check in `season.test.ts` still holds since the engine is deterministic).

- [ ] **Step 5: Commit**

```bash
git add src/engine/match.ts src/engine/match.test.ts
git commit -m "feat: minute-by-minute match engine with events, cards, injuries, tactics"
```

---

### Task 4: Training, fitness, form, and aging

**Files:**
- Create: `src/engine/training.ts`
- Test: `src/engine/training.test.ts`

**Interfaces:**
- Consumes: `Player`, `Team`, `TrainingStyle` from `./types`; `randInt` from `./rng`
- Produces:
  - `applyWeeklyUpdates(players: Record<number, Player>, teams: Team[], starters: Set<number>, rand: () => number): Record<number, Player>` — training level gains, fitness drain/recovery, form drift, in one pass
  - `ageSquads(players: Record<number, Player>, rand: () => number): Record<number, Player>` — season end: age +1, 30+ decline 1–3 levels, reset form/fitness/cards/injuries/suspensions

- [ ] **Step 1: Write the failing tests**

`src/engine/training.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mulberry32 } from './rng'
import { ageSquads, applyWeeklyUpdates } from './training'
import type { Player, Team, TrainingStyle } from './types'

function makePlayer(id: number, age: number, over: Partial<Player> = {}): Player {
  return {
    id, name: `P${id}`, age, position: 'MF', level: 50,
    form: 0, fitness: 100, injuredForRounds: 0, suspendedForRounds: 0, yellowCards: 0,
    ...over,
  }
}

function makeTeam(playerIds: number[], trainingStyle: TrainingStyle): Team {
  return {
    id: 0, name: 'T', playerIds, formation: '4-4-2', lineup: [],
    tactic: 'normal', trainingStyle,
  }
}

// run many weekly updates and count level gains for one player
function gains(age: number, style: TrainingStyle, weeks: number, seed: number): number {
  const rand = mulberry32(seed)
  let total = 0
  for (let w = 0; w < weeks; w++) {
    const players = { 1: makePlayer(1, age) }
    const next = applyWeeklyUpdates(players, [makeTeam([1], style)], new Set(), rand)
    total += next[1].level - 50
  }
  return total
}

describe('applyWeeklyUpdates — training', () => {
  it('young players grow, 30+ players do not', () => {
    expect(gains(19, 'normal', 400, 1)).toBeGreaterThan(0)
    expect(gains(31, 'normal', 400, 1)).toBe(0)
  })

  it('intensive trains faster than light', () => {
    expect(gains(19, 'intensive', 400, 2)).toBeGreaterThan(gains(19, 'light', 400, 2))
  })

  it('youth focus boosts U21 and slows veterans vs normal', () => {
    expect(gains(19, 'youth', 400, 3)).toBeGreaterThan(gains(19, 'normal', 400, 3))
    expect(gains(26, 'youth', 400, 3)).toBeLessThan(gains(26, 'normal', 400, 3))
  })

  it('level never exceeds 99', () => {
    const rand = mulberry32(4)
    let players = { 1: makePlayer(1, 18, { level: 99 }) }
    for (let w = 0; w < 50; w++) players = applyWeeklyUpdates(players, [makeTeam([1], 'intensive')], new Set(), rand)
    expect(players[1].level).toBe(99)
  })
})

describe('applyWeeklyUpdates — fitness and form', () => {
  it('starters lose net fitness, resters recover, both clamped to 0-100', () => {
    const rand = mulberry32(5)
    const players = {
      1: makePlayer(1, 25, { fitness: 100 }),
      2: makePlayer(2, 25, { fitness: 40 }),
    }
    const next = applyWeeklyUpdates(players, [makeTeam([1, 2], 'normal')], new Set([1]), rand)
    expect(next[1].fitness).toBe(95) // 100 - 25 + 20
    expect(next[2].fitness).toBe(60) // 40 + 20
  })

  it('form drifts but stays within -3..3', () => {
    const rand = mulberry32(6)
    let players = { 1: makePlayer(1, 25) }
    const seen = new Set<number>()
    for (let w = 0; w < 200; w++) {
      players = applyWeeklyUpdates(players, [makeTeam([1], 'normal')], new Set(), rand)
      seen.add(players[1].form)
      expect(players[1].form).toBeGreaterThanOrEqual(-3)
      expect(players[1].form).toBeLessThanOrEqual(3)
    }
    expect(seen.size).toBeGreaterThan(1) // it actually moves
  })
})

describe('ageSquads', () => {
  it('ages everyone, declines 30+, resets season fields', () => {
    const rand = mulberry32(7)
    const players = {
      1: makePlayer(1, 22, { form: 2, fitness: 55, yellowCards: 2, injuredForRounds: 3, suspendedForRounds: 1 }),
      2: makePlayer(2, 31, { level: 60 }),
    }
    const next = ageSquads(players, rand)
    expect(next[1].age).toBe(23)
    expect(next[1].level).toBe(50) // under 30: no decline
    expect(next[1]).toMatchObject({ form: 0, fitness: 100, yellowCards: 0, injuredForRounds: 0, suspendedForRounds: 0 })
    expect(next[2].age).toBe(32)
    expect(next[2].level).toBeGreaterThanOrEqual(57)
    expect(next[2].level).toBeLessThanOrEqual(59) // declined 1-3
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/training.test.ts`
Expected: FAIL — cannot resolve `./training`

- [ ] **Step 3: Implement**

`src/engine/training.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/training.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/engine/training.ts src/engine/training.test.ts
git commit -m "feat: weekly training, fitness, form drift, and season-end aging"
```

---

### Task 5: Round orchestration — consequences, counters, weekly updates

**Files:**
- Modify: `src/engine/season.ts`
- Test: `src/engine/season.test.ts`

**Interfaces:**
- Consumes: `simulateMatch`/`MatchResult` from `./match`; `autoPick`, `patchLineup` from `./lineup`; `applyWeeklyUpdates`, `ageSquads` from `./training`; `generateFixtures`, RNG, types
- Produces:
  - `applyMatchConsequences(players: Record<number, Player>, events: MatchEvent[], rand: () => number): Record<number, Player>` — exported for tests: yellows accumulate (3 → 1-round ban + reset), reds → 1–2 round ban, injuries → 1–6 rounds out and −1/−2 levels when 4+ rounds
  - `advanceRound(state: GameState): GameState` — now: refresh lineups (AI re-picks, user patched) → simulate & store events on fixtures → tick down existing counters → apply new consequences → weekly updates
  - `newSeason(state: GameState): GameState` — now also runs `ageSquads`
  - `totalRounds` unchanged

- [ ] **Step 1: Write the failing tests**

Replace `src/engine/season.test.ts` entirely:

```ts
import { describe, expect, it } from 'vitest'
import { mulberry32 } from './rng'
import { newGame } from './newGame'
import { advanceRound, applyMatchConsequences, newSeason, totalRounds } from './season'
import type { MatchEvent, Player } from './types'

function makePlayer(id: number, over: Partial<Player> = {}): Player {
  return {
    id, name: `P${id}`, age: 25, position: 'MF', level: 50,
    form: 0, fitness: 100, injuredForRounds: 0, suspendedForRounds: 0, yellowCards: 0,
    ...over,
  }
}

describe('applyMatchConsequences', () => {
  const yellow = (playerId: number): MatchEvent => ({ minute: 10, type: 'yellow', teamId: 0, playerId })
  const red = (playerId: number): MatchEvent => ({ minute: 10, type: 'red', teamId: 0, playerId })
  const injury = (playerId: number): MatchEvent => ({ minute: 10, type: 'injury', teamId: 0, playerId })

  it('accumulates yellows and bans on the third', () => {
    const rand = mulberry32(1)
    const one = applyMatchConsequences({ 1: makePlayer(1) }, [yellow(1)], rand)
    expect(one[1]).toMatchObject({ yellowCards: 1, suspendedForRounds: 0 })
    const third = applyMatchConsequences({ 1: makePlayer(1, { yellowCards: 2 }) }, [yellow(1)], rand)
    expect(third[1]).toMatchObject({ yellowCards: 0, suspendedForRounds: 1 })
  })

  it('bans a red card 1-2 rounds', () => {
    const rand = mulberry32(2)
    const next = applyMatchConsequences({ 1: makePlayer(1) }, [red(1)], rand)
    expect(next[1].suspendedForRounds).toBeGreaterThanOrEqual(1)
    expect(next[1].suspendedForRounds).toBeLessThanOrEqual(2)
  })

  it('injures 1-6 rounds and costs levels only when serious', () => {
    const rand = mulberry32(3)
    for (let i = 0; i < 50; i++) {
      const next = applyMatchConsequences({ 1: makePlayer(1) }, [injury(1)], rand)
      const rounds = next[1].injuredForRounds
      expect(rounds).toBeGreaterThanOrEqual(1)
      expect(rounds).toBeLessThanOrEqual(6)
      if (rounds >= 4) {
        expect(next[1].level).toBeGreaterThanOrEqual(48)
        expect(next[1].level).toBeLessThanOrEqual(49)
      } else {
        expect(next[1].level).toBe(50)
      }
    }
  })
})

describe('advanceRound', () => {
  it('plays the current round, stores events, and advances', () => {
    const s0 = newGame(123)
    const s1 = advanceRound(s0)
    expect(s1.round).toBe(2)
    const played = s1.fixtures.filter(f => f.round === 1)
    expect(played.every(f => f.homeGoals !== null && Array.isArray(f.events))).toBe(true)
    // score matches stored events
    for (const f of played) {
      expect(f.homeGoals).toBe(f.events!.filter(e => e.type === 'goal' && e.teamId === f.homeId).length)
    }
    expect(s0.round).toBe(1) // input untouched
  })

  it('is deterministic', () => {
    const s0 = newGame(123)
    expect(advanceRound(s0)).toEqual(advanceRound(s0))
  })

  it('never fields injured or suspended players', () => {
    let s = newGame(7)
    // pre-suspend a user starter and an AI starter
    const userStarter = s.teams[0].lineup[3]
    const aiStarter = s.teams[5].lineup[3]
    s = {
      ...s,
      players: {
        ...s.players,
        [userStarter]: { ...s.players[userStarter], suspendedForRounds: 2 },
        [aiStarter]: { ...s.players[aiStarter], injuredForRounds: 2 },
      },
    }
    const s1 = advanceRound(s)
    expect(s1.teams[0].lineup).not.toContain(userStarter)
    expect(s1.teams[5].lineup).not.toContain(aiStarter)
    // counters ticked down
    expect(s1.players[userStarter].suspendedForRounds).toBe(1)
    expect(s1.players[aiStarter].injuredForRounds).toBe(1)
  })

  it('keeps the user lineup otherwise intact but re-picks AI teams', () => {
    const s0 = newGame(9)
    const userLineup = [...s0.teams[0].lineup]
    const s1 = advanceRound(s0)
    expect(s1.teams[0].lineup).toEqual(userLineup) // nobody unavailable yet
  })

  it('produces discipline and squad churn over a full season', () => {
    let s = newGame(31)
    for (let i = 0; i < totalRounds(s); i++) s = advanceRound(s)
    const events = s.fixtures.flatMap(f => f.events ?? [])
    expect(events.filter(e => e.type === 'goal').length).toBeGreaterThan(300) // ~2.7 * 240
    expect(events.filter(e => e.type === 'yellow').length).toBeGreaterThan(100)
    expect(events.filter(e => e.type === 'injury').length).toBeGreaterThan(5)
    // training moved at least someone
    const s0 = newGame(31)
    const levelsChanged = Object.values(s.players).some(p => p.level !== s0.players[p.id].level)
    expect(levelsChanged).toBe(true)
  })
})

describe('newSeason', () => {
  it('resets the calendar, bumps the season, and ages squads', () => {
    let s = newGame(7)
    for (let i = 0; i < totalRounds(s); i++) s = advanceRound(s)
    const s2 = newSeason(s)
    expect(s2.season).toBe(2)
    expect(s2.round).toBe(1)
    expect(s2.fixtures).toHaveLength(240)
    expect(s2.fixtures.every(f => f.homeGoals === null)).toBe(true)
    for (const p of Object.values(s2.players)) {
      expect(p.age).toBe(s.players[p.id].age + 1)
      expect(p.fitness).toBe(100)
      expect(p.yellowCards).toBe(0)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/season.test.ts`
Expected: FAIL — `applyMatchConsequences` not exported; events not stored; counters not ticked

- [ ] **Step 3: Implement**

Replace `src/engine/season.ts` entirely:

```ts
import { generateFixtures } from './fixtures'
import { autoPick, patchLineup } from './lineup'
import { simulateMatch } from './match'
import { mulberry32, randInt } from './rng'
import { ageSquads, applyWeeklyUpdates } from './training'
import type { GameState, MatchEvent, Player } from './types'

export function totalRounds(state: GameState): number {
  return (state.teams.length - 1) * 2
}

export function applyMatchConsequences(
  players: Record<number, Player>,
  events: MatchEvent[],
  rand: () => number,
): Record<number, Player> {
  const next = { ...players }
  for (const e of events) {
    const p = next[e.playerId]
    if (e.type === 'yellow') {
      const yellows = p.yellowCards + 1
      next[p.id] = yellows >= 3
        ? { ...p, yellowCards: 0, suspendedForRounds: 1 }
        : { ...p, yellowCards: yellows }
    } else if (e.type === 'red') {
      next[p.id] = { ...p, suspendedForRounds: randInt(rand, 1, 2) }
    } else if (e.type === 'injury') {
      const rounds = randInt(rand, 1, 6)
      const levelLoss = rounds >= 4 ? randInt(rand, 1, 2) : 0
      next[p.id] = { ...p, injuredForRounds: rounds, level: Math.max(1, p.level - levelLoss) }
    }
  }
  return next
}

export function advanceRound(state: GameState): GameState {
  if (state.round > totalRounds(state)) return state
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

  // existing bans/injuries tick down BEFORE this round's knocks land,
  // so a fresh 3-round injury really costs 3 future rounds
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

  return { ...state, teams, players, fixtures, round: state.round + 1, rngState: randInt(rand, 1, 2 ** 31 - 1) }
}

export function newSeason(state: GameState): GameState {
  const rand = mulberry32(state.rngState)
  return {
    ...state,
    season: state.season + 1,
    round: 1,
    players: ageSquads(state.players, rand),
    fixtures: generateFixtures(state.teams.map(t => t.id), rand),
    rngState: randInt(rand, 1, 2 ** 31 - 1),
  }
}
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS — all files. If `newGame.test.ts` fails on determinism, nothing here touched it; investigate before proceeding.

- [ ] **Step 5: Commit**

```bash
git add src/engine/season.ts src/engine/season.test.ts
git commit -m "feat: rounds apply cards, injuries, counters, and weekly training"
```

---

### Task 6: Squad screen v2 — status columns, tactic and training pickers

**Files:**
- Modify: `src/screens/SquadScreen.tsx`, `src/index.css`

**Interfaces:**
- Consumes: `updateTeam` (existing), new `Player` fields, `Tactic`, `TrainingStyle`; `isAvailable` from `../engine/lineup`
- Produces: no new engine APIs — UI only

- [ ] **Step 1: Update `src/screens/SquadScreen.tsx`**

Replace the file:

```tsx
import type { Dispatch, SetStateAction } from 'react'
import { autoPick, isAvailable, swapIn, updateTeam } from '../engine/lineup'
import {
  FORMATIONS,
  type FormationName,
  type GameState,
  type Player,
  type Position,
  type Tactic,
  type TrainingStyle,
} from '../engine/types'

const ORDER: Position[] = ['GK', 'DF', 'MF', 'FW']
const TACTICS: Tactic[] = ['defensive', 'normal', 'attacking']
const TRAINING_STYLES: TrainingStyle[] = ['light', 'normal', 'intensive', 'youth']

function status(p: Player): string {
  if (p.injuredForRounds > 0) return `🚑 ${p.injuredForRounds}`
  if (p.suspendedForRounds > 0) return `⛔ ${p.suspendedForRounds}`
  if (p.yellowCards > 0) return '🟨'.repeat(p.yellowCards)
  return ''
}

function formArrow(form: number): string {
  if (form > 0) return `▲${form}`
  if (form < 0) return `▼${-form}`
  return '–'
}

interface Props {
  state: GameState
  setState: Dispatch<SetStateAction<GameState>>
}

export default function SquadScreen({ state, setState }: Props) {
  const team = state.teams.find(t => t.id === state.userTeamId)!
  const squad = team.playerIds
    .map(id => state.players[id])
    .sort((a, b) => ORDER.indexOf(a.position) - ORDER.indexOf(b.position) || b.level - a.level)

  const withUserTeam = (fn: (s: GameState, t: typeof team) => GameState) =>
    setState(s => fn(s, s.teams.find(t => t.id === s.userTeamId)!))

  return (
    <div>
      <div className="controls">
        <label>
          Formation:{' '}
          <select
            value={team.formation}
            onChange={e => {
              const formation = e.target.value as FormationName
              withUserTeam((s, t) => {
                const next = { ...t, formation }
                return updateTeam(s, t.id, { formation, lineup: autoPick(next, s.players) })
              })
            }}
          >
            {Object.keys(FORMATIONS).map(f => <option key={f}>{f}</option>)}
          </select>
        </label>{' '}
        <label>
          Tactic:{' '}
          <select
            value={team.tactic}
            onChange={e => {
              const tactic = e.target.value as Tactic
              withUserTeam((s, t) => updateTeam(s, t.id, { tactic }))
            }}
          >
            {TACTICS.map(t => <option key={t}>{t}</option>)}
          </select>
        </label>{' '}
        <label>
          Training:{' '}
          <select
            value={team.trainingStyle}
            onChange={e => {
              const trainingStyle = e.target.value as TrainingStyle
              withUserTeam((s, t) => updateTeam(s, t.id, { trainingStyle }))
            }}
          >
            {TRAINING_STYLES.map(t => <option key={t}>{t}</option>)}
          </select>
        </label>{' '}
        <button onClick={() => withUserTeam((s, t) => updateTeam(s, t.id, { lineup: autoPick(t, s.players) }))}>
          Auto-pick
        </button>
      </div>
      <table>
        <thead>
          <tr><th>Pos</th><th>Name</th><th>Age</th><th>Level</th><th>Form</th><th>Fit</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          {squad.map(p => {
            const starting = team.lineup.includes(p.id)
            return (
              <tr key={p.id} className={starting ? 'starting' : ''}>
                <td>{p.position}</td>
                <td>{p.name}</td>
                <td>{p.age}</td>
                <td>{p.level}</td>
                <td>{formArrow(p.form)}</td>
                <td>{p.fitness}%</td>
                <td>{status(p)}</td>
                <td>
                  {starting
                    ? 'Starting'
                    : <button
                        disabled={!isAvailable(p)}
                        onClick={() => withUserTeam((s, t) => updateTeam(s, t.id, { lineup: swapIn(t, s.players, p.id) }))}
                      >
                        Start
                      </button>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Verify manually**

Run: `npm run dev`. On the Squad tab check:
- Form shows `–` for everyone, Fit 100%, Status empty on a fresh game.
- Tactic and Training selects persist across a reload (localStorage).
- Advance a few rounds: forms drift, starters' fitness dips below the bench's, yellow cards appear in Status, injured players show `🚑 N` with a disabled Start button and are out of the lineup.

Run `npm test` — still green.

- [ ] **Step 3: Commit**

```bash
git add src/screens/SquadScreen.tsx src/index.css
git commit -m "feat: squad screen shows form, fitness, discipline; tactic and training pickers"
```

---

### Task 7: Match ticker screen

**Files:**
- Create: `src/screens/MatchScreen.tsx`
- Modify: `src/App.tsx`, `src/index.css`

**Interfaces:**
- Consumes: `Fixture`, `GameState`, `MatchEvent` from `../engine/types`
- Produces:
  - `eventText(e: MatchEvent, state: GameState): string` — exported; Task 8 reuses it
  - default export `MatchScreen({ fixture, state, onClose })` — animated replay of a played fixture

- [ ] **Step 1: Create `src/screens/MatchScreen.tsx`**

```tsx
import { useEffect, useState } from 'react'
import type { Fixture, GameState, MatchEvent } from '../engine/types'

export function eventText(e: MatchEvent, state: GameState): string {
  const player = state.players[e.playerId]?.name ?? '?'
  const sub = e.playerInId != null ? state.players[e.playerInId]?.name : null
  switch (e.type) {
    case 'goal': return `⚽ GOAL! ${player}`
    case 'chance': return `Chance for ${player} — saved!`
    case 'yellow': return `🟨 ${player} is booked`
    case 'red': return `🟥 ${player} is sent off!`
    case 'injury': return sub
      ? `🚑 ${player} goes down injured — ${sub} comes on`
      : `🚑 ${player} goes down injured — no substitute left!`
  }
}

interface Props {
  fixture: Fixture
  state: GameState
  onClose: () => void
}

export default function MatchScreen({ fixture, state, onClose }: Props) {
  const [minute, setMinute] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setMinute(m => (m >= 90 ? m : m + 1)), 65)
    return () => clearInterval(id)
  }, [])

  const name = (id: number) => state.teams.find(t => t.id === id)!.name
  const events = (fixture.events ?? []).filter(e => e.minute <= minute)
  const hg = events.filter(e => e.type === 'goal' && e.teamId === fixture.homeId).length
  const ag = events.filter(e => e.type === 'goal' && e.teamId === fixture.awayId).length

  return (
    <div className="app">
      <h2>
        {name(fixture.homeId)} {hg} – {ag} {name(fixture.awayId)}
      </h2>
      <p className="minute">{Math.min(minute, 90)}'</p>
      <ul className="ticker">
        {events.slice().reverse().map((e, i) => (
          <li key={`${e.minute}-${i}`}>
            <strong>{e.minute}'</strong> {eventText(e, state)}{' '}
            <em>({name(e.teamId)})</em>
          </li>
        ))}
      </ul>
      {minute < 90
        ? <button onClick={() => setMinute(90)}>Skip to result</button>
        : <button onClick={onClose}>Continue</button>}
    </div>
  )
}
```

- [ ] **Step 2: Wire the replay into `src/App.tsx`**

Add imports and replay state:

```tsx
import MatchScreen from './screens/MatchScreen'
import type { Fixture, GameState } from './engine/types'
```

Inside `App`, add:

```tsx
const [replay, setReplay] = useState<Fixture | null>(null)

const advance = () => {
  const next = advanceRound(state)
  const played = next.fixtures.find(
    f => f.round === state.round && (f.homeId === state.userTeamId || f.awayId === state.userTeamId),
  ) ?? null
  setState(next)
  setReplay(played)
}
```

Change the advance button to `onClick={advance}` (the New Season button stays `onClick={() => setState(newSeason)}`), and render the replay as a full-screen takeover before anything else:

```tsx
if (replay) {
  return <MatchScreen fixture={replay} state={state} onClose={() => setReplay(null)} />
}
```

- [ ] **Step 3: Add ticker styles to `src/index.css`**

```css
.minute { font-size: 1.5rem; font-weight: bold; margin: 0.25rem 0; }
.ticker { list-style: none; padding: 0; max-height: 60vh; overflow-y: auto; }
.ticker li { padding: 0.25rem 0; border-bottom: 1px solid rgba(128, 128, 128, 0.2); }
```

- [ ] **Step 4: Verify manually**

Run: `npm run dev`:
- Advance Round → your match plays out minute by minute (~6 seconds), events appearing as the clock runs; score updates when goals land.
- Skip to result jumps straight to 90' with all events shown; Continue returns to the app with the round advanced.
- Reload mid-season: no replay shows (replays are not persisted — by design).

Run `npm test` — still green.

- [ ] **Step 5: Commit**

```bash
git add src/screens/MatchScreen.tsx src/App.tsx src/index.css
git commit -m "feat: minute-by-minute match ticker replay"
```

---

### Task 8: Match reports on the fixtures screen

**Files:**
- Modify: `src/screens/FixturesScreen.tsx`

**Interfaces:**
- Consumes: `eventText` from `./MatchScreen`; `Fixture` fields including `events`
- Produces: UI only

- [ ] **Step 1: Update `src/screens/FixturesScreen.tsx`**

Replace the file:

```tsx
import { useState } from 'react'
import { totalRounds } from '../engine/season'
import type { Fixture, GameState } from '../engine/types'
import { eventText } from './MatchScreen'

export default function FixturesScreen({ state }: { state: GameState }) {
  const total = totalRounds(state)
  const [round, setRound] = useState(() => Math.min(Math.max(state.round - 1, 1), total))
  const [selected, setSelected] = useState<Fixture | null>(null)
  const name = (id: number) => state.teams.find(t => t.id === id)!.name
  const fixtures = state.fixtures.filter(f => f.round === round)

  return (
    <div>
      <div className="round-nav">
        <button disabled={round <= 1} onClick={() => { setRound(round - 1); setSelected(null) }}>‹</button>
        <span>Round {round}</span>
        <button disabled={round >= total} onClick={() => { setRound(round + 1); setSelected(null) }}>›</button>
      </div>
      <table>
        <tbody>
          {fixtures.map((f, i) => (
            <tr
              key={i}
              className={f === selected ? 'selected' : ''}
              onClick={() => setSelected(f.homeGoals !== null && f === selected ? null : f)}
              style={{ cursor: f.homeGoals !== null ? 'pointer' : 'default' }}
            >
              <td className="home">{name(f.homeId)}</td>
              <td>{f.homeGoals === null ? 'vs' : `${f.homeGoals} – ${f.awayGoals}`}</td>
              <td>{name(f.awayId)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {selected && (
        <div className="report">
          <h3>{name(selected.homeId)} {selected.homeGoals} – {selected.awayGoals} {name(selected.awayId)}</h3>
          <ul className="ticker">
            {(selected.events ?? []).map((e, i) => (
              <li key={i}>
                <strong>{e.minute}'</strong> {eventText(e, state)} <em>({name(e.teamId)})</em>
              </li>
            ))}
            {(selected.events ?? []).length === 0 && <li>No report available for this match.</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
```

Add to `src/index.css`:

```css
tr.selected { outline: 2px solid steelblue; }
.report { margin-top: 1rem; }
```

- [ ] **Step 2: Verify manually**

Run: `npm run dev`:
- Fixtures tab → click a played match: its report (goals, cards, injuries, chances, minutes) appears below; click again to collapse.
- Unplayed matches aren't clickable.
- A match played before this phase (migrated v1 save) shows "No report available".

Run `npm test` — still green.

- [ ] **Step 3: Commit**

```bash
git add src/screens/FixturesScreen.tsx src/index.css
git commit -m "feat: match reports on the fixtures screen"
```

---

### Task 9: Phase 2 acceptance check

**Files:** none new.

**Interfaces:** none — this is the spec's Phase 2 gate: *"watching a match is fun and the squad changes over a season."*

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all tests pass across rng, lineup, fixtures, newGame, match, training, standings, season, save.

- [ ] **Step 2: Play through a season**

Run: `npm run dev`, then:
- Watch one full ticker without skipping; skip the next one.
- Set training to intensive, play ~10 rounds: confirm injuries appear, injured players drop out of the lineup and return N rounds later, and a young player has gained a level.
- Confirm a suspended player (3 yellows or a red) misses the next round.
- Finish the season, start season 2: ages went up by 1, a 30+ player lost levels, fitness/form/cards reset.
- Reload mid-season: state persists.

- [ ] **Step 3: Tag**

```bash
git add -A
git commit -m "chore: phase 2 complete" --allow-empty
git tag phase-2
```
