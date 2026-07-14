# Scout & Quality-of-Life Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship eight QoL changes: a global Scout search screen, a 3-4-3 and a "Best" formation, post-match toast timing, dashboard routing/notice for match-free weeks, fixture attendance display, and removal of the friendlies option.

**Architecture:** Mostly small UI/engine edits. The one new surface is a Scout screen listing every player at other clubs with filters and an inline Make Offer. Formations grow the `FormationName` union, with "Best" typed out of the shaped `FORMATIONS` map and special-cased in `autoPick`.

**Tech Stack:** React 19, TypeScript, Vite, Vitest.

## Global Constraints

- Engine stays pure (no React/DOM/i18n imports; randomness threaded through `rand`; money integer dollars).
- Semantic design tokens only; reuse the `src/ui/` kit; light + dark; mobile-equal.
- i18n: every new `en.ts` key must be added to `pt.ts` (compile-checked). Retired keys removed from both.
- **No `GameState.version` bump.** Removing `playFriendlies` needs no migration (old saves' residual field is ignored).
- Typecheck `npx tsc -b --force`; tests `npm test` / `npx vitest run <file>`.
- Commit trailers per repo convention.

## Dependency

**Task 6 (Scout) uses `makeOffer`/`outgoingOffers` from the direct-offers plan** (`docs/superpowers/plans/2026-07-09-direct-offers.md`). Do Task 6 only after direct-offers is implemented; Tasks 1–5 are independent of it.

## File Structure

| File | Change | Task |
|------|--------|------|
| `src/engine/types.ts` | `FormationName` + `FORMATIONS` typing | 1 |
| `src/engine/lineup.ts` | `autoPick`/`patchLineup` handle `'Best'` | 1 |
| `src/screens/SquadScreen.tsx` | dropdown lists `'Best'` | 1 |
| `src/App.tsx` | defer toasts; route match-free weeks home | 2 |
| `src/screens/FixturesScreen.tsx` | attendance in detail panel | 3 |
| friendlies removal (many) | delete the feature | 4 |
| `src/screens/HomeScreen.tsx` | no-match / cup-idle notice | 5 |
| `src/screens/ScoutScreen.tsx` (new) + nav | global search + inline offer | 6 |

---

### Task 1: 3-4-3 and "Best" formations

**Files:**
- Modify: `src/engine/types.ts` (`FormationName`, `FORMATIONS`)
- Modify: `src/engine/lineup.ts` (`autoPick`, `patchLineup`)
- Modify: `src/screens/SquadScreen.tsx` (dropdown)
- Test: `src/engine/lineup.test.ts`

**Interfaces:**
- Produces: `FormationName` gains `'3-4-3'` and `'Best'`; `FORMATIONS` is `Record<Exclude<FormationName, 'Best'>, Record<Position, number>>`. `autoPick(team, players)` returns the best XI for `'Best'` (top GK + top 10 remaining by level).

- [ ] **Step 1: Write the failing tests**

Append to `src/engine/lineup.test.ts` (its top import `import { FORMATIONS, type Player, type Position, type Team } from './types'` already brings in `FORMATIONS` and `Position` — do not re-import):
```ts
describe('new formations', () => {
  it('3-4-3 fills its shape', () => {
    const { team, players } = makeSquad()
    const lineup = autoPick({ ...team, formation: '3-4-3' }, players)
    const counts: Record<Position, number> = { GK: 0, DF: 0, MF: 0, FW: 0 }
    for (const id of lineup) counts[players[id].position]++
    expect(counts).toEqual(FORMATIONS['3-4-3'])
  })

  it('Best picks the 11 highest levels when the keeper is already top-tier', () => {
    const { team, players } = makeSquad() // levels descend 90..73; GKs are the top two
    const lineup = autoPick({ ...team, formation: 'Best' }, players)
    expect(lineup).toHaveLength(11)
    expect(new Set(lineup)).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]))
  })

  it('Best forces the best available keeper in even when GKs are weak', () => {
    const { team, players } = makeSquad()
    players[1] = { ...players[1], level: 10 } // both keepers now well outside the natural top 11
    players[2] = { ...players[2], level: 9 }
    const lineup = autoPick({ ...team, formation: 'Best' }, players)
    expect(lineup).toHaveLength(11)
    expect(lineup.some(id => players[id].position === 'GK')).toBe(true)
    expect(lineup).toContain(1) // the stronger of the two keepers
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/engine/lineup.test.ts`
Expected: FAIL — `'3-4-3'`/`'Best'` are not valid `FormationName`s.

- [ ] **Step 3: Update the formation types**

In `src/engine/types.ts`:
```ts
export type FormationName = '4-4-2' | '4-3-3' | '3-4-3' | '3-5-2' | '5-3-2' | '5-4-1' | 'Best'

export const FORMATIONS: Record<Exclude<FormationName, 'Best'>, Record<Position, number>> = {
  '4-4-2': { GK: 1, DF: 4, MF: 4, FW: 2 },
  '4-3-3': { GK: 1, DF: 4, MF: 3, FW: 3 },
  '3-4-3': { GK: 1, DF: 3, MF: 4, FW: 3 },
  '3-5-2': { GK: 1, DF: 3, MF: 5, FW: 2 },
  '5-3-2': { GK: 1, DF: 5, MF: 3, FW: 2 },
  '5-4-1': { GK: 1, DF: 5, MF: 4, FW: 1 },
}
```

- [ ] **Step 4: Handle `'Best'` in `lineup.ts`**

In `src/engine/lineup.ts`, special-case `'Best'` at the top of `autoPick` (assign `formation` to a local const so TypeScript narrows it out of `'Best'` for the `FORMATIONS[formation]` index below):
```ts
export function autoPick(team: Team, players: Record<number, Player>): number[] {
  const squad = team.playerIds.map(id => players[id]).filter(isAvailable)
  const formation = team.formation
  if (formation === 'Best') {
    // highest-level keeper, then the ten best remaining regardless of position
    const gk = squad.filter(p => p.position === 'GK').sort((a, b) => b.level - a.level)[0]
    const rest = squad.filter(p => p.id !== gk?.id).sort((a, b) => b.level - a.level).slice(0, 10)
    return [gk, ...rest].filter(Boolean).map(p => (p as Player).id)
  }
  const lineup: number[] = []
  for (const [position, count] of Object.entries(FORMATIONS[formation])) {
    const best = squad
      .filter(p => p.position === position)
      .sort((a, b) => b.level - a.level)
      .slice(0, count)
    lineup.push(...best.map(p => p.id))
  }
  if (lineup.length < 11) {
    const rest = squad
      .filter(p => !lineup.includes(p.id))
      .sort((a, b) => b.level - a.level)
    lineup.push(...rest.slice(0, 11 - lineup.length).map(p => p.id))
  }
  return lineup
}
```
Guard `patchLineup` too, so `'Best'` never indexes `FORMATIONS`. At the very top of `patchLineup`:
```ts
export function patchLineup(team: Team, players: Record<number, Player>): number[] {
  if (team.formation === 'Best') return autoPick(team, players)
  const formation = FORMATIONS[team.formation]
  // …rest unchanged…
```
(After the guard, `team.formation` is still typed as `FormationName`; if `tsc` flags `FORMATIONS[team.formation]`, narrow via `const formation = team.formation; if (formation === 'Best') return autoPick(team, players); const shape = FORMATIONS[formation]` — mirror the `autoPick` pattern.)

Grep to confirm no other reader indexes the map with a possibly-`'Best'` key:
```bash
grep -rn "FORMATIONS\[" src --include=*.ts --include=*.tsx
```
Every hit must be inside a branch where the key is proven non-`'Best'`.

- [ ] **Step 5: Add `'Best'` to the Squad dropdown**

In `src/screens/SquadScreen.tsx`, the formation `<select>` options currently read `{Object.keys(FORMATIONS).map(...)}`. Append `'Best'`:
```tsx
                {[...Object.keys(FORMATIONS), 'Best'].map(f => <option key={f}>{f}</option>)}
```
(The `onChange` already casts `e.target.value as FormationName`, and `'Best'` is now a valid member.)

- [ ] **Step 6: Run the tests + typecheck**

Run: `npx vitest run src/engine/lineup.test.ts`
Expected: PASS.
Run: `npx tsc -b --force`
Expected: no errors (proves no unguarded `FORMATIONS['Best']` access remains).

- [ ] **Step 7: Commit**
```bash
git add src/engine/types.ts src/engine/lineup.ts src/screens/SquadScreen.tsx src/engine/lineup.test.ts
git commit -m "feat: add 3-4-3 and Best formations"
```

---

### Task 2: Defer post-match toasts + route match-free weeks to the dashboard

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `detectToasts` (existing), `useToasts().push`, `ToastInput`.

- [ ] **Step 1: Implement**

In `src/App.tsx`:

Import the toast input type (top of file, with the other `./ui/Toast` import):
```ts
import type { ToastInput } from './ui/Toast'
```
(If `detectToasts`' return type is exported under a different name, use `ReturnType<typeof detectToasts>[number]` instead.)

Add pending-toast state near the other `useState`s (beside `const [replay, setReplay] = …`):
```ts
  const [pendingToasts, setPendingToasts] = useState<ToastInput[]>([])
```

Rewrite `advance()` so toasts wait for the match report, and a week with no match lands on the dashboard:
```ts
  const advance = () => {
    if (advancingRef.current || needsEleven) return
    advancingRef.current = true
    try {
      if (seasonOver) {
        setState(newSeason)
        return
      }
      const next = advanceRound(state)
      const toasts = detectToasts(state, next)
      const mine = (f: { homeId: number; awayId: number }) =>
        f.homeId === state.userTeamId || f.awayId === state.userTeamId
      const played =
        next.fixtures.find(f => f.round === state.round && mine(f)) ??
        next.cupFixtures.find(f => f.week === state.round && mine(f)) ??
        null
      setState(next)
      if (played) {
        setPendingToasts(toasts) // flushed when the match report closes
        setReplay(played)
      } else {
        toasts.forEach(push) // no match to defer behind
        setReplay(null)
        setScreen('home')
      }
    } finally {
      advancingRef.current = false
    }
  }
```

Update the replay render's `onClose` to flush the stashed toasts:
```tsx
  if (replay) {
    return (
      <MatchScreen
        fixture={replay}
        state={state}
        onClose={() => {
          pendingToasts.forEach(push)
          setPendingToasts([])
          setReplay(null)
          setScreen('home')
        }}
      />
    )
  }
```

- [ ] **Step 2: Typecheck + manual check**

Run: `npx tsc -b --force`
Expected: no errors.
Manual (`npm run dev`): advance a week where you play — sign/sell/offer toasts appear only after you click Continue on the match report. Advance a cup week you're not in (or a free week) — no match report, toasts appear immediately, and you land on the dashboard.

- [ ] **Step 3: Commit**
```bash
git add src/App.tsx
git commit -m "feat(ui): show post-match toasts after the report; match-free weeks return to dashboard"
```

---

### Task 3: Attendance on the Fixtures detail panel

**Files:**
- Modify: `src/screens/FixturesScreen.tsx`

**Interfaces:**
- Consumes: `Fixture.attendance?` (already stamped); `match.attendance` i18n string (`'{n} in attendance'`).

- [ ] **Step 1: Implement**

In `src/screens/FixturesScreen.tsx`, the selected-fixture `Panel` (currently the heading + `EventFeed`) gains an attendance line under the heading:
```tsx
      {selected && fixtures.includes(selected) && (
        <Panel className="mt-4">
          <h3 className="mb-2 font-semibold">
            {name(selected.homeId)} {selected.homeGoals} – {selected.awayGoals} {name(selected.awayId)}
          </h3>
          {selected.attendance != null && (
            <p className="mb-2 text-sm text-ink-muted">
              {t('match.attendance', { n: selected.attendance.toLocaleString('en-US') })}
            </p>
          )}
          <EventFeed events={selected.events ?? []} state={state} />
        </Panel>
      )}
```

- [ ] **Step 2: Typecheck + manual check**

Run: `npx tsc -b --force`
Expected: no errors.
Manual: on the Fixtures page, click a played home fixture — the crowd shows below the scoreline. (Old saves' pre-existing fixtures without `attendance` simply omit the line.)

- [ ] **Step 3: Commit**
```bash
git add src/screens/FixturesScreen.tsx
git commit -m "feat(ui): show attendance in the fixtures detail panel"
```

---

### Task 4: Remove the friendlies feature

**Files:**
- Modify: `src/engine/types.ts` (drop `playFriendlies`)
- Modify: `src/engine/newGame.ts`, `src/engine/save.ts` (stop setting it)
- Modify: `src/engine/season.ts` (remove friendly sim/income/ledger)
- Modify: `src/screens/SquadScreen.tsx` (remove checkbox)
- Modify: `src/screens/HomeScreen.tsx` (drop friendly branch)
- Modify: `src/i18n/en.ts`, `src/i18n/pt.ts`, `src/i18n/ledger.ts`
- Test: `src/engine/season.test.ts` (remove friendly tests; add a no-friendly assertion)

**Interfaces:**
- Removes: `GameState.playFriendlies`, the friendly simulation in `advanceRound`, and all friendly copy.

- [ ] **Step 1: Update the season test**

In `src/engine/season.test.ts`, delete the friendly-specific tests (the cases around lines 252–267 and 477–512 that set `playFriendlies: true` and assert friendly income). Add a guard test:
```ts
describe('no friendlies', () => {
  it('an idle cup week never produces friendly gate receipts', () => {
    let s = newGame(1)
    // advance through the first cup week (week 4) and a few more
    while (s.round <= 10) s = advanceRound(s)
    expect(s.finances.some(e => e.label === 'Friendly gate receipts')).toBe(false)
  })
})
```
Remove any remaining `playFriendlies` references from other test files (`save.test.ts`, `standings.test.ts`) — delete the property from state-construction literals.

- [ ] **Step 2: Run the test to verify it fails to compile / fails**

Run: `npx vitest run src/engine/season.test.ts`
Expected: FAIL — the friendly path still exists (and, until Step 3–7, `playFriendlies` is still a required field).

- [ ] **Step 3: Remove the engine logic**

In `src/engine/season.ts` `advanceRound`, delete:
- the friendly gate/opponent block (`let friendly … ` down through the `playingIds.add(friendly.awayId)` lines, ~62–71);
- the friendly simulation and `friendlyIncome` computation (~96–105);
- the `if (friendlyIncome > 0) { … 'Friendly gate receipts' … }` ledger append (~146–152).
Remove any now-unused locals (`friendly`, `friendlyIncome`) and imports (`TICKET_PRICE` if it was only used here — check with a grep before deleting the import).

- [ ] **Step 4: Remove the state field**

In `src/engine/types.ts`, delete the `playFriendlies: boolean` line from `GameState`.
In `src/engine/newGame.ts`, delete `playFriendlies: false` from the returned state.
In `src/engine/save.ts`, delete the `playFriendlies: false` migration default (the field is simply no longer part of the shape; old saves carrying it are unaffected).

- [ ] **Step 5: Remove the UI**

In `src/screens/SquadScreen.tsx`, delete the friendlies `<label>`/checkbox block (~287–298).
In `src/screens/HomeScreen.tsx`, the free-week message loses its friendly branch — for now change `{state.playFriendlies ? t('home.freeWeekFriendly') : t('home.freeWeek')}` to `{t('home.freeWeek')}` (Task 5 replaces this line with the richer notice).

- [ ] **Step 6: Remove the strings**

Delete from both `src/i18n/en.ts` and `src/i18n/pt.ts`: `squad.friendlies`, `squad.friendliesHint`, `home.freeWeekFriendly`, `ledger.friendlyGate`.
In `src/i18n/ledger.ts`, delete the regex row `{ re: /^Friendly gate receipts$/, key: 'ledger.friendlyGate', category: 'gate' }`.

- [ ] **Step 7: Run tests + typecheck**

Run: `npx tsc -b --force`
Expected: no errors — a missing `playFriendlies` reference anywhere surfaces here; fix each by removal.
Run: `npm test`
Expected: PASS (the new no-friendly guard passes; old friendly tests are gone).

- [ ] **Step 8: Commit**
```bash
git add src/engine/types.ts src/engine/newGame.ts src/engine/save.ts src/engine/season.ts src/screens/SquadScreen.tsx src/screens/HomeScreen.tsx src/i18n/en.ts src/i18n/pt.ts src/i18n/ledger.ts src/engine/season.test.ts src/engine/save.test.ts src/engine/standings.test.ts
git commit -m "feat: remove the friendlies-on-free-weeks option"
```

---

### Task 5: Dashboard "no match this week" notice

**Files:**
- Modify: `src/screens/HomeScreen.tsx`
- Modify: `src/i18n/en.ts`, `src/i18n/pt.ts`

**Interfaces:**
- Consumes: `CUP_WEEKS` (`src/engine/fixtures.ts`).

- [ ] **Step 1: Add the strings**

`src/i18n/en.ts`:
```ts
  'home.cupWeekIdle': 'Cup week — your club isn\'t involved. No match this week.',
```
(Confirm `home.freeWeek` reads as a clear "No match this week." — if it currently says something vaguer, update its value in both dictionaries.)
`src/i18n/pt.ts`:
```ts
  'home.cupWeekIdle': 'Semana de copa — seu clube não joga. Sem partida esta semana.',
```

- [ ] **Step 2: Implement the notice**

In `src/screens/HomeScreen.tsx`, import `CUP_WEEKS`:
```ts
import { CUP_WEEKS } from '../engine/fixtures'
```
The next-match panel's no-fixture branch (the free-week `<div>` that Task 4 reduced to `{t('home.freeWeek')}`) becomes a clear no-match state distinguishing a cup-idle week:
```tsx
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-ink-muted">
                {CUP_WEEKS.includes(week) ? t('home.cupWeekIdle') : t('home.freeWeek')}
              </p>
              <Button variant="primary" disabled={advanceDisabled} onClick={onAdvance}>{t('shell.advanceWeek')}</Button>
            </div>
          )}
```
(Keep the existing `advanceDisabled` gating and the `squad.selectElevenHint` hint if present in that branch.)

- [ ] **Step 3: Typecheck + manual check**

Run: `npx tsc -b --force`
Expected: no errors.
Manual: on a league free week the dashboard reads "No match this week"; on a cup week you're not in, it says the cup-week line. Both keep the Advance button.

- [ ] **Step 4: Commit**
```bash
git add src/screens/HomeScreen.tsx src/i18n/en.ts src/i18n/pt.ts
git commit -m "feat(ui): dashboard states when a week has no match"
```

---

### Task 6: Scout screen (global player search + inline offer)

**Depends on the direct-offers plan** (`makeOffer`, `GameState.outgoingOffers`). Do not start until those exist.

**Files:**
- Create: `src/screens/ScoutScreen.tsx`
- Modify: `src/ui/Shell.tsx` (`ScreenId`, `NAV`, `HIDDEN_WHEN_UNEMPLOYED`)
- Modify: `src/ui/icons.tsx` (`ScoutIcon`)
- Modify: `src/App.tsx` (render `ScoutScreen`)
- Modify: `src/i18n/en.ts`, `src/i18n/pt.ts`
- Test: `src/screens/ScoutScreen.test.ts`

**Interfaces:**
- Consumes: `makeOffer(state, playerId, amount): GameState`, `GameState.outgoingOffers`, `marketValue` (`finance.ts`), `isActive`/`poolReturn` (optional — guard if absent).
- Produces (exported for testing): `applyScoutFilters(rows: ScoutRow[], f: ScoutFilters): ScoutRow[]` and `buildScoutRows(state): ScoutRow[]`.

- [ ] **Step 1: Add the nav icon and screen id**

`src/ui/icons.tsx`:
```tsx
export const ScoutIcon = ({ className }: { className?: string }) => (
  <Icon className={className}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></Icon>
)
```
`src/ui/Shell.tsx`:
- add `'scout'` to the `ScreenId` union;
- add a `NAV` entry `{ id: 'scout', labelKey: 'nav.scout', icon: ScoutIcon }` (import `ScoutIcon`) — place it after `transfers`;
- add `'scout'` to `HIDDEN_WHEN_UNEMPLOYED` (offers require employment). Leave `MOBILE_PRIMARY` unchanged (Scout lives in the "More" sheet on mobile).

`src/i18n/en.ts`:
```ts
  'nav.scout': 'Scout',
  'scout.header': 'SCOUT',
  'scout.title': 'Player search',
  'scout.searchPlaceholder': 'Player name',
  'scout.minLevel': 'Min level',
  'scout.maxValue': 'Max value',
  'scout.allPositions': 'All positions',
  'scout.allDivisions': 'All divisions',
  'scout.clubColumn': 'Club',
  'scout.makeOffer': 'Make offer',
  'scout.sendOffer': 'Send',
  'scout.offerPending': 'Offer pending',
  'scout.noMatch': 'No players match those filters.',
```
`src/i18n/pt.ts` (same keys):
```ts
  'nav.scout': 'Observação',
  'scout.header': 'OBSERVAÇÃO',
  'scout.title': 'Busca de jogadores',
  'scout.searchPlaceholder': 'Nome do jogador',
  'scout.minLevel': 'Nível mín.',
  'scout.maxValue': 'Valor máx.',
  'scout.allPositions': 'Todas as posições',
  'scout.allDivisions': 'Todas as divisões',
  'scout.clubColumn': 'Clube',
  'scout.makeOffer': 'Fazer proposta',
  'scout.sendOffer': 'Enviar',
  'scout.offerPending': 'Proposta enviada',
  'scout.noMatch': 'Nenhum jogador corresponde a esses filtros.',
```

- [ ] **Step 2: Write the failing filter test**

Create `src/screens/ScoutScreen.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { newGame } from '../engine/newGame'
import { buildScoutRows, applyScoutFilters } from './ScoutScreen'

describe('scout filters', () => {
  it('excludes the user\'s own players', () => {
    const s = newGame(1)
    const rows = buildScoutRows(s)
    expect(rows.some(r => r.team.id === s.userTeamId)).toBe(false)
  })

  it('composes position + min level filters', () => {
    const s = newGame(1)
    const rows = buildScoutRows(s)
    const filtered = applyScoutFilters(rows, { name: '', position: 'FW', minLevel: 60, maxValue: null, division: null })
    expect(filtered.every(r => r.player.position === 'FW' && r.player.level >= 60)).toBe(true)
  })

  it('caps by max value', () => {
    const s = newGame(1)
    const rows = buildScoutRows(s)
    const filtered = applyScoutFilters(rows, { name: '', position: 'all', minLevel: 0, maxValue: 500_000, division: null })
    expect(filtered.every(r => r.value <= 500_000)).toBe(true)
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/screens/ScoutScreen.test.ts`
Expected: FAIL — `ScoutScreen` and its exports don't exist.

- [ ] **Step 4: Create `ScoutScreen.tsx`**

```tsx
import { useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { marketValue } from '../engine/finance'
import { makeOffer } from '../engine/transfers'
import type { GameState, Player, Position, Team } from '../engine/types'
import { t, useLang } from '../i18n'
import Button from '../ui/Button'
import DataTable from '../ui/DataTable'
import type { Column } from '../ui/DataTable'
import EmptyState from '../ui/EmptyState'
import MoneyText from '../ui/MoneyText'
import ScreenHeader from '../ui/ScreenHeader'

const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

export interface ScoutRow { player: Player; team: Team; value: number }
export interface ScoutFilters {
  name: string
  position: Position | 'all'
  minLevel: number
  maxValue: number | null
  division: number | null
}

export function buildScoutRows(state: GameState): ScoutRow[] {
  const rows: ScoutRow[] = []
  for (const team of state.teams) {
    if (team.id === state.userTeamId) continue // own players live in Squad
    if (team.poolReturn != null && team.poolReturn > state.season) continue // dormant clubs
    for (const id of team.playerIds) {
      const player = state.players[id]
      rows.push({ player, team, value: marketValue(player) })
    }
  }
  return rows
}

export function applyScoutFilters(rows: ScoutRow[], f: ScoutFilters): ScoutRow[] {
  const needle = fold(f.name.trim())
  return rows.filter(r =>
    (needle === '' || fold(r.player.name).includes(needle)) &&
    (f.position === 'all' || r.player.position === f.position) &&
    r.player.level >= f.minLevel &&
    (f.maxValue == null || r.value <= f.maxValue) &&
    (f.division == null || r.team.division === f.division),
  )
}

const SELECT = 'rounded-md border border-rule bg-surface-raised px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface'
const POSITIONS: Position[] = ['GK', 'DF', 'MF', 'FW']

export default function ScoutScreen({ state, setState }: { state: GameState; setState: Dispatch<SetStateAction<GameState>> }) {
  useLang()
  const [name, setName] = useState('')
  const [position, setPosition] = useState<Position | 'all'>('all')
  const [minLevel, setMinLevel] = useState(0)
  const [maxValue, setMaxValue] = useState<number | null>(null)
  const [division, setDivision] = useState<number | null>(null)
  const [offering, setOffering] = useState<number | null>(null)
  const [bid, setBid] = useState(0)

  const divisions = [...new Set(state.teams.map(tm => tm.division))].sort((a, b) => a - b)
  const rows = useMemo(() => buildScoutRows(state), [state])
  const filtered = useMemo(
    () => applyScoutFilters(rows, { name, position, minLevel, maxValue, division }).sort((a, b) => b.player.level - a.player.level),
    [rows, name, position, minLevel, maxValue, division],
  )
  const pending = (id: number) => state.outgoingOffers.some(o => o.playerId === id)

  const columns: Column<ScoutRow>[] = [
    { key: 'name', label: t('common.player'), render: r => r.player.name },
    { key: 'club', label: t('scout.clubColumn'), hideOnMobile: true, render: r => r.team.name },
    { key: 'pos', label: t('common.position'), mono: true, render: r => r.player.position },
    { key: 'age', label: t('common.age'), mono: true, hideOnMobile: true, render: r => r.player.age },
    { key: 'level', label: t('common.level'), mono: true, render: r => <strong>{r.player.level}</strong> },
    { key: 'value', label: t('squad.valueColumn'), mono: true, align: 'right', render: r => <MoneyText amount={r.value} size="sm" /> },
    {
      key: 'offer', label: '', fullWidthOnMobile: true, render: r => {
        if (pending(r.player.id)) return <span className="text-xs text-ink-faint">{t('scout.offerPending')}</span>
        if (offering === r.player.id) return (
          <div className="flex items-center gap-1.5">
            <input
              type="number" value={bid} onChange={e => setBid(Number(e.target.value))}
              className="w-24 rounded-md border border-rule bg-surface px-2 py-1 text-xs font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            />
            <Button variant="primary" size="sm" onClick={() => { setState(s => makeOffer(s, r.player.id, bid)); setOffering(null) }}>
              {t('scout.sendOffer')}
            </Button>
            <Button variant="ghost" size="sm" aria-label={t('common.cancel')} onClick={() => setOffering(null)}>✕</Button>
          </div>
        )
        return (
          <Button variant="ghost" size="sm" onClick={() => { setOffering(r.player.id); setBid(r.value) }}>
            {t('scout.makeOffer')}
          </Button>
        )
      },
    },
  ]

  return (
    <div>
      <ScreenHeader label={t('scout.header')} title={t('scout.title')} />
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <input
          type="search" value={name} onChange={e => setName(e.target.value)} placeholder={t('scout.searchPlaceholder')}
          className={`${SELECT} w-40`} aria-label={t('scout.searchPlaceholder')}
        />
        <select value={position} onChange={e => setPosition(e.target.value as Position | 'all')} className={SELECT} aria-label={t('common.position')}>
          <option value="all">{t('scout.allPositions')}</option>
          {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{t('scout.minLevel')}</span>
          <input type="number" min={0} max={99} value={minLevel} onChange={e => setMinLevel(Number(e.target.value))} className={`${SELECT} w-20`} />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{t('scout.maxValue')}</span>
          <input type="number" min={0} step={100000} value={maxValue ?? ''} onChange={e => setMaxValue(e.target.value === '' ? null : Number(e.target.value))} className={`${SELECT} w-28`} />
        </label>
        {divisions.length > 1 && (
          <select value={division ?? ''} onChange={e => setDivision(e.target.value === '' ? null : Number(e.target.value))} className={SELECT} aria-label={t('common.division')}>
            <option value="">{t('scout.allDivisions')}</option>
            {divisions.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
      </div>
      <DataTable columns={columns} rows={filtered} rowKey={r => r.player.id} empty={<EmptyState>{t('scout.noMatch')}</EmptyState>} />
    </div>
  )
}
```
(Confirm `common.cancel` exists in both dictionaries; add it if not. `squad.valueColumn` already exists.)

- [ ] **Step 5: Wire into App**

In `src/App.tsx`, import and render:
```tsx
import ScoutScreen from './screens/ScoutScreen'
```
```tsx
      {screen === 'scout' && <ScoutScreen state={state} setState={setState} />}
```

- [ ] **Step 6: Run the tests + typecheck**

Run: `npx vitest run src/screens/ScoutScreen.test.ts`
Expected: PASS.
Run: `npx tsc -b --force`
Expected: no errors.

- [ ] **Step 7: Manual check**

`npm run dev` → Scout appears in the nav (More sheet on mobile). Filters narrow the list; a Make Offer sends a bid resolved next week; a player with a pending offer shows "Offer pending". Hidden when unemployed.

- [ ] **Step 8: Commit**
```bash
git add src/screens/ScoutScreen.tsx src/screens/ScoutScreen.test.ts src/ui/Shell.tsx src/ui/icons.tsx src/App.tsx src/i18n/en.ts src/i18n/pt.ts
git commit -m "feat: Scout screen — global player search with inline offers"
```

---

## Final verification

- [ ] `npm test` — all green.
- [ ] `npx tsc -b --force` — no errors.
- [ ] `npm run lint` — no new errors.
- [ ] Manual sweep: 3-4-3 and Best formations; post-match toast timing; match-free weeks land on the dashboard with a clear "no match" notice; fixture attendance; Scout search + inline offer; friendlies option gone everywhere. Switch language to confirm new strings are translated.
- [ ] Finish with superpowers:finishing-a-development-branch.
