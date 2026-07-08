# UX Refinements Design

**Date:** 2026-07-08
**Status:** Approved — ready for planning

Nine post-playtest refinements. Mostly UI + i18n; three small, contained engine touches. No save-version bump.

## Global constraints

- Engine stays pure (no React/DOM/i18n imports); randomness threaded through `rngState`; money is integer dollars.
- Semantic design tokens only; reuse the `src/ui/` kit; light + dark; mobile-equal.
- i18n: any new key added to `en.ts` must be added to `pt.ts` (compile-checked). Retired keys removed from both.
- No `GameState.version` bump — every change here fits the current schema (the lineup is already an arbitrary subset of the squad; `attendance` is an optional additive field on fixtures, which regenerate each season).

---

## 1 · Free XI selection (formation as suggestion)

**Problem:** The XI can only be edited via a position-aware `swapIn` (bench player displaces the weakest starter *of the same position*), and a starter can't be removed at all. The user wants to curate freely — e.g. field 5 forwards — with formation as a mere suggestion.

**Key fact:** Match strength already reads the actual lineup by position (`match.ts` `attack`/`defense`: FW→attack, GK/DF→defense, MF→both). Formation is **not** used in simulation — only by `autoPick`/`patchLineup` to *choose* a shape. So free selection needs no match-math change; fielding 5 FW is organically strong in attack, soft in defense.

**Design:**
- **Squad screen** (`src/screens/SquadScreen.tsx`): every squad row gets a plain **on/off toggle** for "starting". Toggling on adds the player to `team.lineup`; toggling off removes them. No shape enforcement, no auto-displacement. The toggle is disabled for unavailable players when *adding* (can't start an injured/suspended player), but a currently-selected player who becomes unavailable is handled by #4.
- **Engine** (`src/engine/lineup.ts`): add `toggleStarter(team, playerId): number[]` — returns `lineup` with `playerId` removed if present, else appended. Replaces `swapIn` usage in the screen. `swapIn` is deleted (no other callers).
- **Formation dropdown stays** but is now only a *suggestion*: it seeds the **Auto-pick** button (`autoPick`, unchanged) and new-save defaults. Changing it still runs `autoPick` to reshape (that's the point of picking a formation), but manual toggles afterward may deviate freely.
- **Advance gate:** while the manager is employed, the Advance-week button is **disabled unless the user's lineup has exactly 11 players**, with a hint. New-season advance (`shell.newSeason`) is **not** gated. Gate lives in `HomeScreen.tsx` where the `onAdvance` buttons render (`shell.advanceWeek`); disable + show hint text when `userLineup.length !== 11`.
  - New i18n key `squad.selectElevenHint` → e.g. `"Select 11 to continue ({n}/11)"`.
- **Match-time lineup:** in `season.ts` (~line 76), for the **managed** team, keep `t.lineup` verbatim instead of calling `patchLineup` (which would reshape a deliberate 5-FW lineup back toward the formation). Guard: if the managed lineup is somehow not 11 available players, fall back to `autoPick` so a match never fields <11 (unreachable in normal play thanks to the gate + #4, but cheap safety). AI teams keep `autoPick`.

**Test focus:** `toggleStarter` add/remove; screen toggle round-trips; gate disables at ≠11 and enables at 11; managed team's exact XI reaches `simulateMatch` unreshaped; autoPick fallback fires when managed lineup invalid.

---

## 2 · Green dot instead of "XI" badge

**Problem:** The starter indicator next to a player's name is an accent `XI` text badge — noisier than needed.

**Design:** In `SquadScreen.tsx` name column, replace `<Badge tone="accent">{t('squad.xiBadge')}</Badge>` with a small filled accent dot (e.g. `<span className="size-2 rounded-full bg-accent" aria-label={...} />`). Retire the `squad.xiBadge` key from both dictionaries (keep an aria-label key for the dot, e.g. `squad.startingAria`).

---

## 3 · Lighten past-week news

**Problem:** Every news entry reads at the same weight; older items should recede.

**Design:** In `src/ui/NewsRail.tsx`, treat the newest entry's `(season, week)` as "this week". Each row whose `(season, week)` is older than that renders at **reduced emphasis** — an opacity fade (e.g. `opacity-60`) layered on top of the existing per-type tone from `toneOf`, so danger/warn colors still read but muted. Newest-week rows stay full-strength. Compute the newest `(season, week)` once from `items[0]` (already newest-first).

**Test focus:** rows older than the newest week get the muted class; newest-week rows do not.

---

## 4 · Auto-deselect injured/suspended (composes with #1)

**Problem:** A player injured/suspended in a match stays tagged in the XI on the Squad screen until the next round's pre-match `patchLineup` silently fixes it. The user wants the drop to be immediate and visible.

**Key fact:** In `season.ts advanceRound`, `patchLineup` runs *before* the match (line ~76) using last round's availability; new injuries/suspensions are applied *after* (lines ~38–45). So between matches the saved lineup still contains the freshly-unavailable player.

**Design:** After matchday injuries/suspensions are applied in `advanceRound`, **remove** now-unavailable players from the **user's** lineup (`lineup.filter(id => isAvailable(players[id]))`). Do **not** auto-refill — the resulting <11 lineup then trips the #1 advance gate, forcing the user to consciously pick replacements. This respects the manual-curation direction chosen in #1 (rather than the engine silently auto-filling the XI).

**Test focus:** a user starter injured during a match is absent from the saved lineup after `advanceRound`; lineup length drops accordingly; no auto-refill occurs.

---

## 5 · Icon status column

**Problem:** The Squad status column uses text badges (`Inj 2w`, `Ban 1w`, `2 cards`).

**Design:** Replace `statusBadge` in `SquadScreen.tsx` with pictograms:
- **Yellow cards** → yellow card pictogram (small rounded rect, yellow fill) with the count.
- **Suspension** → red card pictogram + weeks (`{n}w`).
- **Injury** → red **"+"** (medical cross) icon + weeks (`{n}w`).

Add the card/cross pictograms to `src/ui/icons.tsx` (inline SVG, currentColor where sensible; the card fills are fixed yellow/red). Retire the `squad.cards` text key; keep injury/suspension week formatting via a small suffix key (e.g. reuse `common.weeksShort` → `"{n}w"`). Precedence stays: injury > suspension > yellow cards > nothing.

**Test focus:** each status renders its icon + week/count; precedence holds when multiple could apply.

---

## 6 · Continue → dashboard

**Problem:** After a match, Continue returns to the prior screen; the user expects to land on the dashboard.

**Design:** In `App.tsx`, the match-close handler (`onClose`) routes to Home. For the live-advance match flow, set `screen` to `'home'` on close; for the replay flow (`onClose={() => setReplay(null)}`), also `setScreen('home')` if that's where Continue should land — confirm both close paths end on Home. (Currently `onClose={() => setReplay(null)}` at `App.tsx:98` and the advance flow's close both route back; change to navigate Home.)

**Test focus:** manual/visual — after a match ends, Continue shows Home.

---

## 7 · Reverse cup order

**Problem:** Cup rounds render Round 1 first, Final last.

**Design:** In `CupScreen.tsx`, reverse the rounds render order (latest round on top) — change the `rounds` sort to descending (`(a, b) => b - a`). The selected-tie detail panel and per-round tie lists are unaffected.

**Test focus:** visual — Final/most-advanced round appears at the top.

---

## 8 · Delist a listed player

**Problem:** Once the user lists a player for sale, the Squad screen shows a muted "Listed" badge with no way to cancel.

**Design:**
- **Engine** (`src/engine/transfers.ts`): add `delistPlayer(state, playerId): GameState` — removes the user's own listing (`transferList.filter(l => l.playerId !== playerId)`), dropping any pending AI bids on it (they can re-bid later while the transfer window logic runs). One-liner mirroring the filter already used in `transferPlayer`/`releasePlayer`.
- **Squad screen:** replace the muted `listedBadge` display in the actions cell with a **delist button** (tag-off icon, added to `icons.tsx`) that calls `delistPlayer`. Applies to the user's own listings only.

**Test focus:** `delistPlayer` removes the listing and any bids on it; a non-listed or non-owned id is a no-op returning the same state.

---

## 9 · Live attendance on the match screen

**Problem:** Attendance is computed inside `runWeeklyFinances` (`interest × priceFactor × moodFactor + jitter±500`, capped at capacity) and survives only as text in the ledger label `"Gate receipts (N fans)"`. The match screen can't show it. Attendance is outcome-independent (depends only on the home club's capacity, ticket price, fan mood, division interest, + jitter).

**Design — single source of truth on the fixture:**
- Add optional `attendance?: number` to `Fixture` and `CupFixture` (`types.ts`). Additive, no migration — fixtures regenerate each season.
- Compute attendance **at match-simulation time** in `season.ts advanceRound` for each played fixture (league + cup), using the **home** team, and store it on the fixture. Extract the attendance formula (currently inline in `finance.ts`) into a shared pure helper, e.g. `attendanceFor(team, rand): number` in `finance.ts`, called from both places so the formula lives once.
- `runWeeklyFinances` **reads** `fixture.attendance` for the gate when present, falling back to computing it (via the same helper) when absent (old saves' already-played fixtures). This keeps the match-screen number and the "Gate receipts (N fans)" ledger line identical.
- **Match screen** (`MatchScreen.tsx`): show attendance under the scoreline throughout the match, for home, away, and replays — a static figure (`{n} in attendance`), rendered only when the fixture carries the field. New i18n key `match.attendance` → `"{n} in attendance"`.

**RNG note (accepted):** moving the attendance `rand()` draw from finance-time to match-time shifts the seeded RNG stream, so a fresh game plays out differently than before this change. Still fully deterministic; invisible to players. Called out only because this project treats the RNG stream as load-bearing.

**Test focus:** `attendanceFor` deterministic for fixed rand + team; `advanceRound` stamps `attendance` on played home/away fixtures; finance reads the stored value (ledger fans == fixture attendance) and falls back when absent; match screen renders the figure when present and omits it when absent.

---

## Summary of touched surfaces

| # | Engine | UI / i18n |
|---|--------|-----------|
| 1 | `lineup.ts` (`toggleStarter`, drop `swapIn`), `season.ts` (managed lineup verbatim + fallback) | `SquadScreen` toggle, `HomeScreen` advance gate, `squad.selectElevenHint` |
| 2 | — | `SquadScreen` dot, retire `squad.xiBadge` |
| 3 | — | `NewsRail` age fade |
| 4 | `season.ts` (drop unavailable from user lineup post-matchday) | — |
| 5 | — | `SquadScreen` status pictograms, `icons.tsx`, retire `squad.cards` |
| 6 | — | `App.tsx` match-close → Home |
| 7 | — | `CupScreen` reverse rounds |
| 8 | `transfers.ts` (`delistPlayer`) | `SquadScreen` delist button, `icons.tsx` |
| 9 | `types.ts` (`attendance?`), `finance.ts` (`attendanceFor` helper + read from fixture), `season.ts` (stamp attendance) | `MatchScreen` attendance line, `match.attendance` |
