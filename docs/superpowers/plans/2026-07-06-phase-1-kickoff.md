# Futscript Phase 1 — Kickoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A playable core loop in the browser — generate a 16-team league, manage your squad and formation, advance rounds with instant match results, follow the table, finish a season, start the next one, with auto-save to localStorage.

**Architecture:** The sim engine is pure TypeScript in `src/engine/` — no React or DOM imports — operating on a single serializable `GameState`. React (in `src/App.tsx` + `src/screens/`) renders state and dispatches pure state transitions. Randomness flows through a seeded RNG stored in state so everything is reproducible.

**Tech Stack:** Vite, React 18+, TypeScript (strict), Vitest for engine tests. No other dependencies.

## Global Constraints

- Local-only: no network calls, no backend, no database. Persistence is localStorage.
- `src/engine/` files must not import React or touch the DOM (exception: `save.ts` defaults a `storage: Storage = localStorage` parameter; tests pass a fake).
- All state changes are pure functions `(GameState, ...) => GameState`. No mutation of a state object after creation.
- TypeScript strict mode (Vite template default). Engine tests colocated as `src/engine/*.test.ts`.
- World size in Phase 1: exactly 1 division, 16 teams, 18 players per team, 30 rounds (double round-robin).
- Player levels 1–99; generated players start in 30–70, ages 17–34.

---

### Task 1: Project scaffold

**Files:**
- Create: Vite react-ts template at repo root (`package.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, …)
- Modify: `package.json` (add `test` script), `vite.config.ts` (Vitest config)

**Interfaces:**
- Consumes: nothing
- Produces: working `npm run dev` and `npm test` for all later tasks

- [ ] **Step 1: Scaffold Vite app in the existing directory**

```bash
cd /Users/krause/des/futscript
npm create vite@latest . -- --template react-ts
```

If prompted about the non-empty directory (it contains `docs/` and `.git/`), choose **"Ignore files and continue"**. Then:

```bash
npm install
npm install -D vitest
```

- [ ] **Step 2: Configure Vitest**

Replace `vite.config.ts` with:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts'],
  },
})
```

Add to `package.json` scripts:

```json
"test": "vitest run"
```

- [ ] **Step 3: Verify dev server and test runner**

Run: `npm test`
Expected: "No test files found" exit without config errors (Vitest ≥1 exits 1 here; that's fine — the point is no config error).

Run: `npm run dev` briefly, open the printed URL, confirm the Vite+React starter page renders, then stop it.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React + TS with Vitest"
```

---

### Task 2: Engine types and seeded RNG

**Files:**
- Create: `src/engine/types.ts`, `src/engine/rng.ts`
- Test: `src/engine/rng.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `types.ts`: `Position`, `Player`, `FormationName`, `FORMATIONS`, `Team`, `Fixture`, `GameState`
  - `rng.ts`: `mulberry32(seed: number): () => number`, `randInt(rand: () => number, min: number, max: number): number`

- [ ] **Step 1: Write the failing test**

`src/engine/rng.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mulberry32, randInt } from './rng'

describe('mulberry32', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const seqA = [a(), a(), a(), a(), a()]
    const seqB = [b(), b(), b(), b(), b()]
    expect(seqA).toEqual(seqB)
  })

  it('produces values in [0, 1)', () => {
    const rand = mulberry32(7)
    for (let i = 0; i < 1000; i++) {
      const v = rand()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('randInt', () => {
  it('stays within inclusive bounds and hits both ends', () => {
    const rand = mulberry32(1)
    const seen = new Set<number>()
    for (let i = 0; i < 1000; i++) seen.add(randInt(rand, 1, 5))
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/rng.test.ts`
Expected: FAIL — cannot resolve `./rng`

- [ ] **Step 3: Implement**

`src/engine/rng.ts`:

```ts
// mulberry32 — tiny seeded PRNG, plenty for a game
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function randInt(rand: () => number, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1))
}
```

`src/engine/types.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/rng.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/engine/types.ts src/engine/rng.ts src/engine/rng.test.ts
git commit -m "feat: engine types and seeded RNG"
```

---

### Task 3: Lineup logic (auto-pick, swap-in, team update)

**Files:**
- Create: `src/engine/lineup.ts`
- Test: `src/engine/lineup.test.ts`

**Interfaces:**
- Consumes: `Team`, `Player`, `Position`, `FORMATIONS`, `GameState` from `./types`
- Produces:
  - `autoPick(team: Team, players: Record<number, Player>): number[]` — best 11 for the team's formation
  - `swapIn(team: Team, players: Record<number, Player>, benchPlayerId: number): number[]` — bench player replaces the weakest same-position starter
  - `updateTeam(state: GameState, teamId: number, patch: Partial<Team>): GameState`

- [ ] **Step 1: Write the failing test**

`src/engine/lineup.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { autoPick, swapIn } from './lineup'
import { FORMATIONS, type Player, type Position, type Team } from './types'

// 18-player squad: 2 GK, 6 DF, 6 MF, 4 FW — levels descend within each group
function makeSquad(): { team: Team; players: Record<number, Player> } {
  const positions: Position[] = [
    'GK', 'GK',
    'DF', 'DF', 'DF', 'DF', 'DF', 'DF',
    'MF', 'MF', 'MF', 'MF', 'MF', 'MF',
    'FW', 'FW', 'FW', 'FW',
  ]
  const players: Record<number, Player> = {}
  const playerIds = positions.map((position, i) => {
    const id = i + 1
    players[id] = { id, name: `P${id}`, age: 25, position, level: 90 - i }
    return id
  })
  const team: Team = { id: 0, name: 'Test FC', playerIds, formation: '4-4-2', lineup: [] }
  return { team, players }
}

describe('autoPick', () => {
  it('fills the formation with the highest-level player per position', () => {
    const { team, players } = makeSquad()
    const lineup = autoPick(team, players)
    expect(lineup).toHaveLength(11)
    const counts: Record<Position, number> = { GK: 0, DF: 0, MF: 0, FW: 0 }
    for (const id of lineup) counts[players[id].position]++
    expect(counts).toEqual(FORMATIONS['4-4-2'])
    // best GK is id 1 (level 90), not id 2 (level 89)
    expect(lineup).toContain(1)
    expect(lineup).not.toContain(2)
  })

  it('works for every formation with the standard squad shape', () => {
    const { team, players } = makeSquad()
    for (const formation of Object.keys(FORMATIONS) as (keyof typeof FORMATIONS)[]) {
      const lineup = autoPick({ ...team, formation }, players)
      expect(lineup).toHaveLength(11)
      expect(new Set(lineup).size).toBe(11)
    }
  })
})

describe('swapIn', () => {
  it('replaces the weakest starter of the same position', () => {
    const { team, players } = makeSquad()
    const lineup = autoPick(team, players)
    const t = { ...team, lineup }
    // GK 2 (level 89) is benched; swapping in replaces GK 1
    const next = swapIn(t, players, 2)
    expect(next).toContain(2)
    expect(next).not.toContain(1)
    expect(next).toHaveLength(11)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/lineup.test.ts`
Expected: FAIL — cannot resolve `./lineup`

- [ ] **Step 3: Implement**

`src/engine/lineup.ts`:

```ts
import { FORMATIONS, type GameState, type Player, type Position, type Team } from './types'

export function autoPick(team: Team, players: Record<number, Player>): number[] {
  const squad = team.playerIds.map(id => players[id])
  const lineup: number[] = []
  for (const [position, count] of Object.entries(FORMATIONS[team.formation])) {
    const best = squad
      .filter(p => p.position === position)
      .sort((a, b) => b.level - a.level)
      .slice(0, count)
    lineup.push(...best.map(p => p.id))
  }
  return lineup
}

// ponytail: bench player always replaces the WEAKEST same-position starter;
// free slot-choice UI can come later if this annoys anyone
export function swapIn(team: Team, players: Record<number, Player>, benchPlayerId: number): number[] {
  const bench = players[benchPlayerId]
  const weakest = team.lineup
    .map(id => players[id])
    .filter(p => p.position === bench.position)
    .sort((a, b) => a.level - b.level)[0]
  return team.lineup.map(id => (id === weakest.id ? benchPlayerId : id))
}

export function updateTeam(state: GameState, teamId: number, patch: Partial<Team>): GameState {
  return { ...state, teams: state.teams.map(t => (t.id === teamId ? { ...t, ...patch } : t)) }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/lineup.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/engine/lineup.ts src/engine/lineup.test.ts
git commit -m "feat: lineup auto-pick and swap-in"
```

---

### Task 4: Fixture generation (double round-robin)

**Files:**
- Create: `src/engine/fixtures.ts`
- Test: `src/engine/fixtures.test.ts`

**Interfaces:**
- Consumes: `Fixture` from `./types`, `mulberry32` from `./rng` (in tests)
- Produces: `generateFixtures(teamIds: number[], rand: () => number): Fixture[]` — requires an even number of teams; returns `(n-1)*2` rounds of `n/2` matches

- [ ] **Step 1: Write the failing test**

`src/engine/fixtures.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { generateFixtures } from './fixtures'
import { mulberry32 } from './rng'

const ids = Array.from({ length: 16 }, (_, i) => i)

describe('generateFixtures', () => {
  it('generates a valid double round-robin for 16 teams', () => {
    const fixtures = generateFixtures(ids, mulberry32(1))
    expect(fixtures).toHaveLength(240) // 16*15 ordered pairs

    for (let r = 1; r <= 30; r++) {
      const inRound = fixtures.filter(f => f.round === r)
      expect(inRound).toHaveLength(8)
      const teams = inRound.flatMap(f => [f.homeId, f.awayId])
      expect(new Set(teams).size).toBe(16) // every team plays exactly once per round
    }

    const orderedPairs = new Set(fixtures.map(f => `${f.homeId}-${f.awayId}`))
    expect(orderedPairs.size).toBe(240) // each pairing home & away exactly once

    for (const f of fixtures) {
      expect(f.homeGoals).toBeNull()
      expect(f.awayGoals).toBeNull()
    }
  })

  it('is deterministic for the same rand', () => {
    expect(generateFixtures(ids, mulberry32(5))).toEqual(generateFixtures(ids, mulberry32(5)))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/fixtures.test.ts`
Expected: FAIL — cannot resolve `./fixtures`

- [ ] **Step 3: Implement**

`src/engine/fixtures.ts`:

```ts
import type { Fixture } from './types'

// Circle method: one team fixed, the rest rotate one seat per round.
export function generateFixtures(teamIds: number[], rand: () => number): Fixture[] {
  const ids = [...teamIds]
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
  }

  const n = ids.length
  const half = n / 2
  const rounds = n - 1
  const fixtures: Fixture[] = []
  let rot = ids.slice(1)

  for (let r = 0; r < rounds; r++) {
    const left = [ids[0], ...rot.slice(0, half - 1)]
    const right = rot.slice(half - 1).reverse()
    for (let m = 0; m < half; m++) {
      // alternate sides so no team hogs home games
      const [homeId, awayId] = (r + m) % 2 === 0 ? [left[m], right[m]] : [right[m], left[m]]
      fixtures.push({ round: r + 1, homeId, awayId, homeGoals: null, awayGoals: null })
      fixtures.push({ round: r + 1 + rounds, homeId: awayId, awayId: homeId, homeGoals: null, awayGoals: null })
    }
    rot = [rot[rot.length - 1], ...rot.slice(0, -1)]
  }
  return fixtures.sort((a, b) => a.round - b.round)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/fixtures.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/engine/fixtures.ts src/engine/fixtures.test.ts
git commit -m "feat: double round-robin fixture generation"
```

---

### Task 5: Name pools and world generation

**Files:**
- Create: `src/engine/names.ts`, `src/engine/newGame.ts`
- Test: `src/engine/newGame.test.ts`

**Interfaces:**
- Consumes: `mulberry32`, `randInt` from `./rng`; `autoPick` from `./lineup`; `generateFixtures` from `./fixtures`; types
- Produces:
  - `names.ts`: `TEAM_NAMES: string[]` (16 entries), `randomName(rand: () => number): string`
  - `newGame.ts`: `newGame(seed: number): GameState` — user always manages `teams[0]`

- [ ] **Step 1: Write the failing test**

`src/engine/newGame.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { newGame } from './newGame'

describe('newGame', () => {
  it('builds a full, valid world', () => {
    const state = newGame(123)
    expect(state.teams).toHaveLength(16)
    expect(Object.keys(state.players)).toHaveLength(16 * 18)
    expect(state.season).toBe(1)
    expect(state.round).toBe(1)
    expect(state.userTeamId).toBe(state.teams[0].id)
    expect(state.fixtures).toHaveLength(240)

    const teamNames = new Set(state.teams.map(t => t.name))
    expect(teamNames.size).toBe(16)

    for (const team of state.teams) {
      expect(team.playerIds).toHaveLength(18)
      expect(team.lineup).toHaveLength(11)
      for (const id of team.playerIds) {
        const p = state.players[id]
        expect(p.level).toBeGreaterThanOrEqual(30)
        expect(p.level).toBeLessThanOrEqual(70)
        expect(p.age).toBeGreaterThanOrEqual(17)
        expect(p.age).toBeLessThanOrEqual(34)
      }
    }
  })

  it('is deterministic for the same seed', () => {
    expect(newGame(99)).toEqual(newGame(99))
  })

  it('differs between seeds', () => {
    expect(newGame(1)).not.toEqual(newGame(2))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/newGame.test.ts`
Expected: FAIL — cannot resolve `./newGame`

- [ ] **Step 3: Implement**

`src/engine/names.ts`:

```ts
export const TEAM_NAMES = [
  'União FC', 'Real Bragança', 'Atlético do Vale', 'EC Litoral',
  'Nacional AC', 'Portuária FC', 'Ferroviário EC', 'Comercial FC',
  'Operário FC', 'Independência', 'Guarani do Norte', 'Estrela do Sul',
  'Marítimo FC', 'Alvorada EC', 'Cruzeiro do Oeste', 'Tupi da Serra',
]

const FIRST = [
  'Carlos', 'João', 'Pedro', 'Lucas', 'Rafael', 'Bruno', 'Diego', 'Thiago',
  'Marcos', 'Felipe', 'Gustavo', 'Eduardo', 'Ricardo', 'André', 'Paulo',
  'Sérgio', 'Fábio', 'Rodrigo', 'Leandro', 'Márcio', 'Vinícius', 'Igor',
  'Renato', 'Alex', 'Daniel', 'Everton', 'Wesley', 'Júlio', 'Caio', 'Otávio',
]

const LAST = [
  'Silva', 'Santos', 'Oliveira', 'Souza', 'Pereira', 'Costa', 'Almeida',
  'Ferreira', 'Rodrigues', 'Gomes', 'Martins', 'Araújo', 'Ribeiro', 'Barbosa',
  'Cardoso', 'Nascimento', 'Moreira', 'Carvalho', 'Teixeira', 'Rocha',
  'Dias', 'Monteiro', 'Mendes', 'Freitas', 'Ramos', 'Vieira', 'Nunes',
  'Moura', 'Cavalcanti', 'Batista',
]

export function randomName(rand: () => number): string {
  const first = FIRST[Math.floor(rand() * FIRST.length)]
  const last = LAST[Math.floor(rand() * LAST.length)]
  return `${first} ${last}`
}
```

`src/engine/newGame.ts`:

```ts
import { generateFixtures } from './fixtures'
import { autoPick } from './lineup'
import { randomName, TEAM_NAMES } from './names'
import { mulberry32, randInt } from './rng'
import type { GameState, Player, Position, Team } from './types'

// 2 GK, 6 DF, 6 MF, 4 FW — enough to fill every formation in FORMATIONS
const SQUAD_TEMPLATE: Position[] = [
  'GK', 'GK',
  'DF', 'DF', 'DF', 'DF', 'DF', 'DF',
  'MF', 'MF', 'MF', 'MF', 'MF', 'MF',
  'FW', 'FW', 'FW', 'FW',
]

export function newGame(seed: number): GameState {
  const rand = mulberry32(seed)
  const players: Record<number, Player> = {}
  const teams: Team[] = []
  let nextPlayerId = 1

  for (let t = 0; t < 16; t++) {
    const playerIds: number[] = []
    for (const position of SQUAD_TEMPLATE) {
      const player: Player = {
        id: nextPlayerId++,
        name: randomName(rand),
        age: randInt(rand, 17, 34),
        position,
        level: randInt(rand, 30, 70),
      }
      players[player.id] = player
      playerIds.push(player.id)
    }
    teams.push({ id: t, name: TEAM_NAMES[t], playerIds, formation: '4-4-2', lineup: [] })
  }

  for (const team of teams) team.lineup = autoPick(team, players)

  return {
    version: 1,
    seed,
    rngState: randInt(rand, 1, 2 ** 31 - 1),
    season: 1,
    round: 1,
    userTeamId: teams[0].id, // ponytail: user always gets team 0; team-picker screen when someone asks
    players,
    teams,
    fixtures: generateFixtures(teams.map(t => t.id), rand),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/newGame.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/engine/names.ts src/engine/newGame.ts src/engine/newGame.test.ts
git commit -m "feat: world generation with name pools"
```

---

### Task 6: Instant match simulation

**Files:**
- Create: `src/engine/match.ts`
- Test: `src/engine/match.test.ts`

**Interfaces:**
- Consumes: `Team`, `Player` from `./types`
- Produces:
  - `teamStrength(team: Team, players: Record<number, Player>): number` — sum of lineup levels
  - `simulateMatch(home: Team, away: Team, players: Record<number, Player>, rand: () => number): { homeGoals: number; awayGoals: number }`

- [ ] **Step 1: Write the failing test**

`src/engine/match.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { simulateMatch, teamStrength } from './match'
import { mulberry32 } from './rng'
import type { Player, Position, Team } from './types'

function makeTeam(id: number, level: number, players: Record<number, Player>): Team {
  const positions: Position[] = ['GK', 'DF', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'MF', 'FW', 'FW']
  const lineup = positions.map((position, i) => {
    const pid = id * 100 + i
    players[pid] = { id: pid, name: `P${pid}`, age: 25, position, level }
    return pid
  })
  return { id, name: `T${id}`, playerIds: [...lineup], formation: '4-4-2', lineup }
}

describe('teamStrength', () => {
  it('sums lineup levels', () => {
    const players: Record<number, Player> = {}
    const team = makeTeam(1, 50, players)
    expect(teamStrength(team, players)).toBe(550)
  })
})

describe('simulateMatch', () => {
  it('is deterministic for the same rand', () => {
    const players: Record<number, Player> = {}
    const a = makeTeam(1, 60, players)
    const b = makeTeam(2, 55, players)
    expect(simulateMatch(a, b, players, mulberry32(9))).toEqual(simulateMatch(a, b, players, mulberry32(9)))
  })

  it('produces sane scorelines', () => {
    const players: Record<number, Player> = {}
    const a = makeTeam(1, 60, players)
    const b = makeTeam(2, 55, players)
    const rand = mulberry32(3)
    for (let i = 0; i < 500; i++) {
      const { homeGoals, awayGoals } = simulateMatch(a, b, players, rand)
      expect(homeGoals).toBeGreaterThanOrEqual(0)
      expect(homeGoals).toBeLessThanOrEqual(12)
      expect(awayGoals).toBeGreaterThanOrEqual(0)
      expect(awayGoals).toBeLessThanOrEqual(12)
    }
  })

  it('lets the clearly stronger team win far more often', () => {
    const players: Record<number, Player> = {}
    const strong = makeTeam(1, 90, players)
    const weak = makeTeam(2, 40, players)
    const rand = mulberry32(42)
    let strongWins = 0
    let weakWins = 0
    for (let i = 0; i < 500; i++) {
      const { homeGoals, awayGoals } = simulateMatch(strong, weak, players, rand)
      if (homeGoals > awayGoals) strongWins++
      if (awayGoals > homeGoals) weakWins++
    }
    expect(strongWins).toBeGreaterThan(weakWins * 2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/match.test.ts`
Expected: FAIL — cannot resolve `./match`

- [ ] **Step 3: Implement**

`src/engine/match.ts`:

```ts
import type { Player, Team } from './types'

export function teamStrength(team: Team, players: Record<number, Player>): number {
  return team.lineup.reduce((sum, id) => sum + players[id].level, 0)
}

// Knuth's method — fine for lambda < ~10
function poisson(lambda: number, rand: () => number): number {
  const limit = Math.exp(-lambda)
  let k = 0
  let p = 1
  do {
    k++
    p *= rand()
  } while (p > limit)
  return k - 1
}

const AVG_TOTAL_GOALS = 2.7

// ponytail: whole-team strength ratio, squared to reward quality gaps.
// Attack/defense split, home advantage, and form arrive in Phase 2.
export function simulateMatch(
  home: Team,
  away: Team,
  players: Record<number, Player>,
  rand: () => number,
): { homeGoals: number; awayGoals: number } {
  const sh = teamStrength(home, players) ** 2
  const sa = teamStrength(away, players) ** 2
  const homeShare = sh / (sh + sa)
  return {
    homeGoals: poisson(AVG_TOTAL_GOALS * homeShare, rand),
    awayGoals: poisson(AVG_TOTAL_GOALS * (1 - homeShare), rand),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/match.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/engine/match.ts src/engine/match.test.ts
git commit -m "feat: instant match simulation"
```

---

### Task 7: Standings

**Files:**
- Create: `src/engine/standings.ts`
- Test: `src/engine/standings.test.ts`

**Interfaces:**
- Consumes: `GameState`, `Fixture` from `./types`
- Produces:
  - `interface Standing { teamId: number; played: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number; points: number }`
  - `standings(state: GameState): Standing[]` — sorted by points, then goal difference, then goals for

- [ ] **Step 1: Write the failing test**

`src/engine/standings.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { standings } from './standings'
import type { Fixture, GameState, Team } from './types'

function makeState(fixtures: Fixture[]): GameState {
  const teams: Team[] = [0, 1, 2].map(id => ({
    id, name: `T${id}`, playerIds: [], formation: '4-4-2', lineup: [],
  }))
  return {
    version: 1, seed: 1, rngState: 1, season: 1, round: 1,
    userTeamId: 0, players: {}, teams, fixtures,
  }
}

describe('standings', () => {
  it('awards 3/1/0 points and sorts by points, GD, GF', () => {
    const state = makeState([
      { round: 1, homeId: 0, awayId: 1, homeGoals: 3, awayGoals: 0 }, // 0 beats 1
      { round: 1, homeId: 2, awayId: 0, homeGoals: 1, awayGoals: 1 }, // 2 draws 0
      { round: 2, homeId: 1, awayId: 2, homeGoals: 0, awayGoals: 2 }, // 2 beats 1
      { round: 2, homeId: 0, awayId: 2, homeGoals: null, awayGoals: null }, // unplayed — ignored
    ])
    const rows = standings(state)
    expect(rows.map(r => r.teamId)).toEqual([0, 2, 1]) // 0: 4pts GD+3; 2: 4pts GD+2; 1: 0pts
    expect(rows[0]).toEqual({
      teamId: 0, played: 2, won: 1, drawn: 1, lost: 0,
      goalsFor: 4, goalsAgainst: 1, points: 4,
    })
    expect(rows[2].points).toBe(0)
  })

  it('lists every team even before any match', () => {
    const rows = standings(makeState([]))
    expect(rows).toHaveLength(3)
    expect(rows.every(r => r.played === 0 && r.points === 0)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/standings.test.ts`
Expected: FAIL — cannot resolve `./standings`

- [ ] **Step 3: Implement**

`src/engine/standings.ts`:

```ts
import type { GameState } from './types'

export interface Standing {
  teamId: number
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  points: number
}

export function standings(state: GameState): Standing[] {
  const rows = new Map<number, Standing>()
  for (const t of state.teams) {
    rows.set(t.id, {
      teamId: t.id, played: 0, won: 0, drawn: 0, lost: 0,
      goalsFor: 0, goalsAgainst: 0, points: 0,
    })
  }
  for (const f of state.fixtures) {
    if (f.homeGoals === null || f.awayGoals === null) continue
    const h = rows.get(f.homeId)!
    const a = rows.get(f.awayId)!
    h.played++; a.played++
    h.goalsFor += f.homeGoals; h.goalsAgainst += f.awayGoals
    a.goalsFor += f.awayGoals; a.goalsAgainst += f.homeGoals
    if (f.homeGoals > f.awayGoals) { h.won++; h.points += 3; a.lost++ }
    else if (f.homeGoals < f.awayGoals) { a.won++; a.points += 3; h.lost++ }
    else { h.drawn++; a.drawn++; h.points++; a.points++ }
  }
  return [...rows.values()].sort(
    (x, y) =>
      y.points - x.points ||
      (y.goalsFor - y.goalsAgainst) - (x.goalsFor - x.goalsAgainst) ||
      y.goalsFor - x.goalsFor,
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/standings.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/engine/standings.ts src/engine/standings.test.ts
git commit -m "feat: league standings"
```

---

### Task 8: Season loop (advanceRound, newSeason)

**Files:**
- Create: `src/engine/season.ts`
- Test: `src/engine/season.test.ts`

**Interfaces:**
- Consumes: `simulateMatch` from `./match`; `generateFixtures` from `./fixtures`; `mulberry32`, `randInt` from `./rng`; types
- Produces:
  - `totalRounds(state: GameState): number` — `(teams.length - 1) * 2`
  - `advanceRound(state: GameState): GameState` — simulates the current round's fixtures, advances `round`, refreshes `rngState`; no-op when season is over
  - `newSeason(state: GameState): GameState` — season+1, round 1, fresh fixtures

- [ ] **Step 1: Write the failing test**

`src/engine/season.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { newGame } from './newGame'
import { advanceRound, newSeason, totalRounds } from './season'

describe('advanceRound', () => {
  it('plays exactly the current round and advances', () => {
    const s0 = newGame(123)
    const s1 = advanceRound(s0)
    expect(s1.round).toBe(2)
    expect(s1.fixtures.filter(f => f.round === 1).every(f => f.homeGoals !== null)).toBe(true)
    expect(s1.fixtures.filter(f => f.round === 2).every(f => f.homeGoals === null)).toBe(true)
    expect(s0.round).toBe(1) // input state untouched
  })

  it('is deterministic', () => {
    const s0 = newGame(123)
    expect(advanceRound(s0)).toEqual(advanceRound(s0))
  })

  it('plays a whole season and then no-ops', () => {
    let s = newGame(7)
    for (let i = 0; i < totalRounds(s); i++) s = advanceRound(s)
    expect(s.round).toBe(totalRounds(s) + 1)
    expect(s.fixtures.every(f => f.homeGoals !== null)).toBe(true)
    expect(advanceRound(s)).toEqual(s)
  })
})

describe('newSeason', () => {
  it('resets the calendar and bumps the season', () => {
    let s = newGame(7)
    for (let i = 0; i < totalRounds(s); i++) s = advanceRound(s)
    const s2 = newSeason(s)
    expect(s2.season).toBe(2)
    expect(s2.round).toBe(1)
    expect(s2.fixtures).toHaveLength(240)
    expect(s2.fixtures.every(f => f.homeGoals === null)).toBe(true)
    expect(s2.teams).toEqual(s.teams) // squads carry over
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/season.test.ts`
Expected: FAIL — cannot resolve `./season`

- [ ] **Step 3: Implement**

`src/engine/season.ts`:

```ts
import { generateFixtures } from './fixtures'
import { simulateMatch } from './match'
import { mulberry32, randInt } from './rng'
import type { GameState } from './types'

export function totalRounds(state: GameState): number {
  return (state.teams.length - 1) * 2
}

export function advanceRound(state: GameState): GameState {
  if (state.round > totalRounds(state)) return state
  const rand = mulberry32(state.rngState)
  const fixtures = state.fixtures.map(f => {
    if (f.round !== state.round) return f
    const home = state.teams.find(t => t.id === f.homeId)!
    const away = state.teams.find(t => t.id === f.awayId)!
    const result = simulateMatch(home, away, state.players, rand)
    return { ...f, homeGoals: result.homeGoals, awayGoals: result.awayGoals }
  })
  return { ...state, fixtures, round: state.round + 1, rngState: randInt(rand, 1, 2 ** 31 - 1) }
}

export function newSeason(state: GameState): GameState {
  const rand = mulberry32(state.rngState)
  return {
    ...state,
    season: state.season + 1,
    round: 1,
    fixtures: generateFixtures(state.teams.map(t => t.id), rand),
    rngState: randInt(rand, 1, 2 ** 31 - 1),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/season.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/engine/season.ts src/engine/season.test.ts
git commit -m "feat: round advancement and season rollover"
```

---

### Task 9: Save / load

**Files:**
- Create: `src/engine/save.ts`
- Test: `src/engine/save.test.ts`

**Interfaces:**
- Consumes: `GameState` from `./types`
- Produces:
  - `save(state: GameState, storage?: Storage): void`
  - `load(storage?: Storage): GameState | null` — null on missing key or version mismatch

- [ ] **Step 1: Write the failing test**

`src/engine/save.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { newGame } from './newGame'
import { load, save } from './save'

function fakeStorage(): Storage {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() { return m.size },
  } as Storage
}

describe('save/load', () => {
  it('round-trips a game state', () => {
    const storage = fakeStorage()
    const state = newGame(7)
    save(state, storage)
    expect(load(storage)).toEqual(state)
  })

  it('returns null when nothing is saved', () => {
    expect(load(fakeStorage())).toBeNull()
  })

  it('returns null on version mismatch', () => {
    const storage = fakeStorage()
    storage.setItem('futscript-save', JSON.stringify({ version: 999 }))
    expect(load(storage)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/save.test.ts`
Expected: FAIL — cannot resolve `./save`

- [ ] **Step 3: Implement**

`src/engine/save.ts`:

```ts
import type { GameState } from './types'

const KEY = 'futscript-save'

export function save(state: GameState, storage: Storage = localStorage): void {
  storage.setItem(KEY, JSON.stringify(state))
}

export function load(storage: Storage = localStorage): GameState | null {
  const raw = storage.getItem(KEY)
  if (!raw) return null
  const state = JSON.parse(raw) as GameState
  return state.version === 1 ? state : null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/save.test.ts`
Expected: PASS (3 tests). Also run the full suite once: `npm test` — everything green.

- [ ] **Step 5: Commit**

```bash
git add src/engine/save.ts src/engine/save.test.ts
git commit -m "feat: localStorage save/load"
```

---

### Task 10: App shell — header, advance button, table and fixtures screens

**Files:**
- Create: `src/screens/TableScreen.tsx`, `src/screens/FixturesScreen.tsx`
- Modify: `src/App.tsx` (replace template content), `src/index.css` (replace template content)
- Delete: `src/App.css`, `src/assets/react.svg` (template leftovers; remove their imports)

**Interfaces:**
- Consumes: everything from Tasks 5–9
- Produces: `App` renders `SquadScreen` (Task 11) via `{screen === 'squad' && <SquadScreen state={state} setState={setState} />}` — until Task 11 lands, leave that line commented with the squad tab showing `<p>Squad screen coming next.</p>`

- [ ] **Step 1: Replace `src/App.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { newGame } from './engine/newGame'
import { load, save } from './engine/save'
import { advanceRound, newSeason, totalRounds } from './engine/season'
import { standings } from './engine/standings'
import type { GameState } from './engine/types'
import FixturesScreen from './screens/FixturesScreen'
import TableScreen from './screens/TableScreen'

type Screen = 'squad' | 'table' | 'fixtures'

export default function App() {
  const [state, setState] = useState<GameState>(() => load() ?? newGame(Date.now() % 2147483647))
  const [screen, setScreen] = useState<Screen>('table')
  useEffect(() => { save(state) }, [state])

  const userTeam = state.teams.find(t => t.id === state.userTeamId)!
  const total = totalRounds(state)
  const seasonOver = state.round > total
  const champion = seasonOver ? state.teams.find(t => t.id === standings(state)[0].teamId)! : null

  return (
    <div className="app">
      <header>
        <h1>Futscript</h1>
        <span>
          {userTeam.name} — Season {state.season}, Round {Math.min(state.round, total)}/{total}
        </span>
        {seasonOver
          ? <button onClick={() => setState(newSeason)}>New Season</button>
          : <button onClick={() => setState(advanceRound)}>Advance Round</button>}
      </header>
      {champion && <div className="banner">🏆 {champion.name} are the season {state.season} champions!</div>}
      <nav>
        {(['squad', 'table', 'fixtures'] as Screen[]).map(s => (
          <button key={s} className={screen === s ? 'active' : ''} onClick={() => setScreen(s)}>
            {s}
          </button>
        ))}
      </nav>
      {screen === 'squad' && <p>Squad screen coming next.</p>}
      {screen === 'table' && <TableScreen state={state} />}
      {screen === 'fixtures' && <FixturesScreen state={state} />}
    </div>
  )
}
```

Remove `import './App.css'` if present; delete `src/App.css` and `src/assets/react.svg`.

- [ ] **Step 2: Create `src/screens/TableScreen.tsx`**

```tsx
import { standings } from '../engine/standings'
import type { GameState } from '../engine/types'

export default function TableScreen({ state }: { state: GameState }) {
  const rows = standings(state)
  const name = (id: number) => state.teams.find(t => t.id === id)!.name
  return (
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
  )
}
```

- [ ] **Step 3: Create `src/screens/FixturesScreen.tsx`**

```tsx
import { useState } from 'react'
import { totalRounds } from '../engine/season'
import type { GameState } from '../engine/types'

export default function FixturesScreen({ state }: { state: GameState }) {
  const total = totalRounds(state)
  const [round, setRound] = useState(() => Math.min(Math.max(state.round - 1, 1), total))
  const name = (id: number) => state.teams.find(t => t.id === id)!.name
  const fixtures = state.fixtures.filter(f => f.round === round)
  return (
    <div>
      <div className="round-nav">
        <button disabled={round <= 1} onClick={() => setRound(round - 1)}>‹</button>
        <span>Round {round}</span>
        <button disabled={round >= total} onClick={() => setRound(round + 1)}>›</button>
      </div>
      <table>
        <tbody>
          {fixtures.map((f, i) => (
            <tr key={i}>
              <td className="home">{name(f.homeId)}</td>
              <td>{f.homeGoals === null ? 'vs' : `${f.homeGoals} – ${f.awayGoals}`}</td>
              <td>{name(f.awayId)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 4: Replace `src/index.css`**

```css
:root {
  font-family: system-ui, sans-serif;
  color-scheme: light dark;
}

body { margin: 0; }
.app { max-width: 720px; margin: 0 auto; padding: 1rem; }

header { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
header h1 { margin: 0; font-size: 1.4rem; }
header button { margin-left: auto; }

.banner { padding: 0.5rem; background: gold; color: black; border-radius: 4px; margin-top: 0.5rem; }

nav { display: flex; gap: 0.5rem; margin: 1rem 0; }
nav button { text-transform: capitalize; }
nav button.active { font-weight: bold; text-decoration: underline; }

table { border-collapse: collapse; width: 100%; }
th, td { padding: 0.3rem 0.5rem; text-align: left; }
tbody tr:nth-child(odd) { background: rgba(128, 128, 128, 0.1); }
tr.user { outline: 2px solid seagreen; }
tr.starting { background: rgba(46, 139, 87, 0.25) !important; }

.round-nav { display: flex; gap: 1rem; align-items: center; margin-bottom: 0.5rem; }
td.home { text-align: right; }
```

- [ ] **Step 5: Verify manually**

Run: `npm run dev` and open the URL. Check:
- Header shows your team, Season 1, Round 1/30.
- Table lists 16 teams, all zeros; your team highlighted.
- Advance Round fills in results; fixtures screen shows scores for round 1, `vs` for round 2.
- Click Advance 30 times: champion banner appears, button becomes New Season, clicking it resets to Round 1.
- Reload the page: state persists (same round, same results).

Also run `npm test` — all engine tests still green.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: app shell with table and fixtures screens"
```

---

### Task 11: Squad screen

**Files:**
- Create: `src/screens/SquadScreen.tsx`
- Modify: `src/App.tsx` (replace the squad placeholder with the real screen)

**Interfaces:**
- Consumes: `autoPick`, `swapIn`, `updateTeam` from `../engine/lineup`; `FORMATIONS`, `FormationName`, `GameState`, `Position` from `../engine/types`
- Produces: default-export React component `SquadScreen({ state, setState })` with `setState: Dispatch<SetStateAction<GameState>>`

- [ ] **Step 1: Create `src/screens/SquadScreen.tsx`**

All state reads inside `setState` updaters must come from the updater's argument `s`, never from the outer render scope — avoids stale closures.

```tsx
import type { Dispatch, SetStateAction } from 'react'
import { autoPick, swapIn, updateTeam } from '../engine/lineup'
import { FORMATIONS, type FormationName, type GameState, type Position } from '../engine/types'

const ORDER: Position[] = ['GK', 'DF', 'MF', 'FW']

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
        <button onClick={() => withUserTeam((s, t) => updateTeam(s, t.id, { lineup: autoPick(t, s.players) }))}>
          Auto-pick
        </button>
      </div>
      <table>
        <thead>
          <tr><th>Pos</th><th>Name</th><th>Age</th><th>Level</th><th></th></tr>
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
                <td>
                  {starting
                    ? 'Starting'
                    : <button onClick={() => withUserTeam((s, t) => updateTeam(s, t.id, { lineup: swapIn(t, s.players, p.id) }))}>
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

- [ ] **Step 2: Wire into `src/App.tsx`**

Add the import and replace the placeholder line:

```tsx
import SquadScreen from './screens/SquadScreen'
```

```tsx
{screen === 'squad' && <SquadScreen state={state} setState={setState} />}
```

- [ ] **Step 3: Verify manually**

Run: `npm run dev`. On the Squad tab check:
- 18 players grouped GK→DF→MF→FW, starters highlighted, exactly 11 starting.
- Changing formation re-picks the lineup with the right position counts (e.g. 4-3-3 → 3 FW starting).
- Clicking Start on a benched player swaps out the weakest starter of that position.
- Auto-pick restores the best XI after manual changes.
- Advance a round, reload the page — formation and lineup persist.

Run `npm test` — all green.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: squad screen with formation picker and lineup editing"
```

---

### Task 12: Phase 1 acceptance check

**Files:** none new.

**Interfaces:** none — this is the "done when" gate from the spec.

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all tests pass (rng, lineup, fixtures, newGame, match, standings, season, save).

- [ ] **Step 2: Play a season end-to-end**

Run: `npm run dev`. In the browser: set a formation, tweak the lineup, advance all 30 rounds, confirm the champion banner, start season 2, advance one round, reload the page and confirm persistence. The spec's Phase 1 gate: *"a full season can be played and won or lost."*

- [ ] **Step 3: Commit any stragglers and tag**

```bash
git add -A
git commit -m "chore: phase 1 complete" --allow-empty
git tag phase-1
```
