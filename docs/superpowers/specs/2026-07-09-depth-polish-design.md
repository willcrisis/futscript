# Depth & Polish Batch Design

**Date:** 2026-07-09
**Status:** Approved — ready for planning

Twelve post-playtest changes from a fresh D4 career: a fourth division with a demotion pool, level rebalance, a clean cup bracket with extra time + shootouts, direct offers on any player, a fixture home/away fix, and five UI refinements. Save version bumps **7 → 8**.

## Global constraints

- Engine stays pure (no React/DOM/i18n imports; randomness threaded through `rand`/`rngState`; money is integer dollars).
- Semantic design tokens only; reuse the `src/ui/` kit; light + dark; mobile-equal.
- i18n: every new `en.ts` key must be added to `pt.ts` (compile-checked). Retired keys removed from both.
- Engine must stay **generic over division count** — a v7 save has 3 divisions, a new game has 4. No code may assume exactly 3 (or 4) divisions, or that division 3 is the lowest.
- Save version → **8**. Migration `migrateV7(state)` adds `outgoingOffers: []` and leaves the 3-division world intact (no pool, no D4). New games are 4-division worlds with a demotion pool.
- Typecheck: `npx tsc -b --force`. Tests: `npm test`.

---

## 1 · Fourth division + demotion pool

### World shape
- **64 active clubs** in 4 divisions of 16. `DIVISION_OF(index)` becomes `index < 16 ? 4 : index < 32 ? 3 : index < 48 ? 2 : 1` (ids 0–15 = D4 … 48–63 = D1). New careers start in a **random D4 club** (was random D3).
- **68 clubs total**: 4 extra clubs are created at world-gen and placed directly in the **demotion pool** (see below). `TEAM_NAMES` expands from 48 to **68** entries.
- Economy maps gain a division-4 entry: `DIVISION_FACTOR` `{1:1, 2:0.8, 3:0.6, 4:0.45}`, `SPONSOR_BASE` `{1:40k, 2:24k, 3:15k, 4:10k}`, `INITIAL_CAPACITY` gains `4:` (a value below D3's — pick in-plan, e.g. two-thirds of D3). Any other `Record<number, …>` keyed by division gains a `4` key.

### Level ranges (#2, #3)
`LEVEL_RANGE` becomes 4-tier, with **narrow spans in the lower divisions** (a weak division is uniformly weak, not a mix of 30s and 60s):

```ts
export const LEVEL_RANGE: Record<number, [number, number]> = {
  1: [58, 80], // span 22
  2: [46, 66], // span 20
  3: [40, 52], // span 12
  4: [30, 40], // span 10
}
```
(All four are `ponytail:`-tagged constants — retune in one place. Migrated 3-division saves keep their existing squads; the new ranges only affect new games.)

### Demotion pool
The bottom division has no lower league, so its worst clubs rotate through a one-season pool instead of standing still.

- **Data:** add optional `poolReturn?: number` to `Team` — the season number when a pooled club rejoins D4. `undefined` = active. A club with `poolReturn` set and `> state.season` is **dormant**: excluded from fixtures, standings, cup draws, weekly finances, transfers, mood, news, and career processing. Its squad is frozen (no aging/training/healing/wages) for the sat-out season.
- **Seeding:** at `newGame`, the 4 pool clubs are created with `poolReturn = 2` (dormant through season 1, rejoin for season 2). This keeps every division at 16 from the first rollover.
- **Rollover (`newSeason`), gated on the world having a division 4** (`state.teams.some(t => t.division === 4)`), applied *after* the normal inter-division promotion/relegation resolves:
  1. **Return:** every club with `poolReturn === newSeasonNumber` rejoins **D4** (`division = 4`, `poolReturn` cleared).
  2. **Demote:** the **bottom 4** of the just-finished D4 table get `poolReturn = newSeasonNumber + 1` (sit out the coming season, return the one after). They are removed from D4's active set for the coming season.
  - Net D4 turnover: 3 up to D3, 4 to pool, 3 down from D3, 4 back from pool → 16 maintained.
- **Fixtures/standings/cup/finances** all filter active clubs as `state.teams.filter(t => t.poolReturn == null || t.poolReturn <= state.season)` — i.e. exclude clubs still waiting. (Prefer a single helper `activeTeams(state): Team[]` in the engine, used everywhere a full-league iteration happens today.)
- **Migrated 3-division saves:** `poolReturn` is absent on all clubs, no D4 exists, so the pool cycle never runs and the bottom division (D3) keeps today's stand-still behavior.

**Bootstrap timeline:** newGame season 1 → pre-seeded 4 dormant (poolReturn 2). End of S1 → those 4 return to D4 for S2; S1's D4 bottom-4 pooled (poolReturn 3). End of S2 → S1's demotees return; S2's bottom-4 pooled (poolReturn 4). Steady thereafter.

---

## 2 · Cup — clean bracket + extra time + shootout (#1 cup, #10)

### Bracket (generic, one path for 48- and 64-team worlds)
- Round 1 fills a **64-slot bracket** (6 rounds → final is 2 clubs). All active clubs enter; if fewer than 64, the **strongest clubs (highest division first) get round-1 byes** to fill the bracket.
  - 64 clubs → **0 byes**, a clean 64→32→16→8→4→2→1 knockout across the existing `CUP_WEEKS` (6 weeks).
  - 48 clubs (migrated) → 16 byes to the D1 clubs, reproducing today's "top flight enters round 2" behaviour with a single code path.
- Replaces the current `drawFirstCupRound`/`drawNextCupRound` bye special-case with a bracket-fill by seed. Dormant (pooled) clubs are excluded from entrants.

### Extra time + penalties (all cup ties)
Replaces the coin-flip (`rand() < 0.5`) in the season cup block. When a cup tie is level after 90':
1. **Extra time:** simulate 30 minutes (minutes 91–120) at roughly one-third of a full match's chances. Events carry minutes > 90 and appear in the feed.
2. **Still level → shootout:** simulate kicks.
   - **5 kicks each**, alternating.
   - If still level, **sudden death**: repeated rounds where **both teams take one kick**; a round is decided only when **one scores and the other misses**. (Not first-to-score.)
   - Per-kick conversion is a tuned constant (~0.75) nudged slightly by the taker's level. `ponytail:`-tagged.
   - Kicks emit feed events; the tie's `winnerId` is the shootout winner.

New engine surface (`match.ts`): a cup-tie resolver, e.g. `resolveCupTie(home, away, players, rand): { homeGoals, awayGoals, winnerId, events }` that runs `simulateMatch`, then ET, then the shootout as needed. Regular-time `homeGoals`/`awayGoals` remain the 90' score; the shootout result rides on `winnerId` + events.

### Match screen (`MatchScreen.tsx`)
- When a fixture's events include a minute > 90, the clock and progress bar extend to **120**.
- The existing penalty line generalises to show the **shootout score** (e.g. "Won on penalties 4–3") when the tie went to kicks.

---

## 3 · Fixtures — balanced home/away (#11)

**Problem:** the circle method's `(r + m) % 2` venue heuristic gives some clubs long home/away streaks (a fresh career opened with 6 straight away games), and the mirrored second half then flips that streak wholesale (all-home first half → all-away second half).

**Design:** replace the venue assignment in `generateFixtures` with the standard **balanced circle method** so each club alternates home/away with at most one "break" across the single round-robin. The second half keeps the mirrored-venue structure (each pair plays home-and-away over the season), which — once the first half is balanced — no longer produces long streaks.

**Test focus:** across a generated division schedule, (a) every club's home count is within 1 of half its games, and (b) no club has more than 2 consecutive home or away fixtures in the first-half schedule.

---

## 4 · Direct offers on any player (#9)

Mirror the incoming-offer flow, in the opposite direction.

- **Data:** add `outgoingOffers: Offer[]` to `GameState` (reuse the existing `Offer` shape: `{ playerId, bidderTeamId, amount, roundsLeft }`, where `bidderTeamId` is the user's team for outgoing). Migration seeds `[]`.
- **`makeOffer(state, playerId, amount): GameState`** — validates the target isn't the user's own player, the user can afford it, and no duplicate outgoing offer exists; appends to `outgoingOffers` with `roundsLeft = OFFER_ROUNDS`.
- **AI response (in `runTransfers`, each market tick):** for each outgoing offer, the selling club decides:
  - **Accept** when the bid clears the player's value (≥ `marketValue × k`, higher `k` for a key/high-level player) **and** the club can spare him (`playerIds.length > MIN_SQUAD`). Executes the transfer (money + squads + lineup cleanup, via the existing `transferPlayer`), pushes a `offerAccepted` news/toast.
  - **Reject** otherwise (low bid, or squad too thin), pushes `offerRejected`; the offer is removed. Offers also age out via `roundsLeft` like incoming ones.
- **UI:** on **ClubScreen** (viewing another club's squad), each player row gets a **Make offer** action (opens an amount input, defaulting to market value), disabled for the user's own club. A pending outgoing offer shows a "Offer pending" state.

**Balance note:** keep the acceptance bar meaningful so the user can't trivially strip AI squads — the `k` multiplier and the key-player guard are `ponytail:`-tagged for tuning.

---

## 5 · UI polish (#4, #5, #6, #7, #8)

### #4 — ClubScreen back arrow
Add a `BackIcon` (left arrow) to `icons.tsx`. Extend `ScreenHeader` with an optional `onBack?: () => void` that renders a **top-left arrow button** before the label/title. `ClubScreen` passes `onBack` and drops the right-side text back button.

### #5 — Expiring-contract warning on a fresh save
On **Home**, for a brand-new career (`state.season === 1 && state.round === 1`) with any user player whose `contractSeasons <= 1`, show the **same contracts-expiring banner** used at season end (`app.contractsExpireWarning`). No new state — a render condition reusing the existing string and panel treatment.

### #6 + #7 — Unified match/squad icons
One shared icon set across the match feed and the squad table:
- **Yellow card** → `YellowCardIcon` (yellow chip) in both.
- **Red card** → new `RedCardIcon` (red chip, same pictogram family) — used in the match feed for red-card events.
- **Injury** → `PlusIcon` in both (the squad already uses it; `EventFeed` switches its text `+` to the same component).
- Goal `●` / chance `○` stay match-only (no squad equivalent).
`EventFeed`'s `EventIcon` renders `YellowCardIcon`/`RedCardIcon`/`PlusIcon` within its existing `w-4` slot.

### #8 — League-table marker disambiguation
The user's row and promotion rows currently both show a green left border. Change so:
- **User's team** → a **subtle filled row background + bold name** (the search-highlight `ring` stays for the highlighted row). Remove the `'user'` accent from the left-border channel.
- **Left border** → **promotion (green) / relegation (red/warn) only**.

`rowAccent` returns `'up' | 'down' | null` (no `'user'`); a separate `rowClass`/row-style path applies the user's fill+bold. Keep the generic division checks (`division !== 1` for promotion, `division !== <lowest>` for relegation) — with 4 divisions the lowest is D4.

---

## Data model & migration summary

| Change | Field / shape | Migration (v7 → v8) |
|--------|---------------|---------------------|
| Direct offers | `GameState.outgoingOffers: Offer[]` | add `[]` |
| Demotion pool | `Team.poolReturn?: number` (optional, additive) | absent on old clubs → pool never runs (no D4) |
| Version | `GameState.version = 8` | `migrateV7` chains in |

- New games: 68 clubs, 4 divisions + 4 pooled, `outgoingOffers: []`.
- Old saves: 48 clubs, 3 divisions, `outgoingOffers: []`, no `poolReturn` — fully playable; cup uses the generic bracket (byes to D1) and the pool cycle stays dormant.

## Summary of touched surfaces

| # | Area | Key files |
|---|------|-----------|
| 1 | 4 divisions + level ranges + pool | `newGame.ts`, `names.ts`, `types.ts`, `season.ts` (rollover), `finance.ts` (division maps), `standings.ts`, `fixtures.ts`, `cup.ts` |
| 2 | Cup bracket + ET + shootout | `cup.ts`, `match.ts`, `season.ts`, `MatchScreen.tsx`, i18n |
| 3 | Fixture balance | `fixtures.ts` |
| 4 | Direct offers | `transfers.ts`, `types.ts`, `ClubScreen.tsx`, `save.ts` (migration), i18n |
| 5a | Back arrow | `icons.tsx`, `ScreenHeader.tsx`, `ClubScreen.tsx`, i18n |
| 5b | Fresh-save contract warning | `HomeScreen.tsx` / `App.tsx` |
| 5c | Unified icons | `icons.tsx`, `EventFeed.tsx`, `SquadScreen.tsx` |
| 5d | Table marker | `TableScreen.tsx`, `DataTable.tsx` (if row-fill support needed) |

## Out of scope / deferred
- No 2D pitch (still its own future phase).
- Pooled clubs' squads are frozen (not aged/retired) during their sat-out season — accepted simplification; revisit only if pooled clubs return conspicuously stale.
