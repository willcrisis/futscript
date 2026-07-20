# "willcrisis" Easter Egg — Design

**Date:** 2026-07-20
**Status:** Approved

## What

A cheat-code easter egg: starting a new career with the manager name exactly
`willcrisis` (case-sensitive, after trim) grants the user's club a super-team
and a 30,000-seat stadium.

## Trigger

- **New game only.** The WelcomeScreen appears solely on fresh careers; its
  `onDismiss` handler in `App.tsx` is the hook point.
- After `renameManager(state, name)`, if `name.trim() === 'willcrisis'`,
  additionally apply the engine transform below.
- Renaming mid-career (SavesScreen) does **not** trigger it. Renaming away
  from `willcrisis` later does nothing — the blessing is permanent.

## Engine transform

New pure function in `src/engine/newGame.ts`:

```ts
export function willcrisis(state: GameState): GameState
```

For the user's team (`state.userTeamId`) only:

| Field | Value | Note |
|---|---|---|
| player `level` | 99 | engine hard cap (training.ts caps at 99) |
| player `peakLevel` | 99 | so training never pulls level down |
| player `age` | 19 | holds peak for ~a decade of seasons |
| player `contractSeasons` | 30 | effectively never expires |
| player `salary` | 1 | integer dollar |
| player `form` | 3 | max — "strongest team possible" |
| team `capacity` | 30000 | |

All 18 existing generated players are boosted in place — same names, same
positions (2 GK / 6 DF / 6 MF / 4 FW), no new player IDs.

**Determinism:** the transform draws no randomness and touches no `rngState`.
Every other team, the fixtures, and the cup are unchanged.

## Deliberately not touched

- `cash` (stays `STARTING_CASH`), lineup (already auto-picked; irrelevant at
  uniform 99), board confidence, fan mood, ticket price.
- No economy guard: 30k seats cost ~$36k/round maintenance, but $1 total
  salaries plus 30k-gate receipts dwarf it.
- Aging/decline still applies normally after the players pass peak age.
- No save-version bump or migration: no state-shape change, only values in
  existing fields.

## Testing

One engine test (beside `newGame.test.ts`): build a fresh `newGame` state,
apply `willcrisis`, assert:

- every user-team player has level 99, peakLevel 99, age 19,
  contractSeasons 30, salary 1, form 3;
- user team capacity is 30000;
- a rival team's players are untouched;
- `rngState` is unchanged.

## Size

~15 lines engine, ~2 lines `App.tsx`, one test.
