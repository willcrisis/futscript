# Player Info Popup Design

**Date:** 2026-07-15
**Status:** Approved — ready for planning

Clicking a player's name anywhere it appears as a discrete cell opens a popup with that player's info, stats (including career injury count), and context-appropriate actions. Mirrors the club-links mechanism (`ClubLink` + `ClubNavContext`). **All UI; no engine change, no save-version bump.**

## Global constraints

- Engine stays pure (no React/DOM/i18n imports; randomness threaded; money integer dollars). This feature touches **no** engine files except to *call* existing pure transforms.
- Semantic design tokens only; reuse the `src/ui/` kit; light + dark; mobile-equal.
- i18n: every new `en.ts` key must be added to `pt.ts` (compile-checked). Reuse existing `squad.*` / `club.*` / `common.*` keys wherever the label already exists.
- No `GameState.version` bump.
- Typecheck `npx tsc -b --force`; tests `npm test`.

## Mechanism

Directly parallels `src/ui/ClubLink.tsx` (the club-links feature).

- **`src/ui/PlayerLink.tsx`** (new): a `PlayerNavContext` holding `openPlayer(playerId: number) => void`, exports `PlayerNavProvider`, `usePlayerNav()`, and a default `PlayerLink({ playerId, children, className })`. Off-context it renders `children` as plain text (so a `PlayerLink` in the live match replay — rendered before the provider — degrades gracefully). Same link styling as `ClubLink`.
- **`App.tsx`**: add `const [playerView, setPlayerView] = useState<number | null>(null)`; `const openPlayer = setPlayerView`. Wrap the `Shell` subtree in `<PlayerNavProvider value={openPlayer}>` (nested with the existing `ClubNavProvider` — both wrap the same subtree). Render `{playerView != null && <PlayerModal state={state} setState={setState} playerId={playerView} onClose={() => setPlayerView(null)} />}` inside the provider. Every player-link surface already renders inside `Shell`, so wrapping the Shell subtree is sufficient — no App early-return refactor.
- **`src/screens/PlayerModal.tsx`** (new): the popup itself (see below).

## The popup

An overlay reusing Shell's existing mobile-sheet pattern: `fixed inset-0 z-50` container, semi-opaque backdrop, a centered card (`role="dialog"` `aria-modal="true"`), `max-w-md w-full`, scrollable on short viewports. Closes on backdrop click, an ✕ button, and the **Escape** key (a `useEffect` keydown listener). Built from `Panel`/`SectionLabel`/`Button`/`ConfirmButton`/`MoneyText`/`StatChip`-style primitives; semantic tokens; works light/dark and on mobile.

### Content (the "full card")

Resolve the owning team via `state.teams.find(t => t.playerIds.includes(playerId))` and market value via `marketValue(p)` (`finance.ts`).

- **Header:** player name (large); subline `POS · age · ClubName · D{division}`. Club shown as **plain text** in v1 (a nested club-link would need to also dismiss this popup — out of scope; note as a possible enhancement).
- **Ability block:** `Level {level}` with a faint `↑{peakLevel}` when `level < peakLevel` (reuse the `squad.recoveringTo` title); `Form` as a signed number; `Fitness {fitness}%`.
- **Value/contract block:** `Value` (`MoneyText`), `Salary {money}/wk`, `Contract {n} seasons`.
- **Discipline/health block:** `Season goals {seasonGoals}`; `Injuries {injuryCount}`; `Yellows {yellowCards}`; `Status` = one of Fit / `Injured — {n}w` / `Suspended — {n}w`, using the **same precedence as `ClubScreen`** (`injuredForRounds > 0` → Injured, else `suspendedForRounds > 0` → Suspended, else Fit).

Injury count is forward-looking: older saves migrated in at `injuryCount = 0`, so it counts injuries since that feature shipped, not full career history. (No action needed; stated for clarity.)

### Actions (by relationship to the user)

Determine relationship from the owning team and `state.manager.employed` / `state.userTeamId`. Extract this into a small **pure helper** so it's unit-testable (see Testing):

- **Own player** (owning team `=== state.userTeamId`):
  - **List / Delist:** if listed (`state.transferList.some(l => l.playerId === id)`) show **Delist** (`delistPlayer`); else **List** with an asking-price number input defaulting to `marketValue(p)`, calling `listPlayer(s, id, price)`. Mirror `SquadScreen`'s inline list flow.
  - **Renew contract:** button labeled with `renewalSalary(p)` (reuse `squad.renewFor`), calling `renewContract(s, id)`.
  - **Release:** a `ConfirmButton` (danger) calling `releasePlayer(s, id)`; on success the popup closes (the player left the squad).
- **Other club's player, employed:** **Make Offer** — amount number input defaulting to `marketValue(p)`, calling `makeOffer(s, id, amount)`; disabled when `amount <= 0` or `amount > userCash`. If an offer is already pending (`state.outgoingOffers.some(o => o.playerId === id)`) show "Offer pending" instead. Mirror `ClubScreen`'s offer flow.
- **Unemployed, or no eligible action:** info only (no action row).

All money rounded to integer dollars at input (mirror the existing `Math.round(marketValue(p))` boundary already used by Club/Scout).

### Reuse of engine functions

`listPlayer`, `delistPlayer`, `renewContract`, `renewalSalary`, `releasePlayer`, `makeOffer` — all in `transfers.ts`, all already used by `SquadScreen`/`ClubScreen`/`ScoutScreen`. The popup calls them verbatim via `setState`.

## Surfaces (where a name becomes a `PlayerLink`)

Only **discrete name cells** — where the name is its own element, not interpolated into a translated sentence:

| Screen | Cell |
|--------|------|
| `SquadScreen` | squad table name column |
| `ScoutScreen` | search-results name column |
| `ClubScreen` | roster name column |
| `StatsScreen` | this-season **and** all-time scorer rows (both carry `playerId`) |
| `TransfersScreen` | transfer-**listings** table name column |

Each wraps the existing name markup in `<PlayerLink playerId={p.id}>…</PlayerLink>`, preserving current layout (the squad/scout name cells also render the ⚠ injury-prone marker — keep it, put the `PlayerLink` around the name text only).

**Explicitly out of scope** (names embedded in translated prose — same limitation as the club-links feature): the match **event feed**, the **news** rail, and Transfers **offer** sentences. Confirmed with the user.

## i18n

Reuse existing keys where the label exists: `common.player`, `common.position`, `common.age`, `common.level`, `common.status`, `common.cancel`, `club.makeOffer`, `club.sendOffer`, `club.offerPending`, `squad.renewFor`, `squad.recoveringTo`, `squad.list`/`squad.delist`, `match.attendance` pattern, etc.

New keys (add to **both** `en.ts` and `pt.ts`), under a `player.*` namespace, only for labels not already present, e.g.: `player.form`, `player.fitness`, `player.value`, `player.salary`, `player.contract`, `player.contractSeasons` (`'{n} seasons'`), `player.seasonGoals`, `player.injuries`, `player.yellows`, `player.status`, `player.statusFit`, `player.statusInjured` (`'Injured — {n}w'`), `player.statusSuspended` (`'Suspended — {n}w'`), `player.release`, `player.releaseConfirm`, `player.close`. Format money before interpolation.

## Testing

Consistent with the repo (UI logic is tested via extracted pure helpers, not render tests — cf. `ScoutScreen.test.ts` testing `buildScoutRows`/`applyScoutFilters`):

- Extract the relationship/action-eligibility into a pure function (e.g. `playerActions(state, playerId): { own, canOffer, offerPending, listed }`) in `PlayerModal.tsx` (or a small sibling module) and unit-test it: own player → own actions; other club + employed → offer; other club + pending offer → offerPending; unemployed → none.
- If status derivation is non-trivial, test the fit/injured/suspended precedence.
- `PlayerLink` off-context renders plain text (its `children`).

## Summary of touched files

| Area | Files |
|------|-------|
| Mechanism | `src/ui/PlayerLink.tsx` (new), `src/App.tsx` |
| Popup | `src/screens/PlayerModal.tsx` (new), i18n (`en.ts`/`pt.ts`) |
| Surfaces | `SquadScreen.tsx`, `ScoutScreen.tsx`, `ClubScreen.tsx`, `StatsScreen.tsx`, `TransfersScreen.tsx` |

## Out of scope / notes

- No career-goals stat (only a top-50 leaderboard exists; not reliable per-player).
- Club name in the popup header is plain text (nested club-link + popup dismissal deferred).
- No watchlist/shortlist, no comparison view.
- `#4`-style deferral not relevant; this is one self-contained UI feature.
