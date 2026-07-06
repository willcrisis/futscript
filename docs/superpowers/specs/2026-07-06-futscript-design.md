# Futscript — Design Spec

A local-only, browser-based football management game inspired by Elifoot 98 and Hattrick. No backend, no API, no database: everything runs in the page and persists to localStorage (with JSON export/import for backups).

**Date:** 2026-07-06

## Decisions

| Question | Decision |
|---|---|
| Game clock | Turn-based (Elifoot style): one round = one week, user clicks "advance round" |
| Match presentation | Minute-by-minute text ticker, skippable to instant result |
| World size | One country, 3 divisions × 16 teams, promotion/relegation, national cup |
| Player model | Single level (1–99) + position, age, form, fitness |
| Multiplayer | Single-player first; save/turn structure designed so hot-seat can slot in later |
| Tech stack | React + TypeScript + Vite; state in localStorage |
| Phasing | Vertical slices — every phase ends playable |

## Core model

- **World**: one country, 3 divisions of 16 teams each. Bottom 3 swap with top 3 each season. A national knockout cup interleaves with the league calendar. All clubs except the user's are AI-managed.
- **Player**: name, age, position (GK/DF/MF/FW), level (1–99), form (streaks), fitness, salary, contract length (seasons), injury status, market value derived from level + age.
- **Turn**: advancing one round simulates: matches, training gains, injury recovery, finances (wages, income, interest), transfer auctions/deadlines, incoming AI offers.
- **Persistence**: auto-save to localStorage every round; JSON export/import.

## Team management

- **Squad & formation**: choose formation (4-4-2, 4-3-3, 3-5-2, …), starting XI + bench, auto-pick. Out-of-position players play below their level.
- **Training**: one club-wide style — Light (low gains, low injury risk), Normal, Intensive (high gains, higher match injury risk), Youth focus (boosts under-21 growth). Applied weekly.
- **Development & aging**: under-24s gain levels faster; 30+ decline slowly; retirement ~34–36. Season rollover applies aging.
- **Youth academy**: every few rounds a 16–18-year-old joins the squad as a cheap gamble.
- **Injuries**: occur in matches (probability raised by intensive training and low fitness), last N rounds, serious ones cost 1–2 levels. Injured players unavailable.
- **Transfers**:
  - Transfer list with asking price and deadline (in rounds); AI clubs bid against the user (auction).
  - User can list own players and watch bids arrive.
  - **Incoming AI offers**: AI clubs spontaneously offer for the user's players each round; accept/reject/counter.
  - **Release (fire)**: cut a player, paying severance.
- **Finances**: weekly wage bill, ticket income, sponsor income, prize money, transfer fees in/out. Sustained negative balance → board fires the manager (game over).
- **Bank loans**: borrow at interest with weekly repayments; positive balances earn small interest.
- **Fan mood**: results move fan mood; mood drives attendance.

## Stadium management

- Capacity upgrades in tiers; construction costs money and takes several rounds.
- User sets ticket price: higher price shrinks attendance, lower packs the ground.
- Weekly maintenance scales with capacity (overbuilding in low divisions hurts).
- Attendance = f(capacity, ticket price, fan mood, opponent strength, league position).

## Matches & competitions

- **Engine**: team strength from player levels, position fit, formation matchup, form, fitness, home advantage, and tactic (defensive / normal / attacking). Chances generated minute by minute, resolved into events: goals, near misses, yellow/red cards, injuries, substitutions.
- **Ticker**: watchable minute-by-minute commentary with a skip-to-result button.
- **Discipline**: red card or accumulated yellows → suspension next round(s).
- **Friendlies**: schedulable on free calendar weeks for ticket income, with normal injury risk.
- **Season**: double round-robin league + knockout cup; end-of-season promotion/relegation, prize money, awards (top scorer, champion), aging, contract renewals, then a new season.
- **Stats & history**: league tables, fixtures/results, top scorers, club history page (past champions, trophies).

## Explicitly out of scope (for now)

Player personalities/agents, weather, set-piece takers, national teams, multiple countries, custom club editor. Phase 6 lists optional late additions.

## Delivery phases

Each phase ends with something playable in the browser.

### Phase 1 — Kickoff (playable core loop)
Vite + React + TS scaffold. Generate world (start with 1 division, 16 teams, ~18 players each). Squad screen, formation picker with auto-pick, instant match results (scores only), league table, fixtures, advance-round button, full season with champion, auto-save/load via localStorage.
**Done when:** a full season can be played and won or lost.

### Phase 2 — Matchday (match depth + player development)
Minute-by-minute engine with text ticker (skippable). Cards and suspensions. Injuries with recovery time and level loss. Form and fitness. Home advantage and attack/normal/defend tactic. Training styles with weekly gains and injury-risk tradeoff. Aging at season end.
**Done when:** watching a match is fun and the squad changes over a season.

### Phase 3 — The Market (money + transfers)
Salaries and weekly wage bill, ticket income, prize money, finance screen with history. Transfer list with deadline auctions and AI bidders; buy, sell, release with severance. Incoming AI offers for the user's players. Contracts and renewals. Bank loans with interest. Board sacks the manager if broke too long.
**Done when:** a team can be rebuilt through the market — or bankrupted trying.

### Phase 4 — The Long Game (world depth)
Expand to 3 divisions with promotion/relegation. National knockout cup in the calendar. Friendly matches on free weeks. Youth academy intake. Season rollover with retirement, awards, persistent club history/trophy room.
**Done when:** a 10-season career from Division 3 to the title makes sense.

### Phase 5 — Club Life (stadium + polish)
Full stadium management (capacity tiers, construction time, ticket pricing, maintenance, attendance model). Sponsors and fan mood. Stats pages (all-time scorers, records). Multiple save slots + JSON export/import.
**Done when:** the stadium↔fans↔results money loop feels like Elifoot.

### Phase 6 — Optional
Hot-seat multiplayer, 2D match visualization, multiple countries + continental cup, custom club editor. Build only if still wanted.

## Architecture notes

- **Sim engine as pure TypeScript** (no React imports): world generation, match sim, finances, transfers — all pure functions over a single serializable `GameState`. React renders state and dispatches actions; `advanceRound(state) → state` is the heart.
- Pure engine keeps the door open for hot-seat (multiple managers = multiple team IDs marked human) and makes the sim testable headless.
- Single `GameState` object serialized to localStorage; schema carries a version number for future migrations.
- Randomness through a seeded RNG stored in state, so bugs are reproducible from a save file.

## Testing

Engine logic (match sim, finances, auctions, season rollover) gets plain unit tests (Vitest) — it's pure functions, so tests are cheap. UI is verified by playing; no UI test suite unless it earns its keep.
