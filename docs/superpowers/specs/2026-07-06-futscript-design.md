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

Player personalities/agents, weather, set-piece takers, national teams, multiple countries, custom club editor. The "Someday" note after the phases lists optional late additions.

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

### Phase 6 — Quality of Life *(added 2026-07-07; UI redesign "Quiet Heritage" shipped between Phases 5 and 6)*
- **Translations (en, pt)**: UI strings only via a hand-rolled typed dictionary (`t('squad.release')`); player/club names stay as data. Language select persisted alongside the theme, browser-default. Engine ledger labels become translation keys; existing saved ledgers migrate gracefully.
- **Match speeds**: five ticker presets — Slow / Medium / Fast / Super fast / Ultra fast (500 / 400 / 300 / 150 / 50 ms per match minute), choice persisted between matches.
- **Squad icon actions**: Start / Sell / Release / Renew become icon buttons with tooltips and aria-labels.
- **Simplified finance screen**: leads with "This week: Income · Expenses · Net" and a category breakdown (gates, sponsors, prizes / wages, maintenance, interest); the raw ledger collapses behind a details toggle.
- **New career (reset)**: a "New career" action with two-click confirm on the Saves screen — today a fresh start is only reachable by getting sacked.
- **Random starting club**: `newGame` assigns a random Division 3 club (seed-driven) instead of always the first team, so every career starts somewhere new.
- **UX pack** *(playtest feedback, 2026-07-07)*:
  - Cup ties show each club's division (`Sereno FC · D2`) so upsets are legible.
  - Transfers: the engine remembers your last bid per listing (optional field, no migration); the UI shows an "Outbid — you bid $X" badge when covered, plus a toast the week it happens.
  - Table: search across all divisions — typing a club name jumps to its division and highlights the row.
  - Home's Next Match opponent is clickable → Table at that club's division, row highlighted (shares the search mechanic's "focus team" pathway).
  - Home/away clarity (mechanics unchanged — gates are home-only and home advantage exists): H/A markers on the user's fixtures, and the finance summary's gate line hints "earned at home matches".
  - **Welcome screen** on new careers: a dismissible takeover describing the game's features (localized), shown once per new save; not shown when loading existing careers.
  - **Labeled controls** *(playtest)*: bare selects are ambiguous (Squad's "attacking"/"normal" dropdowns are indistinguishable). Every control group gets a visible micro-label above it (uppercase, faint — FORMATION / TACTIC / TRAINING, DIVISION on Table/Fixtures), and Friendlies regains its explanation ("Friendlies on free weeks") plus a tooltip describing the tradeoff (gate income, injury risk).
**Done when:** the game plays comfortably in either language at any speed, and a new career takes one click.

### Phase 6.5 — The News *(playtest feedback, 2026-07-07)*
A persistent, translated news feed living in the save (structured `{key, params}` entries, capped ~60, so language switches retroactively).
- **Right sidebar rail** on wide screens (~1280px+): compact entries — icon per type, one line, week stamp, newest first. On narrower screens the rail hides and News becomes a Home panel (top five, rest behind it).
- **Sources**: the user's club (signings, sales, renewals, injuries to starters, board warnings, construction, outbid notices); division rivals (completed transfers, heavy wins, cup runs); season structure (promotion/relegation verdicts, champions, cup winner). Career mode (Phase 7) later adds sackings and manager moves to the same feed.
**Done when:** a season tells its story in the rail without opening other screens.

### Phase 7 — Career Mode *(added 2026-07-07)*
Being a manager, not a club.
- **Board confidence** (visible meter, 0–100, starts 60): moves weekly on results vs *expectations*, where expectation derives from the squad's strength rank within its division (a weak squad in 10th is fine; a strong squad in 10th is not). Relegation-zone streaks and relegation drain it hard; promotion and silverware fill it. At 0: sacked for performance. The financial rule (8 broke weeks) remains a separate instant sacking.
- **Manager reputation** (career-long, survives sackings): raised by overperforming expectations, promotions, titles, cups; dented by sackings. It is what the job market sees.
- **Unemployment replaces game over**: sacked → "awaiting offers." The world keeps simulating while the manager spectates (weeks advance freely); job offers arrive probabilistically, weighted by reputation — high reputation attracts Division 1 benches, low reputation gets Division 3 strugglers. Accepting takes over that club as-is (their squad, their books); the old club reverts to AI. A career ends only by choice (reset).
- **Poaching while employed**: overperforming managers receive offers from richer clubs — mostly at season end, occasionally mid-season; declining carries no penalty.
- **Manager-centric history**: each season row records which club was managed; honours accumulate across clubs.
**Done when:** getting sacked in Division 1 and rebuilding a reputation from a Division 3 bench feels like a story, not a game over.

### Phase 8 — 2D Match Visualization *(kept from the original optional list)*
Animated 2D pitch view (dots/players) as an alternative to the text ticker, driven by the same event stream.

### Someday / out of scope for now
Hot-seat multiplayer, multiple countries + continental cup, custom club editor. Build only if still wanted.

## Architecture notes

- **Sim engine as pure TypeScript** (no React imports): world generation, match sim, finances, transfers — all pure functions over a single serializable `GameState`. React renders state and dispatches actions; `advanceRound(state) → state` is the heart.
- Pure engine keeps the door open for hot-seat (multiple managers = multiple team IDs marked human) and makes the sim testable headless.
- Single `GameState` object serialized to localStorage; schema carries a version number for future migrations.
- Randomness through a seeded RNG stored in state, so bugs are reproducible from a save file.

## Testing

Engine logic (match sim, finances, auctions, season rollover) gets plain unit tests (Vitest) — it's pure functions, so tests are cheap. UI is verified by playing; no UI test suite unless it earns its keep.
