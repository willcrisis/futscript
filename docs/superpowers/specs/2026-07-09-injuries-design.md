# Richer Injuries Design

**Date:** 2026-07-09
**Status:** Approved — ready for planning

Make injuries matter beyond a spell on the sidelines: an injury drops a player's level, the level recovers week by week but never fully, and each injury permanently raises the player's chance of getting hurt again. Save version bumps **8 → 9**.

## Global constraints

- Engine stays pure (no React/DOM/i18n imports; randomness threaded through `rand`; money integer dollars).
- Semantic design tokens only; reuse the `src/ui/` kit; light + dark; mobile-equal.
- i18n: every new `en.ts` key must be added to `pt.ts` (compile-checked).
- Save version → **9**; `migrateV8` adds `peakLevel` (= current `level`) and `injuryCount` (= 0) to every player.
- All balance numbers are `ponytail:`-tagged constants. Compounding over careers is validated by headless multi-season sims, not intuition.
- Typecheck `npx tsc -b --force`; tests `npm test`.

## Current behaviour (what changes)

- **Injury** (`season.ts` `applyMatchConsequences`, injury branch): sets `injuredForRounds = randInt(1,6)`, and only for `rounds >= 4` drops `level` by `randInt(1,2)` — permanent, never restored. No proneness tracking.
- **Weekly development** (`training.ts` `applyWeeklyUpdates`): players already gain level via a random `gain` (0/1, capped 99); fitness recovers; form random-walks. This is where recovery folds in.
- **Injury victim** (`match.ts`, the `INJURY_P` branch): picked **uniformly** from the active XI (`pickUniform`).
- **Match strength** (`effectiveLevel`): reads `p.level` — so a recovering player is organically weaker with no change needed there.

## Data model

Add to `Player` (`types.ts`):
```ts
  peakLevel: number   // true ability ceiling that `level` recovers toward; shaved a little by each injury
  injuryCount: number // career injuries; permanent; raises re-injury chance
```
- `level` stays the **current, match-effective** ability; always `<= peakLevel`.
- **Migration `migrateV8`:** for every player, `peakLevel = level`, `injuryCount = 0`.
- **Every player-creation site** sets `peakLevel = level` and `injuryCount = 0`: `newGame` (world loop + any pool-seed loop), `training.ts` youth intake, and `rollover.ts` division-fill (`ensureThreeDivisions` / any four-division variant). Grep for `salary: salaryFor(` / `seasonGoals: 0` to find every `Player` literal.

## Behaviour

### 1 · On injury (scaled by severity)

In `applyMatchConsequences`, replace the injury branch. `rounds = randInt(rand, 1, 6)`:
```ts
} else if (e.type === 'injury') {
  const rounds = randInt(rand, 1, 6)
  const drop = Math.round(rounds * DROP_PER_WEEK)     // ponytail: current-level hit, ~2 (1wk) .. ~9 (6wk)
  const permaLoss = Math.round(rounds / PERMA_DIVISOR) // ponytail: permanent peak shave, 0 (short) .. ~2 (long)
  const peakLevel = Math.max(1, p.peakLevel - permaLoss)
  next[p.id] = {
    ...p,
    injuredForRounds: rounds,
    injuryCount: p.injuryCount + 1,
    peakLevel,
    level: Math.max(1, Math.min(peakLevel, p.level - drop)),
  }
}
```
Constants (tunable): `DROP_PER_WEEK = 1.5`, `PERMA_DIVISOR = 3`.
- Short knock (1 wk): drop ≈ 2, no permanent loss.
- Long layoff (6 wk): drop ≈ 9, permanent peak −2.

### 2 · Weekly recovery (development + healing in one place)

In `applyWeeklyUpdates`, the current `level: Math.min(99, p.level + gain)` becomes a peak-plus-recovery update: development raises the **peak**, and `level` climbs toward it.
```ts
const peakLevel = Math.min(99, p.peakLevel + gain)              // development lifts true ability
const level = Math.min(peakLevel, p.level + RECOVER_STEP)       // reconditioning toward peak
return [p.id, { ...p, peakLevel, level, fitness, form }]
```
Constant: `RECOVER_STEP = 1` (levels regained per week).
- A **healthy** player sits at `level === peakLevel`; the update lifts both by `gain` (unchanged development feel, since `RECOVER_STEP >= gain`).
- A **recovering** player climbs `RECOVER_STEP`/week back toward the (reduced) peak. Recovery ticks **every week including during the layoff** (simplest; the player returns partway healed) — this is the one behaviour to eyeball in the sim; slow `RECOVER_STEP` relative to `drop` keeps returning players meaningfully weaker (e.g. a 6-week injury drops 9, recovers ~6 during the layoff, returns ~3 below peak, then reconditions over ~3 more weeks).

### 3 · Injury proneness (permanent)

In `match.ts`, the injury victim pick changes from uniform to **weighted by proneness** so injured-before players take a larger share of new injuries (without inflating the total injury rate):
```ts
const victim = pickWeighted(side.active, p => 1 + p.injuryCount * PRONENESS_WEIGHT, rand)
```
Constant: `PRONENESS_WEIGHT = 0.15` (a player with 5 prior injuries is ~1.75× as likely to be the one hurt when an injury occurs). `pickWeighted` already exists in `match.ts`.

## Visibility

Squad, Scout, and Club player views:
- **Recovering hint:** when `level < peakLevel`, show the current level with a faint `↑{peakLevel}` marker (e.g. `45 ↑48`) so the manager sees a returning player is below their ceiling.
- **Injury-prone marker:** when `injuryCount >= PRONE_THRESHOLD` (`= 3`), show a small "injury prone" badge/icon on the player.
- New i18n keys: `squad.recoveringTo` (`'↑{n}'` or `'recovering to {n}'` as a title) and `squad.injuryProne` (marker label). Reuse across screens.

## Testing

- `applyMatchConsequences`: a 6-week injury drops `level` more than a 1-week one, lowers `peakLevel`, and increments `injuryCount`; `level` never exceeds the new `peakLevel`; `level >= 1`.
- `applyWeeklyUpdates`: a below-peak player gains `level` toward `peakLevel` and never exceeds it; a healthy player's `level` tracks `peakLevel`.
- `match.ts`: with two identical squads except one player has a high `injuryCount`, over many seeded injuries that player is hurt disproportionately more (statistical assertion).
- `save.ts`: a v8 save migrates to v9 with `peakLevel === level` and `injuryCount === 0` for every player.
- **Balance probe:** drive several headless seasons across seeds; confirm squads don't collectively spiral (average peak erosion stays bounded), retuning the five constants if they do.

## Constants summary (`ponytail:`)

| Constant | Default | Governs |
|----------|---------|---------|
| `DROP_PER_WEEK` | 1.5 | immediate current-level hit per injury week |
| `PERMA_DIVISOR` | 3 | permanent peak shave = round(rounds / this) |
| `RECOVER_STEP` | 1 | levels regained per week toward peak |
| `PRONENESS_WEIGHT` | 0.15 | re-injury victim weight per prior injury |
| `PRONE_THRESHOLD` | 3 | injuries before the "injury prone" marker shows |

## Out of scope
- No age-based injury rate (proneness already trends with veterans via accumulated `injuryCount`).
- No separate rehab/physio spending — recovery is automatic and free.
- No change to `injuredForRounds` healing cadence (still one round/week).
