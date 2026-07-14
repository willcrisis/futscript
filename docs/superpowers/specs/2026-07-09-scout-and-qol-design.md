# Scout & Quality-of-Life Batch Design

**Date:** 2026-07-09
**Status:** Approved — ready for planning

Eight post-playtest changes: a global player-search "Scout" screen, two formation additions, deferred post-match toasts, dashboard routing/notice for match-free weeks, fixture attendance display, and removal of the friendlies option. All UI/engine; **no save-version bump**.

## Global constraints

- Engine stays pure (no React/DOM/i18n imports; randomness threaded through `rand`; money integer dollars).
- Semantic design tokens only; reuse the `src/ui/` kit; light + dark; mobile-equal.
- i18n: every new `en.ts` key must be added to `pt.ts` (compile-checked). Retired keys removed from both.
- No `GameState.version` bump. Removing `playFriendlies` needs no migration — old saves' leftover field is simply ignored (nothing reads it, and `migrateToCurrent`'s shape guard tolerates extra fields).
- Typecheck `npx tsc -b --force`; tests `npm test`.

## Cross-feature dependency

**Scout's inline "Make Offer" uses `makeOffer`/`outgoingOffers`** from the direct-offers plan (`docs/superpowers/plans/2026-07-09-direct-offers.md`). Scout must be planned/executed **with or after** direct-offers. Everything else here is independent.

---

## 1 · Scout screen (global player search)

**Problem:** there is no way to browse players across the world — players are only ever listed scoped to a context (own squad, transfer listings, one club's roster). No global search/filter exists.

**Design:** a new **`scout`** screen in the nav.
- **Data:** every player at a club **other than the user's** (own players live in Squad). Join each `Player` to its owning `Team` for club name, division, and to compute `marketValue` (`finance.ts`, `level² × 120 × ageFactor`). Exclude players at dormant/pooled clubs if that world feature is present (`poolReturn` set) — reuse `activeTeams`/`isActive` if available, else no-op.
- **Columns (sortable):** name · club · position · age · level · value · salary. Reuse `DataTable`; default sort by level desc.
- **Filters:** free-text name search (diacritic-insensitive — reuse the `fold` helper pattern from `TableScreen.tsx:22`, `s.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase()`), position (GK/DF/MF/FW/all), minimum level, maximum value, and division. Filters compose (AND).
- **Inline Make Offer:** each row carries a **Make Offer** action (amount input defaulting to `marketValue`, calling `makeOffer(state, playerId, amount)`), matching the ClubScreen flow. Disabled/hidden for players with a pending outgoing offer (show "Offer pending").
- **Nav wiring:** add `'scout'` to `ScreenId` (`Shell.tsx`), a `NAV` entry with a new `ScoutIcon` (`icons.tsx`) and `nav.scout` key, add `'scout'` to `HIDDEN_WHEN_UNEMPLOYED` (offers require employment), render `<ScoutScreen state setState>` in the `App.tsx` screen switch. Optionally reachable from the "More" sheet on mobile (not a `MOBILE_PRIMARY` tab).

**Test focus:** filter composition (position + min level + max value narrows correctly); `marketValue` column matches the engine; own-club players excluded.

---

## 2 · 3-4-3 formation

Add to `FORMATIONS` and the `FormationName` union (`types.ts`):
```ts
'3-4-3': { GK: 1, DF: 3, MF: 4, FW: 3 },
```
It appears in the Squad formation dropdown automatically (options come from `Object.keys(FORMATIONS)`) and `autoPick` handles it with no other change.

---

## 3 · "Best" formation

**Design:** add `'Best'` to the `FormationName` union, but **not** as a shaped entry in `FORMATIONS`.
- Type `FORMATIONS` as `Record<Exclude<FormationName, 'Best'>, Record<Position, number>>` so "Best" carries no position counts.
- **`autoPick` special-cases `'Best'` first**, per the chosen rule: pick the **highest-level available GK**, then the **top 10 remaining available players by level, regardless of position**:
  ```ts
  if (team.formation === 'Best') {
    const avail = squad // already filtered to available
    const gk = avail.filter(p => p.position === 'GK').sort((a,b)=>b.level-a.level)[0]
    const rest = avail.filter(p => p.id !== gk?.id).sort((a,b)=>b.level-a.level).slice(0, 10)
    return [gk, ...rest].filter(Boolean).map(p => p.id)
  }
  ```
  (Graceful when there is no GK: falls back to the best 11 by level.)
- **Dropdown:** list the shaped formations from `FORMATIONS` **plus** a "Best" option.
- **Guard every other `FORMATIONS[team.formation]` read** so "Best" never indexes the map. Grep `FORMATIONS[` — `autoPick` handles it; `patchLineup`/any reshape helper must early-return `autoPick` (or the same top-11 result) for `'Best'` rather than indexing `FORMATIONS`.
- Match strength is unaffected structurally (`match.ts` reads the actual lineup by position, never `FORMATIONS`) — a keeper-plus-best-10 lineup simply defends with whatever it has. No save migration.

**Test focus:** `autoPick` for `'Best'` returns the best GK + top-10-by-level; still 11 when a GK exists; no `FORMATIONS['Best']` access anywhere (no crash).

---

## 4 · Toasts after the match

**Problem:** in `App.tsx` `advance()`, `detectToasts(state, next)` pushes toasts immediately (line ~82), *before* the match report renders — so "signed/sold/offer" toasts flash behind the match screen.

**Design:** stash the toasts and flush them when the match report closes.
- Add a `pendingToasts` state. In `advance()`: compute `const toasts = detectToasts(state, next)`; if there is a match to watch (`played != null`), `setPendingToasts(toasts)` and `setReplay(played)` (do **not** push yet); the match report's `onClose` flushes them: `pendingToasts.forEach(push); setPendingToasts([]); setReplay(null); setScreen('home')`.
- When `played == null` (no match — see #5), push the toasts immediately (nothing to defer behind).

---

## 5 · Match-free weeks land on the dashboard

**Problem:** when `advance()` produces no user match (`played == null` — a cup week the user isn't in, or a free week), no match screen shows and the screen stays wherever it was.

**Design:** in `advance()`, when `played == null`, `setScreen('home')` (and push the stashed toasts immediately per #4). Weeks where the user does play still show the match; Continue already routes home. Combined with #4, `advance()` becomes:
```ts
const next = advanceRound(state)
const toasts = detectToasts(state, next)
const played = /* user league fixture ?? user cup fixture ?? null */
setState(next)
if (played) {
  setPendingToasts(toasts)
  setReplay(played)
} else {
  toasts.forEach(push)
  setReplay(null)
  setScreen('home')
}
```

---

## 6 · Fixture attendance on the Fixtures page

**Problem:** the selected-fixture detail panel (`FixturesScreen.tsx:110-117`) shows only the scoreline and the `EventFeed` — not the crowd, though `Fixture.attendance?` is stamped.

**Design:** in the selected-fixture `Panel`, render the attendance below the heading when present:
```tsx
{selected.attendance != null && (
  <p className="mb-2 text-sm text-ink-muted">{t('match.attendance', { n: selected.attendance.toLocaleString('en-US') })}</p>
)}
```
Reuses the existing `match.attendance` string (`'{n} in attendance'`).

---

## 7 · Remove the "Friendlies on free weeks" option

**Problem:** the friendly-on-free-weeks feature adds complexity (a whole simulate/income/ledger path) the design no longer wants.

**Design — remove it end to end:**
- **UI:** delete the Squad checkbox (`SquadScreen.tsx:287-298`) and its `squad.friendlies` / `squad.friendliesHint` strings.
- **Home:** the free-week message drops its friendly branch — always `home.freeWeek` (`HomeScreen.tsx:169`); retire `home.freeWeekFriendly`.
- **Engine (`season.ts`):** remove the friendly gate/opponent pick (`~62-71`), the friendly simulation + `friendlyIncome` (`~96-105`), and the friendly-gate ledger append (`~146-152`). Free/cup-idle weeks simply play no user match.
- **State:** remove `GameState.playFriendlies` (`types.ts:177`) and stop setting it in `newGame.ts` and `save.ts`. No migration/version bump — old saves' residual field is ignored.
- **i18n:** retire `ledger.friendlyGate` and its `ledger.ts` regex row.
- **Tests:** remove the friendly-specific cases (`season.test.ts:252-267, 477-512`) and drop `playFriendlies` from any test-state construction (`save.test.ts`, `standings.test.ts`).

**Test focus:** a cup week where the user is idle advances with no user match and no friendly income entry.

---

## 8 · Dashboard notice for a match-free week

**Problem:** the manager should know, from the dashboard, that a week has no match before advancing.

**Design:** the Home next-match panel's no-fixture branch (currently the free-week / friendly message) becomes a clear **"No match this week"** state. Distinguish the two idle cases:
- A **cup week** the user isn't in → e.g. `home.cupWeekIdle` ("Cup week — your club isn't involved").
- A plain **league free week** → `home.freeWeek` ("No match this week").

Detect a cup week via `CUP_WEEKS.includes(state.round)` (`fixtures.ts`). Keep the Advance button in this state. New key `home.cupWeekIdle` (both dictionaries); `home.freeWeek` copy reviewed to read as a clear "no match" line.

**Test focus:** visual — on a free/cup-idle week the dashboard states there's no match; on a match week the opponent card shows as before.

---

## Summary of touched surfaces

| # | Area | Key files |
|---|------|-----------|
| 1 | Scout screen | `src/screens/ScoutScreen.tsx` (new), `Shell.tsx`, `App.tsx`, `icons.tsx`, i18n; uses `makeOffer` |
| 2 | 3-4-3 | `types.ts` |
| 3 | Best formation | `types.ts`, `lineup.ts` (`autoPick`, reshape guard), `SquadScreen.tsx` |
| 4 | Toasts after match | `App.tsx` |
| 5 | Match-free → dashboard | `App.tsx` |
| 6 | Fixture attendance | `FixturesScreen.tsx` |
| 7 | Remove friendlies | `SquadScreen.tsx`, `HomeScreen.tsx`, `season.ts`, `types.ts`, `newGame.ts`, `save.ts`, `ledger.ts`, i18n, tests |
| 8 | Dashboard no-match notice | `HomeScreen.tsx`, i18n |

## Out of scope / notes
- Scout is search + inline offer only — no watchlist/shortlist persistence (YAGNI; revisit if wanted).
- #4 and #5 are one combined `App.tsx` edit.
- If the direct-offers feature is not yet implemented when Scout is built, Scout's Make Offer action has no engine to call — sequence accordingly.
