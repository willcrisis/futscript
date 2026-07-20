# "willcrisis" Easter Egg Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Starting a new career with the manager name exactly `willcrisis` grants the user's club an all-level-99 squad (age 19, 30-season contracts, $1 salaries, max form) and a 30,000-seat stadium.

**Architecture:** One new pure engine transform `willcrisis(state)` in `src/engine/newGame.ts`, applied from `App.tsx`'s WelcomeScreen `onDismiss` handler (which only fires on fresh careers). The transform draws no randomness and adds no player IDs, so `rngState` and determinism are untouched.

**Tech Stack:** TypeScript, Vitest, React 19 (wiring only).

**Spec:** `docs/superpowers/specs/2026-07-20-willcrisis-easter-egg-design.md`

## Global Constraints

- The engine stays pure: no React, DOM, `localStorage`, i18n, `Math.random()`, or `Date.now()` in `src/engine/**`.
- The transform must consume **zero** RNG draws — `rngState` must be byte-identical before/after.
- Money is integer dollars (`salary: 1`).
- No save-version bump: only values in existing fields change, no state-shape change, no migration.
- The name check is case-sensitive, on the **trimmed** typed name: `name.trim() === 'willcrisis'`.
- Trigger is new-game only (WelcomeScreen dismiss). Mid-career renames in SavesScreen must NOT trigger it.
- Typecheck with `npx tsc -b --force` (plain `tsc --noEmit` is a no-op in this repo).

---

### Task 1: Engine transform `willcrisis`

**Files:**
- Modify: `src/engine/newGame.ts` (append the new export at the end of the file)
- Test: `src/engine/newGame.test.ts` (append a new `describe` block)

**Interfaces:**
- Consumes: `newGame(seed): GameState` (already exported from `src/engine/newGame.ts`), `GameState` from `src/engine/types.ts`.
- Produces: `export function willcrisis(state: GameState): GameState` — Task 2 imports this exact name from `./engine/newGame`.

- [ ] **Step 1: Write the failing test**

Append to `src/engine/newGame.test.ts` (inside the file, after the existing `describe('newGame', ...)` block ends at the bottom). Also change the import on line 3 from `import { newGame } from './newGame'` to `import { newGame, willcrisis } from './newGame'`.

```ts
describe('willcrisis', () => {
  it('boosts the user squad and stadium, touches nothing else', () => {
    const base = newGame(123)
    const state = willcrisis(base)

    const team = state.teams.find(t => t.id === state.userTeamId)!
    expect(team.capacity).toBe(30000)
    expect(team.playerIds).toHaveLength(18)
    for (const id of team.playerIds) {
      expect(state.players[id]).toMatchObject({
        level: 99, peakLevel: 99, age: 19, contractSeasons: 30, salary: 1, form: 3,
      })
    }

    // every other team and its players are byte-identical
    for (const rival of state.teams.filter(t => t.id !== state.userTeamId)) {
      const before = base.teams.find(t => t.id === rival.id)!
      expect(rival).toEqual(before)
      expect(rival.playerIds.map(id => state.players[id]))
        .toEqual(rival.playerIds.map(id => base.players[id]))
    }

    // no RNG consumed, input state not mutated (purity)
    expect(state.rngState).toBe(base.rngState)
    expect(base.players[team.playerIds[0]].level).toBeLessThanOrEqual(40) // D4 band, untouched
    expect(base.teams.find(t => t.id === base.userTeamId)!.capacity).not.toBe(30000)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/newGame.test.ts`
Expected: FAIL — the module does not provide an export named `willcrisis`.

- [ ] **Step 3: Write minimal implementation**

Append to the end of `src/engine/newGame.ts`:

```ts
// Easter egg: manager named exactly "willcrisis" on a fresh career gets a dream
// team. Draws no randomness and adds no ids — rngState and determinism untouched.
export function willcrisis(state: GameState): GameState {
  const team = state.teams.find(t => t.id === state.userTeamId)!
  const players = { ...state.players }
  for (const id of team.playerIds) {
    players[id] = { ...players[id], level: 99, peakLevel: 99, age: 19, contractSeasons: 30, salary: 1, form: 3 }
  }
  return {
    ...state,
    players,
    teams: state.teams.map(t => (t.id === team.id ? { ...t, capacity: 30000 } : t)),
  }
}
```

(No new imports needed — `GameState` is already imported in `newGame.ts` via `import type { GameState, Player, Position, Team } from './types'`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/newGame.test.ts`
Expected: PASS (all tests in the file, including the pre-existing ones).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all test files pass (no other module is affected, but confirm).

- [ ] **Step 6: Commit**

```bash
git add src/engine/newGame.ts src/engine/newGame.test.ts
git commit -m "feat(engine): willcrisis easter-egg transform

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Wire the trigger in App.tsx

**Files:**
- Modify: `src/App.tsx:5` (import) and `src/App.tsx:117` (onDismiss handler)

**Interfaces:**
- Consumes: `willcrisis(state: GameState): GameState` from `./engine/newGame` (Task 1), `renameManager(state, name)` from `./engine/career` (already imported/used).
- Produces: nothing consumed by later tasks (this is the last task).

- [ ] **Step 1: Extend the import**

`src/App.tsx` line 5 currently reads:

```ts
import { newGame } from './engine/newGame'
```

Change to:

```ts
import { newGame, willcrisis } from './engine/newGame'
```

- [ ] **Step 2: Apply the transform on welcome dismiss**

`src/App.tsx` line 117 currently reads:

```tsx
    return <WelcomeScreen state={state} onDismiss={name => { setState(s => renameManager(s, name)); setShowWelcome(false) }} />
```

Change to:

```tsx
    return <WelcomeScreen state={state} onDismiss={name => { setState(s => { const next = renameManager(s, name); return name.trim() === 'willcrisis' ? willcrisis(next) : next }); setShowWelcome(false) }} />
```

Note: this is the ONLY call site to touch. `SavesScreen`'s mid-career rename path must stay as-is (spec: new-game only).

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc -b --force`
Expected: no output, exit 0.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Manual smoke check**

Run: `npm run dev`, open http://localhost:5173, use the Saves screen (or clear `localStorage`) to start a new career, enter manager name `willcrisis` on the welcome screen. Then check:
- Squad screen: every player level 99, age 19.
- Club/Stadium screen: capacity 30,000.
- Finance: salaries total $18/round for the squad.

Then start another new career with a different name (e.g. `Willian`) and confirm a normal Division 4 squad (levels 30–40).

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat: trigger willcrisis easter egg from new-game welcome screen

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
