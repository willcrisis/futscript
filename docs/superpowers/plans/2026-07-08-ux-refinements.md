# UX Refinements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship nine post-playtest UX refinements: free XI selection, a green-dot starter marker, faded past-week news, auto-deselection of injured/suspended players, icon status column, Continue→dashboard, reversed cup order, delisting, and live match attendance.

**Architecture:** Three tiny pure-engine additions (`toggleStarter`/`managedMatchLineup`, `delistPlayer`, `attendanceFor`) plus season/finance wiring; the rest is UI + i18n. The match engine already reads the actual lineup by position, so "formation as suggestion" needs no simulation change. Attendance is computed once in `runWeeklyFinances` and stamped onto the fixture, so the match screen and the ledger show the same number with **no** change to the seeded RNG stream.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind v4, Vitest.

## Global Constraints

- Engine stays pure: no React/DOM/i18n imports in `src/engine/**`; randomness threaded through `rand`/`rngState`; money is integer dollars via `Math.round`.
- Semantic design tokens only (sanctioned exceptions: literal football-card colors in the new card pictogram, and `border-accent!`/`text-accent-strong!` same-property overrides matching existing usage). Reuse the `src/ui/` kit; light + dark; mobile-equal.
- i18n: any key added to `src/i18n/en.ts` MUST be added to `src/i18n/pt.ts` (typed `Record<TranslationKey, string>` — a missing key is a compile error). Remove retired keys from both.
- **No `GameState.version` bump.** The lineup is already an arbitrary subset of the squad; `attendance` is an additive optional field on fixtures, which regenerate each season.
- Typecheck with `npx tsc -b --force` (`tsc --noEmit` is a no-op in this repo). Full test run: `npm test`. Single file: `npx vitest run <path>`.
- Commit messages end with the repo's Co-Authored-By / Claude-Session trailers.

## File Structure

| File | Responsibility | Tasks |
|------|----------------|-------|
| `src/engine/lineup.ts` | add `toggleStarter`, `managedMatchLineup`; remove `swapIn` | 1 |
| `src/engine/lineup.test.ts` | tests for the above | 1 |
| `src/engine/transfers.ts` | add `delistPlayer` | 2 |
| `src/engine/transfers.test.ts` | test `delistPlayer` | 2 |
| `src/engine/season.ts` | managed lineup verbatim at match time; drop injured/suspended from user lineup post-matchday | 3 |
| `src/engine/season.test.ts` | invariant tests | 3 |
| `src/engine/types.ts` | `attendance?: number` on `Fixture`/`CupFixture` | 4 |
| `src/engine/finance.ts` | extract `attendanceFor`; stamp attendance on fixtures | 4 |
| `src/engine/finance.test.ts` | attendance unit + stamping integration | 4 |
| `src/screens/MatchScreen.tsx` | render attendance line | 4 |
| `src/ui/icons.tsx` | card/plus/minus/delist pictograms | 5 |
| `src/screens/SquadScreen.tsx` | XI toggle, green dot, icon status, delist button | 5 |
| `src/screens/SquadScreen.test.ts` | `statusKind` precedence | 5 |
| `src/App.tsx` | advance gate; Continue→Home | 6 |
| `src/ui/Shell.tsx` | disabled advance + hint | 6 |
| `src/screens/HomeScreen.tsx` | disabled advance + hint | 6 |
| `src/ui/NewsRail.tsx` | fade past-week rows | 7 |
| `src/screens/CupScreen.tsx` | reverse round order | 8 |
| `src/i18n/en.ts`, `src/i18n/pt.ts` | new/retired keys | 4, 5, 6 |

---

### Task 1: Engine — `toggleStarter` and `managedMatchLineup`

**Files:**
- Modify: `src/engine/lineup.ts` (add two functions; remove `swapIn` at lines 107–117)
- Test: `src/engine/lineup.test.ts`

**Interfaces:**
- Produces:
  - `toggleStarter(team: Team, playerId: number): number[]` — returns `team.lineup` with `playerId` removed if present, else appended. No shape enforcement.
  - `managedMatchLineup(team: Team, players: Record<number, Player>): number[]` — returns `team.lineup` verbatim when it is exactly 11 players and all available; otherwise `autoPick(team, players)`.
- Removes: `swapIn` (was the position-aware bench swap; no remaining callers after Tasks 3 and 5).
- Keeps: `autoPick`, `patchLineup`, `isAvailable`, `updateTeam` unchanged and still exported (`patchLineup` stays exported/tested even though `season.ts` stops calling it — deliberate: it is the natural home for a future auto-fill affordance and deleting a tested cluster is pure churn).

- [ ] **Step 1: Write the failing tests**

In `src/engine/lineup.test.ts`, change the import on line 2 from:
```ts
import { autoPick, isAvailable, patchLineup, swapIn } from './lineup'
```
to:
```ts
import { autoPick, isAvailable, managedMatchLineup, patchLineup, toggleStarter } from './lineup'
```
Delete the entire `describe('swapIn', () => { ... })` block (lines 55–85). In its place add:
```ts
describe('toggleStarter', () => {
  it('appends a benched player to the lineup', () => {
    const { team } = makeSquad()
    expect(toggleStarter({ ...team, lineup: [1, 2, 3] }, 4)).toEqual([1, 2, 3, 4])
  })

  it('removes a starting player from the lineup', () => {
    const { team } = makeSquad()
    expect(toggleStarter({ ...team, lineup: [1, 2, 3] }, 2)).toEqual([1, 3])
  })

  it('imposes no formation shape — a lopsided XI is allowed', () => {
    const { team } = makeSquad()
    // five forwards (15,16,17,18 + toggling in nobody new) — just prove add works past shape
    const lineup = [15, 16, 17, 18]
    expect(toggleStarter({ ...team, lineup }, 14)).toEqual([15, 16, 17, 18, 14])
  })
})

describe('managedMatchLineup', () => {
  it('keeps a valid 11-player lineup verbatim, ignoring formation shape', () => {
    const { team, players } = makeSquad()
    // 1 GK + 4 DF + 2 MF + 4 FW = 11, all available — not a 4-4-2
    const lineup = [1, 3, 4, 5, 6, 9, 10, 15, 16, 17, 18]
    expect(managedMatchLineup({ ...team, lineup }, players)).toEqual(lineup)
  })

  it('falls back to autoPick when the lineup is not exactly 11', () => {
    const { team, players } = makeSquad()
    const result = managedMatchLineup({ ...team, lineup: [1, 3, 4] }, players)
    expect(result).toHaveLength(11)
  })

  it('falls back to autoPick when a selected player is unavailable', () => {
    const { team, players } = makeSquad()
    const lineup = [1, 3, 4, 5, 6, 9, 10, 15, 16, 17, 18]
    players[1] = { ...players[1], injuredForRounds: 2 }
    const result = managedMatchLineup({ ...team, lineup }, players)
    expect(result).not.toEqual(lineup)
    expect(result.every(id => isAvailable(players[id]))).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/engine/lineup.test.ts`
Expected: FAIL — `toggleStarter`/`managedMatchLineup` are not exported.

- [ ] **Step 3: Implement**

In `src/engine/lineup.ts`, delete `swapIn` (lines 107–117 including its `// ponytail:` comment) and add:
```ts
export function toggleStarter(team: Team, playerId: number): number[] {
  return team.lineup.includes(playerId)
    ? team.lineup.filter(id => id !== playerId)
    : [...team.lineup, playerId]
}

// The managed team's XI is user-curated (formation is only a suggestion). Trust it
// verbatim when it's a legal 11; the advance gate + post-matchday cleanup keep it so.
// autoPick is the safety net for a degraded or half-built lineup that slips through.
export function managedMatchLineup(team: Team, players: Record<number, Player>): number[] {
  const valid = team.lineup.length === 11 && team.lineup.every(id => isAvailable(players[id]))
  return valid ? team.lineup : autoPick(team, players)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/engine/lineup.test.ts`
Expected: PASS (all describes, including the retained `autoPick`/`patchLineup`/availability tests).

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc -b --force`
Expected: no errors.
```bash
git add src/engine/lineup.ts src/engine/lineup.test.ts
git commit -m "feat(engine): toggleStarter + managedMatchLineup, drop swapIn"
```

---

### Task 2: Engine — `delistPlayer`

**Files:**
- Modify: `src/engine/transfers.ts`
- Test: `src/engine/transfers.test.ts`

**Interfaces:**
- Produces: `delistPlayer(state: GameState, playerId: number): GameState` — removes the user's own listing from `state.transferList` (dropping any pending bid on it). A no-op returning the same `state` when the player is not listed or the listing isn't the user's.

- [ ] **Step 1: Write the failing test**

Append to `src/engine/transfers.test.ts` (it already imports from `./transfers` and `./newGame`; add `delistPlayer` and `listPlayer` to the existing import from `./transfers` if not already present):
```ts
describe('delistPlayer', () => {
  it('removes the user own listing and any bid on it', () => {
    let s = newGame(1)
    const mine = s.teams.find(t => t.id === s.userTeamId)!.playerIds[0]
    s = listPlayer(s, mine, 500_000)
    expect(s.transferList.some(l => l.playerId === mine)).toBe(true)
    s = delistPlayer(s, mine)
    expect(s.transferList.some(l => l.playerId === mine)).toBe(false)
  })

  it('is a no-op for a player that is not listed', () => {
    const s = newGame(1)
    const mine = s.teams.find(t => t.id === s.userTeamId)!.playerIds[0]
    expect(delistPlayer(s, mine)).toBe(s)
  })
})
```
(If `transfers.test.ts` lacks a `newGame` import, add `import { newGame } from './newGame'` at the top.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/engine/transfers.test.ts`
Expected: FAIL — `delistPlayer` is not exported.

- [ ] **Step 3: Implement**

In `src/engine/transfers.ts`, add after `listPlayer`:
```ts
export function delistPlayer(state: GameState, playerId: number): GameState {
  const listing = state.transferList.find(l => l.playerId === playerId)
  if (!listing || listing.sellerTeamId !== state.userTeamId) return state
  return { ...state, transferList: state.transferList.filter(l => l.playerId !== playerId) }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/engine/transfers.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc -b --force`
Expected: no errors.
```bash
git add src/engine/transfers.ts src/engine/transfers.test.ts
git commit -m "feat(engine): delistPlayer cancels a user listing"
```

---

### Task 3: Engine — managed lineup verbatim + auto-deselect injured/suspended

**Files:**
- Modify: `src/engine/season.ts` (import line ~5; match-refresh at lines 74–78; post-matchday cleanup before line 143)
- Test: `src/engine/season.test.ts`

**Interfaces:**
- Consumes: `managedMatchLineup`, `autoPick`, `isAvailable` from `./lineup` (Task 1).
- Behavior:
  - At match refresh, the managed team's lineup is taken verbatim via `managedMatchLineup` (no formation reshape); AI teams keep `autoPick`.
  - After this round's injuries/suspensions are applied, the user's lineup drops any now-unavailable players (no auto-refill — the App gate in Task 6 makes the user pick replacements).

- [ ] **Step 1: Write the failing test**

Append to `src/engine/season.test.ts` (it already imports `advanceRound` and `newGame`; verify those imports exist, add if missing):
```ts
describe('user lineup hygiene', () => {
  it('never contains an injured or suspended player after a round', () => {
    let s = newGame(1)
    for (let i = 0; i < 12; i++) {
      s = advanceRound(s)
      const user = s.teams.find(t => t.id === s.userTeamId)!
      for (const id of user.lineup) {
        expect(s.players[id].injuredForRounds).toBe(0)
        expect(s.players[id].suspendedForRounds).toBe(0)
      }
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/engine/season.test.ts`
Expected: FAIL — currently a starter injured this round remains in the saved lineup until the next pre-match patch, so at least one iteration finds `injuredForRounds > 0` in `user.lineup`.

(If it happens to pass on seed 1 because no user starter is hurt across 12 rounds, temporarily raise the loop bound to 30 to confirm the failure, then restore 12. The implementation in Step 3 makes it pass at any bound.)

- [ ] **Step 3: Implement**

In `src/engine/season.ts`:

Change the import (line ~5) from:
```ts
import { autoPick, patchLineup } from './lineup'
```
to:
```ts
import { autoPick, isAvailable, managedMatchLineup } from './lineup'
```

Replace the match-refresh block (lines 74–78):
```ts
  const teams = state.teams.map(t =>
    playingIds.has(t.id)
      ? { ...t, lineup: isManaged(state, t.id) ? patchLineup(t, state.players) : autoPick(t, state.players) }
      : t,
  )
```
with:
```ts
  const teams = state.teams.map(t =>
    playingIds.has(t.id)
      ? { ...t, lineup: isManaged(state, t.id) ? managedMatchLineup(t, state.players) : autoPick(t, state.players) }
      : t,
  )
```

Then, immediately before the line that builds `s` (currently `let s: GameState = { ...state, teams: teamsWithMood, players, fixtures, cupFixtures }`), add the cleanup and use it:
```ts
  // freshly injured/suspended user players leave the XI at once (no auto-refill —
  // the advance gate makes the manager pick replacements). Formation stays a suggestion.
  const cleanedTeams = teamsWithMood.map(t =>
    isManaged(state, t.id) ? { ...t, lineup: t.lineup.filter(id => isAvailable(players[id])) } : t,
  )

  let s: GameState = { ...state, teams: cleanedTeams, players, fixtures, cupFixtures }
```
(Delete the old `let s: GameState = { ...state, teams: teamsWithMood, ... }` line — `cleanedTeams` replaces `teamsWithMood` here.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/engine/season.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite (regression) + typecheck**

Run: `npm test`
Expected: PASS — existing season/finance/career tests unchanged (the managed team still fields 11 in normal play; AI unchanged).
Run: `npx tsc -b --force`
Expected: no errors (confirms `patchLineup` is no longer imported here; it remains exported from `lineup.ts`).

- [ ] **Step 6: Commit**
```bash
git add src/engine/season.ts src/engine/season.test.ts
git commit -m "feat(engine): keep managed XI verbatim + auto-drop unavailable starters"
```

---

### Task 4: Attendance on the fixture + live match display

**Files:**
- Modify: `src/engine/types.ts` (`Fixture`, `CupFixture`)
- Modify: `src/engine/finance.ts` (extract `attendanceFor`; stamp fixtures)
- Modify: `src/screens/MatchScreen.tsx` (`MatchLike` + render)
- Modify: `src/i18n/en.ts`, `src/i18n/pt.ts` (`match.attendance`)
- Test: `src/engine/finance.test.ts`

**Interfaces:**
- Produces: `attendanceFor(team: Team, position: number, rand: () => number): number` — the gate crowd (0..capacity) for a home team at league `position` (1–16). Formula unchanged from the current inline computation, so the seeded RNG stream is identical.
- `runWeeklyFinances` returns state whose `fixtures`/`cupFixtures` carry `attendance` on this round's played home fixtures; the "Gate receipts (N fans)" ledger label's N equals that value.

- [ ] **Step 1: Write the failing tests**

In `src/engine/finance.test.ts`, add `attendanceFor` to the existing import from `./finance`, then append:
```ts
describe('attendance', () => {
  it('attendanceFor is deterministic and bounded by capacity', () => {
    const team = newGame(1).teams.find(t => t.id === newGame(1).userTeamId)!
    const a = attendanceFor(team, 1, mulberry32(5))
    const b = attendanceFor(team, 1, mulberry32(5))
    expect(a).toBe(b)
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThanOrEqual(team.capacity)
  })

  it('stamps user home attendance equal to the gate ledger fans', () => {
    let s = newGame(1)
    let checked = false
    for (let i = 0; i < 12 && !checked; i++) {
      const round = s.round
      s = advanceRound(s)
      const home = s.fixtures.find(f => f.round === round && f.homeId === s.userTeamId && f.attendance != null)
      if (home) {
        const gate = s.finances.find(e => e.round === round && e.label.startsWith('Gate receipts'))
        expect(gate).toBeDefined()
        expect(gate!.label).toContain(`(${home.attendance} fans)`)
        checked = true
      }
    }
    expect(checked).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/engine/finance.test.ts`
Expected: FAIL — `attendanceFor` not exported; `home.attendance` is `undefined`.

- [ ] **Step 3: Implement the type field**

In `src/engine/types.ts`, add `attendance?: number` to both interfaces:
```ts
export interface Fixture {
  round: number
  homeId: number
  awayId: number
  homeGoals: number | null
  awayGoals: number | null
  attendance?: number // home gate crowd, stamped when the match is settled
  events?: MatchEvent[]
}

export interface CupFixture {
  week: number
  cupRound: number
  homeId: number
  awayId: number
  homeGoals: number | null
  awayGoals: number | null
  winnerId: number | null
  attendance?: number // home gate crowd, stamped when the match is settled
  events?: MatchEvent[]
}
```

- [ ] **Step 4: Implement `attendanceFor` and stamping**

In `src/engine/finance.ts`, add the helper (after the `DIVISION_FACTOR` export near the top of the module, so it's in scope; `Team` and `randInt` are already imported):
```ts
// ponytail: gate attendance depends only on capacity, price, mood, league position, jitter —
// not the result. Computed once here; stamped on the fixture so the match screen and the
// ledger show the same number.
export function attendanceFor(team: Team, position: number, rand: () => number): number {
  const interest = Math.round((9_000 + 900 * (16 - position)) * (DIVISION_FACTOR[team.division] ?? 1))
  const priceFactor = (15 / team.ticketPrice) ** 1.5
  const moodFactor = 0.8 + (team.fanMood / 100) * 0.3
  return Math.max(0, Math.min(team.capacity, Math.round(interest * priceFactor * moodFactor) + randInt(rand, -500, 500)))
}
```

In `runWeeklyFinances`, declare a map before the `state.teams.map(...)` loop:
```ts
  const attendanceByHome = new Map<number, number>()
```
Replace the home-branch body (lines 90–101) — from `const interest = ...` through the `if (user) addEntry(\`Gate receipts...\`)` — with:
```ts
    if (homeThisRound.has(team.id)) {
      const attendance = attendanceFor(team, position.get(team.id)!, rand)
      attendanceByHome.set(team.id, attendance)
      const gate = attendance * team.ticketPrice
      cash += gate
      if (user) addEntry(`Gate receipts (${attendance} fans)`, gate)
    }
```
(The `randInt(rand, -500, 500)` draw now lives inside `attendanceFor`, called at the same point in the same team order — the RNG stream is unchanged.)

After the `state.teams.map(...)` loop closes (the loop assigned to `teams`), and before `const cashAfter = ...`, add:
```ts
  const fixtures = state.fixtures.map(f =>
    f.round === state.round && attendanceByHome.has(f.homeId)
      ? { ...f, attendance: attendanceByHome.get(f.homeId)! }
      : f,
  )
  const cupFixtures = state.cupFixtures.map(f =>
    f.week === state.round && attendanceByHome.has(f.homeId)
      ? { ...f, attendance: attendanceByHome.get(f.homeId)! }
      : f,
  )
```
Change the result construction from:
```ts
  let result: GameState = { ...state, teams, finances, brokeRounds }
```
to:
```ts
  let result: GameState = { ...state, teams, finances, brokeRounds, fixtures, cupFixtures }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/engine/finance.test.ts`
Expected: PASS. Then `npm test` — all existing finance/season tests still pass (proves no RNG/behavior drift).

- [ ] **Step 6: Match screen display**

In `src/screens/MatchScreen.tsx`, add `attendance?: number` to the `MatchLike` interface:
```ts
export interface MatchLike {
  homeId: number
  awayId: number
  homeGoals: number | null
  awayGoals: number | null
  winnerId?: number | null
  attendance?: number
  events?: MatchEvent[]
}
```
Under the minute line (`<div className="mt-1 font-mono text-sm tabular-nums text-ink-muted">{Math.min(minute, 90)}'</div>`), add:
```tsx
      {fixture.attendance != null && (
        <div className="mt-1 font-mono text-xs tabular-nums text-ink-faint">
          {t('match.attendance', { n: fixture.attendance.toLocaleString('en-US') })}
        </div>
      )}
```

- [ ] **Step 7: i18n keys**

In `src/i18n/en.ts` add (near the other `match.*` keys):
```ts
  'match.attendance': '{n} in attendance',
```
In `src/i18n/pt.ts` add the same key:
```ts
  'match.attendance': '{n} presentes',
```

- [ ] **Step 8: Typecheck and commit**

Run: `npx tsc -b --force`
Expected: no errors.
```bash
git add src/engine/types.ts src/engine/finance.ts src/engine/finance.test.ts src/screens/MatchScreen.tsx src/i18n/en.ts src/i18n/pt.ts
git commit -m "feat: stamp gate attendance on fixtures and show it during matches"
```

---

### Task 5: Squad screen — XI toggle, green dot, icon status, delist

**Files:**
- Modify: `src/ui/icons.tsx` (add `YellowCardIcon`, `PlusIcon`, `MinusIcon`, `DelistIcon`)
- Modify: `src/screens/SquadScreen.tsx`
- Modify: `src/i18n/en.ts`, `src/i18n/pt.ts`
- Test: `src/screens/SquadScreen.test.ts` (new)

**Interfaces:**
- Consumes: `toggleStarter` (Task 1), `delistPlayer` (Task 2).
- Produces (exported from `SquadScreen.tsx` for testing): `statusKind(p: Player): 'injured' | 'suspended' | 'cards' | null` — precedence injured > suspended > yellow cards > none.

- [ ] **Step 1: Add the icons**

In `src/ui/icons.tsx`, append (the shared `Icon` wrapper is stroke-only `currentColor`; the yellow card needs a fill so it's a standalone svg):
```tsx
// ponytail: literal football-card colors — a card reads yellow/red in any theme, not a token.
export const YellowCardIcon = ({ className }: { className?: string }) => (
  <svg width="11" height="15" viewBox="0 0 11 15" className={className} aria-hidden>
    <rect x="0.5" y="0.5" width="10" height="14" rx="1.5" fill="#eab308" />
  </svg>
)
export const PlusIcon = ({ className }: { className?: string }) => (
  <Icon className={className}><path d="M12 5v14M5 12h14" /></Icon>
)
export const MinusIcon = ({ className }: { className?: string }) => (
  <Icon className={className}><path d="M5 12h14" /></Icon>
)
// slashed tag = cancel listing
export const DelistIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M9 5H6a2 2 0 0 0-2 2v3l7 7 3-3" /><circle cx="8" cy="9" r="1" /><path d="M4 4l16 16" />
  </Icon>
)
```

- [ ] **Step 2: Write the failing `statusKind` test**

Create `src/screens/SquadScreen.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { statusKind } from './SquadScreen'
import type { Player } from '../engine/types'

function player(over: Partial<Player>): Player {
  return {
    id: 1, name: 'P', age: 25, position: 'MF', level: 50, form: 0, fitness: 100,
    injuredForRounds: 0, suspendedForRounds: 0, yellowCards: 0, salary: 5000, contractSeasons: 2, seasonGoals: 0,
    ...over,
  }
}

describe('statusKind', () => {
  it('returns null when the player is fully available', () => {
    expect(statusKind(player({}))).toBeNull()
  })
  it('injury outranks suspension and cards', () => {
    expect(statusKind(player({ injuredForRounds: 2, suspendedForRounds: 1, yellowCards: 2 }))).toBe('injured')
  })
  it('suspension outranks cards', () => {
    expect(statusKind(player({ suspendedForRounds: 1, yellowCards: 2 }))).toBe('suspended')
  })
  it('reports cards when only yellows are pending', () => {
    expect(statusKind(player({ yellowCards: 2 }))).toBe('cards')
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/screens/SquadScreen.test.ts`
Expected: FAIL — `statusKind` is not exported.

- [ ] **Step 4: Rework `SquadScreen.tsx`**

Update imports:
```ts
import { autoPick, isAvailable, toggleStarter, updateTeam } from '../engine/lineup'
import { delistPlayer, listPlayer, releasePlayer, renewalSalary, renewContract } from '../engine/transfers'
```
(remove `swapIn`; add `toggleStarter`; add `delistPlayer`.)

Add to the icon import from `../ui/icons`:
```ts
import { DelistIcon, ExitIcon, MinusIcon, PlayIcon, PlusIcon, RenewIcon, TagIcon, YellowCardIcon } from '../ui/icons'
```

Replace the `statusBadge` function (lines 43–48) with an exported `statusKind` plus an icon cell:
```tsx
export function statusKind(p: Player): 'injured' | 'suspended' | 'cards' | null {
  if (p.injuredForRounds > 0) return 'injured'
  if (p.suspendedForRounds > 0) return 'suspended'
  if (p.yellowCards > 0) return 'cards'
  return null
}

function statusCell(p: Player) {
  const kind = statusKind(p)
  if (kind === 'injured') return (
    <span className="inline-flex items-center gap-1 text-danger" title={t('squad.injured', { n: p.injuredForRounds })}>
      <PlusIcon className="size-3.5" />{t('common.weeksShort', { n: p.injuredForRounds })}
    </span>
  )
  if (kind === 'suspended') return (
    <span className="inline-flex items-center gap-1 text-warn" title={t('squad.banned', { n: p.suspendedForRounds })}>
      <MinusIcon className="size-3.5" />{t('common.weeksShort', { n: p.suspendedForRounds })}
    </span>
  )
  if (kind === 'cards') return (
    <span className="inline-flex items-center gap-1" title={t('squad.cards', { n: p.yellowCards })}>
      <YellowCardIcon />{p.yellowCards}
    </span>
  )
  return null
}
```

In the `name` column render (lines 77–82), replace the `XI` badge with a green dot:
```tsx
      render: p => (
        <span className="inline-flex items-center gap-2">
          {p.name}
          {team.lineup.includes(p.id) && (
            <span className="size-2 shrink-0 rounded-full bg-accent" aria-label={t('squad.startingXi')} title={t('squad.startingXi')} />
          )}
        </span>
      ),
```

In the `status` column (line 94), swap the renderer:
```tsx
    { key: 'status', label: t('squad.statusColumn'), render: p => statusCell(p) },
```

In the actions cell, replace the starting/Start branch (lines 152–165) with a single toggle:
```tsx
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={starting}
              disabled={!starting && !isAvailable(p)}
              aria-label={starting ? t('squad.bench') : t('squad.start')}
              title={starting ? t('squad.bench') : t('squad.start')}
              className={starting ? 'border-accent! text-accent-strong!' : ''}
              onClick={() => withUserTeam((s, t) => updateTeam(s, t.id, { lineup: toggleStarter(t, p.id) }))}
            >
              <PlayIcon />
            </Button>
```

Replace the `listed ? <Badge>…</Badge> : <sell button>` branch (lines 166–178) so the listed state offers a delist action:
```tsx
            {listed ? (
              <Button
                variant="ghost"
                size="sm"
                aria-label={t('squad.delist')}
                title={t('squad.delist')}
                onClick={() => setState(s => delistPlayer(s, p.id))}
              >
                <DelistIcon />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                aria-label={t('squad.sell')}
                title={t('squad.sell')}
                onClick={() => { setSelling(p.id); setAskingPrice(marketValue(p)) }}
              >
                <TagIcon />
              </Button>
            )}
```

Remove the now-unused `Badge` import if nothing else in the file uses it (search the file for `<Badge` — if none remain, drop `import Badge from '../ui/Badge'`).

- [ ] **Step 5: i18n keys**

In `src/i18n/en.ts`: remove `'squad.xiBadge'`, `'squad.startingTag'`, `'squad.listedBadge'`; keep `'squad.injured'`, `'squad.banned'`, `'squad.cards'` (now used as `title` text); add:
```ts
  'squad.startingXi': 'Starting XI',
  'squad.bench': 'Bench',
  'squad.delist': 'Cancel listing',
```
Make the identical removals/additions in `src/i18n/pt.ts`:
```ts
  'squad.startingXi': 'Time titular',
  'squad.bench': 'Reserva',
  'squad.delist': 'Cancelar venda',
```

- [ ] **Step 6: Run tests + typecheck**

Run: `npx vitest run src/screens/SquadScreen.test.ts`
Expected: PASS.
Run: `npx tsc -b --force`
Expected: no errors (a leftover reference to a removed i18n key would fail here — fix any).

- [ ] **Step 7: Manual check**

Run `npm run dev`, open the Squad screen: each row's action toggles in/out of the XI (green dot appears/disappears; toggle shows an accent border when starting); a bench player who is injured can't be toggled on; injured/suspended/carded players show `+`/`−`/yellow-card icons with counts; a listed player shows a delist button that clears the listing.

- [ ] **Step 8: Commit**
```bash
git add src/ui/icons.tsx src/screens/SquadScreen.tsx src/screens/SquadScreen.test.ts src/i18n/en.ts src/i18n/pt.ts
git commit -m "feat(ui): free XI toggle, green-dot marker, icon status, delist button"
```

---

### Task 6: Advance gate + Continue → dashboard

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/ui/Shell.tsx`
- Modify: `src/screens/HomeScreen.tsx`
- Modify: `src/i18n/en.ts`, `src/i18n/pt.ts`

**Interfaces:**
- `Shell` gains props `advanceDisabled?: boolean` and `advanceHint?: string`.
- `HomeScreen` gains prop `advanceDisabled?: boolean`.
- Gate rule: while `employed && !seasonOver`, if the user has ≥11 available players but the lineup isn't exactly 11, advancing is blocked. (When fewer than 11 are available it is *not* blocked — otherwise a heavily-injured squad could never advance.)

- [ ] **Step 1: App — compute the gate, guard `advance`, route Continue home**

In `src/App.tsx`:

Add to the lineup import (there is currently no import from `./engine/lineup`; add one):
```ts
import { isAvailable } from './engine/lineup'
```

After `const employed = state.manager.employed` (line 65), add:
```ts
  const availableCount = employed ? userTeam.playerIds.filter(id => isAvailable(state.players[id])).length : 0
  const needsEleven = employed && !seasonOver && availableCount >= 11 && userTeam.lineup.length !== 11
```

Guard `advance()` (line 71) — change the early-return to:
```ts
    if (advancingRef.current || needsEleven) return
```

Change the replay close handler (line 98) from:
```tsx
    return <MatchScreen fixture={replay} state={state} onClose={() => setReplay(null)} />
```
to:
```tsx
    return <MatchScreen fixture={replay} state={state} onClose={() => { setReplay(null); setScreen('home') }} />
```

Pass the gate to `Shell` (line ~114, alongside `onAdvance`):
```tsx
      advanceLabel={seasonOver ? t('shell.newSeason') : t('shell.advanceWeek')}
      onAdvance={advance}
      advanceDisabled={needsEleven}
      advanceHint={needsEleven ? t('squad.selectElevenHint', { n: userTeam.lineup.length }) : undefined}
      onShowClub={openClub}
```

Pass the gate to `HomeScreen` (line 133):
```tsx
        ? <HomeScreen state={state} setState={setState} onAdvance={advance} advanceDisabled={needsEleven} onNavigate={setScreen} onShowClub={openClub} />
```

- [ ] **Step 2: Shell — disabled advance + hint**

In `src/ui/Shell.tsx`, extend `Props` (after `onAdvance: () => void`):
```ts
  advanceDisabled?: boolean
  advanceHint?: string
```
Destructure them in the component signature (line 53), defaulting disabled to false:
```ts
export default function Shell({ screen, onNavigate, state, advanceLabel, onAdvance, advanceDisabled = false, advanceHint, onShowClub, children }: Props) {
```
Sidebar advance (lines 129–131) becomes:
```tsx
          <Button variant="primary" className="mt-3 w-full" disabled={advanceDisabled} onClick={onAdvance}>
            {advanceLabel}
          </Button>
          {advanceDisabled && advanceHint && <p className="mt-1.5 text-center text-[11px] text-warn">{advanceHint}</p>}
```
Mobile floating advance (lines 160–162) becomes:
```tsx
      <div className="fixed bottom-16 right-4 z-40 mb-[env(safe-area-inset-bottom)] md:hidden">
        {advanceDisabled && advanceHint && (
          <p className="mb-1 rounded bg-surface-raised px-2 py-0.5 text-right text-[11px] text-warn shadow">{advanceHint}</p>
        )}
        <Button variant="primary" disabled={advanceDisabled} onClick={onAdvance}>{advanceLabel}</Button>
      </div>
```

- [ ] **Step 3: HomeScreen — disabled advance + hint**

In `src/screens/HomeScreen.tsx`, add `advanceDisabled?: boolean` to the `Props` interface (near `onAdvance: () => void` at line 22), and destructure it in the component signature (line 29). Compute the user's lineup length once inside the component (the component already has `state`); add near the top of the function body:
```ts
  const userLineupLen = state.teams.find(t => t.id === state.userTeamId)?.lineup.length ?? 0
```
For each of the two `t('shell.advanceWeek')` buttons (lines 159 and 166), add `disabled={advanceDisabled}` and follow the button with a hint. For example the next-match button block becomes:
```tsx
              <div className="flex flex-col items-end gap-1">
                <Button variant="primary" disabled={advanceDisabled} onClick={onAdvance}>{t('shell.advanceWeek')}</Button>
                {advanceDisabled && <span className="text-[11px] text-warn">{t('squad.selectElevenHint', { n: userLineupLen })}</span>}
              </div>
```
Apply the same wrap (button + conditional hint) to the free-week advance button at line 166. Leave the `shell.newSeason` button (line 138) unchanged.

- [ ] **Step 4: i18n key**

In `src/i18n/en.ts` add:
```ts
  'squad.selectElevenHint': 'Pick 11 to continue ({n}/11)',
```
In `src/i18n/pt.ts` add:
```ts
  'squad.selectElevenHint': 'Escale 11 para continuar ({n}/11)',
```

- [ ] **Step 5: Typecheck + manual check**

Run: `npx tsc -b --force`
Expected: no errors.
Manual (`npm run dev`): bench a starter so the XI has 10 → the advance button (sidebar, mobile floating, and Home card) is disabled and shows "Pick 11 to continue (10/11)"; toggle an 11th in → advancing works and, after the match, Continue lands on the dashboard. Injure a starter in a match → you return to Home with a 10-man XI and the gate active.

- [ ] **Step 6: Commit**
```bash
git add src/App.tsx src/ui/Shell.tsx src/screens/HomeScreen.tsx src/i18n/en.ts src/i18n/pt.ts
git commit -m "feat(ui): gate advance on a full XI; Continue returns to dashboard"
```

---

### Task 7: News rail — fade past-week entries

**Files:**
- Modify: `src/ui/NewsRail.tsx`

**Interfaces:**
- Produces (exported for testing): `isPastWeek(item: NewsItem, latest: { season: number; week: number }): boolean` — true when `item` is older than `latest` (`season <` or same season and `week <`).

- [ ] **Step 1: Write the failing test**

Create `src/ui/NewsRail.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { isPastWeek } from './NewsRail'
import type { NewsItem } from '../engine/types'

const item = (season: number, week: number): NewsItem => ({ season, week, type: 'userSigned', params: {} })

describe('isPastWeek', () => {
  it('is false for the newest week', () => {
    expect(isPastWeek(item(2, 10), { season: 2, week: 10 })).toBe(false)
  })
  it('is true for an earlier week in the same season', () => {
    expect(isPastWeek(item(2, 9), { season: 2, week: 10 })).toBe(true)
  })
  it('is true for an earlier season regardless of week', () => {
    expect(isPastWeek(item(1, 30), { season: 2, week: 1 })).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ui/NewsRail.test.ts`
Expected: FAIL — `isPastWeek` not exported.

- [ ] **Step 3: Implement**

In `src/ui/NewsRail.tsx`, add the helper (top-level, exported):
```ts
export function isPastWeek(item: NewsItem, latest: { season: number; week: number }): boolean {
  return item.season < latest.season || (item.season === latest.season && item.week < latest.week)
}
```
In `NewsRail`, compute the newest stamp from the items being shown and pass a `past` flag to each row. Replace the body of `NewsRail` with:
```tsx
export default function NewsRail({ state, limit, onShowClub }: { state: GameState; limit?: number; onShowClub?: (teamId: number) => void }) {
  useLang()
  const items = [...state.news].reverse().slice(0, limit)
  if (items.length === 0) return <EmptyState>{t('news.empty')}</EmptyState>
  const latest = { season: items[0].season, week: items[0].week }
  return (
    <ol className="flex flex-col">
      {items.map((item, i) => (
        <NewsRow key={`${state.news.length - i}`} item={item} state={state} onShowClub={onShowClub} past={isPastWeek(item, latest)} />
      ))}
    </ol>
  )
}
```
Update `NewsRow` to accept and apply `past` (fade layered on the existing tone):
```tsx
function NewsRow({ item, state, onShowClub, past }: { item: NewsItem; state: GameState; onShowClub?: (teamId: number) => void; past: boolean }) {
  const RowIcon = ICONS[item.type]
  const clubId = onShowClub ? clubIdOf(item, state) : null
  return (
    <li className={`flex items-baseline gap-2 border-b border-rule/60 py-2 text-sm ${toneOf(item.type)} ${past ? 'opacity-60' : ''}`}>
```
(the rest of `NewsRow` is unchanged.)

- [ ] **Step 4: Run the test + typecheck**

Run: `npx vitest run src/ui/NewsRail.test.ts`
Expected: PASS.
Run: `npx tsc -b --force`
Expected: no errors.

- [ ] **Step 5: Commit**
```bash
git add src/ui/NewsRail.tsx src/ui/NewsRail.test.ts
git commit -m "feat(ui): fade past-week news entries"
```

---

### Task 8: Cup screen — reverse round order

**Files:**
- Modify: `src/screens/CupScreen.tsx`

**Interfaces:** none new.

- [ ] **Step 1: Implement**

In `src/screens/CupScreen.tsx`, change the `rounds` sort (line 93) from ascending to descending so the latest round renders first:
```ts
  const rounds = [...new Set(state.cupFixtures.map(f => f.cupRound))].sort((a, b) => b - a)
```
Nothing else changes — each round still lists its own ties, and `final`/`champion` derive from `cupRound` independently of render order.

- [ ] **Step 2: Typecheck + manual check**

Run: `npx tsc -b --force`
Expected: no errors.
Manual (`npm run dev`): the Cup screen shows the most advanced round (e.g. the Final, once drawn) at the top, Round 1 at the bottom.

- [ ] **Step 3: Commit**
```bash
git add src/screens/CupScreen.tsx
git commit -m "feat(ui): show latest cup round first"
```

---

## Final verification

- [ ] Run the full suite: `npm test` — all green.
- [ ] Typecheck: `npx tsc -b --force` — no errors.
- [ ] Lint: `npm run lint` — no new errors.
- [ ] Manual sweep in `npm run dev`: XI toggle + gate, green dot, icon status column, delist, Continue→dashboard, faded old news, reversed cup order, live attendance during a match (home and away), and switch language mid-session to confirm every new string is translated.
- [ ] Finish the branch with superpowers:finishing-a-development-branch.
