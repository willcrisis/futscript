# Futscript Phase 7 — Career Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Being a manager, not a club — board confidence sackings, career-long reputation, unemployment with a job market instead of game over, an Elifoot-style AI manager carousel feeding the news, and a club details page.

**Architecture:** A new pure-engine module `src/engine/career.ts` owns everything career: the expectation function (`teamStrength` → `expectedRank`, squad-strength rank within a division), the weekly career tick (`runCareerWeek`: AI sack checks, user confidence, sackings, job offers, poaching) wired into `advanceRound`, and the season-end verdict (`runCareerSeasonEnd`) wired into `newSeason`. State grows a `Manager` object (name, reputation, confidence, employed, hiredSeason, jobOffers), per-team `manager`/`managerHiredSeason` fields, and an `unemployedPool` of recycled names (save v7). `gameOver` is deleted: sackings flip `manager.employed` to false; the world keeps simulating while the user spectates, gated by a tiny `isManaged(state, teamId)` predicate in `types.ts` (cycle-free — every engine module can import it). AI managers are pure flavor: zero effect on match results. UI adds an UnemployedScreen, a ClubScreen (reachable from Table/Cup/News/Home clicks), a Home confidence meter and poach-offer panel, a Welcome name input, and a Saves rename field.

**Tech Stack:** Existing React 19 + TS strict + Vite + Vitest + Tailwind v4 kit + i18n. No new dependencies.

## Prerequisite

Phase 6.5 merged (174/174 green). The news pipeline (`pushNews`, `NewsType → TranslationKey` mapper, NewsRail, toast diff) is the substrate for all career news.

## Global Constraints

- Save schema becomes `version: 7`: `GameState` gains `manager: Manager` and `unemployedPool: string[]`, LOSES `gameOver`; `Team` gains `manager: string` and `managerHiredSeason: number`; `SeasonRecord` gains `club: string`. `migrateV6` fills all of it (generated names via the save's own seed; `employed: !s.gameOver` — a dead save comes back as an unemployed manager); terminal check moves to 7.
- AI managers are flavor only: no field of `Team.manager`/`managerHiredSeason` may influence `simulateMatch`, training, finances, or transfers.
- All career tuning constants live in `src/engine/career.ts` under one `// ponytail: career tuning` block: `CONFIDENCE_START = 60`, `REPUTATION_START = 30`, `POOL_CAP = 20`, `MAX_JOB_OFFERS = 3`, `JOB_OFFER_ROUNDS = 3`, `TAKEOVER_SQUAD = 16`, reputation deltas (title +10, promotion +8, cup +6, overperform +4, sacked −12), confidence verdicts (title +20, promotion +15, cup +15, relegation −25, flop −10, overperform +10), sack probabilities (weekly AI 8%, relegated 70%, season-end flop 40%).
- Honeymoon rule (user AND AI): a manager whose `hiredSeason` equals the current season takes no confidence losses, no season-end negatives, and (AI) cannot be sacked — one sacking per club per season falls out of this.
- League-wide squad floor: after every rollover, EVERY club has ≥ `MIN_SQUAD` (14) players (youth intake floor applies to all clubs, not just the user's).
- The financial rule is rerouted, not changed: 8 broke weeks still ends the job — as a sacking (`sackUser`), not a frozen game.
- News: five new types — `managerSacked`, `managerHired` (rival moves, user's-division filter like `rivalTransfer`), `userSacked`, `userHired`, `jobOffer`. Structured params only; engine purity rules hold (no i18n imports in `src/engine/`, seeded RNG only).
- `npm test` green after every task (174 + new); `npx tsc -b --force` clean; `npm run build` clean. Every new UI string in BOTH dictionaries (compile-enforced by the typed `Record<TranslationKey, string>`).
- UI: semantic tokens + kit components only. Club cash is never shown on the club page (the town's mood, not their books) — but job offers DO show the target club's cash/wages/loan (informed gamble).

## File Structure

- `src/engine/types.ts` — `Manager`, `JobOffer`, `isManaged`, `Team.manager(+HiredSeason)`, `SeasonRecord.club`, news types, `version: 7`, `gameOver` removed
- `src/engine/career.ts` (+ `career.test.ts`) — constants, `teamStrength`, `expectedRank`, `hireManager`, `sackAiManager`, `runCareerWeek`, `runCareerSeasonEnd`, `sackUser`, `acceptJob`, `declineOffer`, `renameManager`, `restructuredLoan`
- `src/engine/newGame.ts`, `save.ts` — v7 fields + `migrateV6`
- `src/engine/rollover.ts` — `makeRookie` extraction, league-wide youth floor, `seasonRecord().club`
- `src/engine/season.ts` — career wiring in `advanceRound`/`newSeason`, spectator gates
- `src/engine/finance.ts`, `transfers.ts` — spectator gates, `BROKE_ROUNDS_LIMIT` export
- `src/i18n/en.ts`, `pt.ts`, `news.ts` — new keys + mapper entries
- `src/ui/NewsRail.tsx` — icons/tones for new types, clickable club names
- `src/ui/toastEvents.ts` — `userSacked`/`userHired`/`jobOffer` toasts
- `src/ui/Shell.tsx` — nav filtering + footer while unemployed, `onShowClub` pass-through
- `src/screens/UnemployedScreen.tsx` (new), `ClubScreen.tsx` (new)
- `src/screens/HomeScreen.tsx` — confidence meter, poach panel, opponent → club page
- `src/screens/TableScreen.tsx`, `CupScreen.tsx` — club clicks
- `src/screens/WelcomeScreen.tsx`, `SavesScreen.tsx`, `HistoryScreen.tsx` — name input, rename, club column
- `src/App.tsx` — unemployment + club-page wiring, game-over screen deleted

---

### Task 1: Career state — types, isManaged, newGame v7, migration, gameOver removal

**Files:**
- Modify: `src/engine/types.ts`, `src/engine/newGame.ts`, `src/engine/save.ts`, `src/engine/finance.ts`, `src/engine/season.ts`, `src/engine/rollover.ts` (seasonRecord), `src/App.tsx`
- Test: `src/engine/save.test.ts`, `src/engine/newGame.test.ts`

**Interfaces:**
- Produces (`types.ts`):

```ts
export interface JobOffer {
  teamId: number
  roundsLeft: number // offer expires when this hits 0
}

export interface Manager {
  name: string
  reputation: number // 0-100, career-long, survives sackings
  confidence: number // 0-100, board patience with results; 0 = sacked
  employed: boolean // false = spectating, awaiting offers
  hiredSeason: number // season the current job started; === current season → honeymoon (gains only)
  jobOffers: JobOffer[] // job market (unemployed) or poach offers (employed)
}

// The one predicate for "does the user run this club" — lives here so every
// engine module can import it without cycles.
export function isManaged(state: GameState, teamId: number): boolean {
  return state.manager.employed && teamId === state.userTeamId
}
```

- `Team` gains `manager: string // AI manager name; for the user's club it is stale — render state.manager.name instead` and `managerHiredSeason: number // 0 = founding; === current season → immune from sacking`
- `SeasonRecord` gains `club: string // which club the manager ran that season ('—' if unemployed all season)`
- `GameState`: `version: 7`, gains `manager: Manager` and `unemployedPool: string[] // sacked AI names awaiting a bench, oldest dropped at POOL_CAP`, loses `gameOver`
- `NewsType` gains `| 'managerSacked' | 'managerHired' | 'userSacked' | 'userHired' | 'jobOffer'` (mapper/dict entries land in Task 3/6/7; the union goes in now so one types.ts edit serves all)
- `save.ts`: `migrateV6(s: any): GameState`; terminal check `version === 7`
- Behavior change carried by this task: with `gameOver` gone, nothing freezes the game — `advanceRound` always advances, and the broke-8 rule does NOTHING until Task 6 reroutes it to `sackUser`. `App.tsx` keeps its sacked screen temporarily, keyed off `!state.manager.employed` (reachable only via a migrated dead save until Task 6).

- [ ] **Step 1: Write the failing tests**

Add to `src/engine/newGame.test.ts`:

```ts
it('v7: every club has a manager, the user has a career, the pool starts empty', () => {
  const state = newGame(7)
  expect(state.version).toBe(7)
  for (const team of state.teams) {
    expect(team.manager).toMatch(/\w+ \w+/)
    expect(team.managerHiredSeason).toBe(0)
  }
  expect(state.manager).toMatchObject({ reputation: 30, confidence: 60, employed: true, hiredSeason: 0, jobOffers: [] })
  expect(state.manager.name).toMatch(/\w+ \w+/)
  expect(state.unemployedPool).toEqual([])
  expect('gameOver' in state).toBe(false)
})

it('v7: the user club draw is still the last thing the seed decides', () => {
  // same seed → identical world (teams, players, fixtures) regardless of which club the user got
  const a = newGame(42)
  const b = newGame(42)
  expect(a.userTeamId).toBe(b.userTeamId)
  expect(a.teams.map(t => t.manager)).toEqual(b.teams.map(t => t.manager))
})
```

Add to `src/engine/save.test.ts` (and update every existing migration test's terminal expectation from 6 to 7, extending `toMatchObject`s with the v7 fields):

```ts
it('migrates a v6 save to v7 with managers everywhere', () => {
  const storage = fakeStorage()
  const v6 = { ...JSON.parse(JSON.stringify(newGame(3))), version: 6, gameOver: false } as Record<string, unknown>
  delete v6.manager
  delete v6.unemployedPool
  ;(v6.teams as Record<string, unknown>[]).forEach(t => { delete t.manager; delete t.managerHiredSeason })
  storage.setItem('futscript-save', JSON.stringify(v6))
  const state = load(storage)!
  expect(state.version).toBe(7)
  expect(state.manager).toMatchObject({ reputation: 30, confidence: 60, employed: true, hiredSeason: 0, jobOffers: [] })
  expect(state.unemployedPool).toEqual([])
  for (const team of state.teams) expect(typeof team.manager).toBe('string')
  expect('gameOver' in state).toBe(false)
})

it('migrates a game-over v6 save into unemployment instead of a dead end', () => {
  const storage = fakeStorage()
  const v6 = { ...JSON.parse(JSON.stringify(newGame(3))), version: 6, gameOver: true } as Record<string, unknown>
  delete v6.manager
  storage.setItem('futscript-save', JSON.stringify(v6))
  expect(load(storage)!.manager.employed).toBe(false)
})

it('migration stamps old history rows with the current club', () => {
  const storage = fakeStorage()
  const base = newGame(3)
  const clubName = base.teams.find(t => t.id === base.userTeamId)!.name
  const v6 = {
    ...JSON.parse(JSON.stringify(base)), version: 6, gameOver: false,
    history: [{ season: 1, champions: ['X'], cupWinner: 'Y', topScorer: { player: 'P', team: 'T', goals: 9 }, userDivision: 3, userPosition: 4 }],
  } as Record<string, unknown>
  storage.setItem('futscript-save', JSON.stringify(v6))
  expect(load(storage)!.history[0].club).toBe(clubName)
})
```

- [ ] **Step 2: Run to verify failures** — `npx vitest run src/engine/newGame.test.ts src/engine/save.test.ts`

- [ ] **Step 3: Implement**

`types.ts`: the interfaces above; delete `gameOver` from `GameState`; bump `version: 7`; extend `NewsType`.

`newGame.ts`: in the team-creation loop add `manager: randomName(rand), managerHiredSeason: 0` to each `Team`. After `cupFixtures` and BEFORE the user-club draw (the file's comment demands the club draw stay the last rand consumption — keep it that way, and extend that comment to say the manager name draw must stay above):

```ts
const managerName = randomName(rand)
```

Return object: `version: 7`, drop `gameOver: false`, add:

```ts
manager: { name: managerName, reputation: 30, confidence: 60, employed: true, hiredSeason: 0, jobOffers: [] },
unemployedPool: [],
```

`save.ts`: import `mulberry32` from `./rng` and `randomName` from `./names`; chain `if (state?.version === 6) state = migrateV6(state)`; terminal `state?.version !== 7`:

```ts
function migrateV6(s: any): GameState {
  const rand = mulberry32(s.seed >>> 0 || 1) // deterministic names for a given save
  const { gameOver, ...rest } = s
  const clubName = s.teams.find((t: any) => t.id === s.userTeamId)?.name ?? '—'
  return {
    ...rest,
    version: 7,
    teams: s.teams.map((t: any) => ({ ...t, manager: randomName(rand), managerHiredSeason: 0 })),
    manager: {
      name: randomName(rand),
      reputation: 30,
      confidence: 60,
      employed: !gameOver, // a dead save comes back as an unemployed manager
      hiredSeason: 0,
      jobOffers: [],
    },
    unemployedPool: [],
    history: (s.history ?? []).map((h: any) => ({ ...h, club: h.club ?? clubName })),
  }
}
```

`finance.ts`: `runWeeklyFinances` result loses `gameOver: ...` (keep `brokeRounds` counting as-is for now); `borrow`/`repayLoan` guards change `state.gameOver` → `!state.manager.employed`.

`season.ts`: `advanceRound` first line becomes `if (state.round > totalRounds(state)) return state`; `newSeason` first line drops the `gameOver` check entirely.

`rollover.ts` `seasonRecord`: add to the returned object (import `isManaged` from `./types`):

```ts
club: isManaged(state, state.userTeamId) ? state.teams.find(t => t.id === state.userTeamId)!.name : '—',
```

`App.tsx`: replace `if (state.gameOver)` with `if (!state.manager.employed)` (same temporary sacked screen; Task 9 replaces it).

- [ ] **Step 4: Sweep the literals** — `grep -rn "gameOver\|version: 6" src/` and fix every remaining site (test fixtures constructing partial states, `FinanceScreen.test.ts` if it builds a state literal). Tests that asserted `gameOver` becoming true at 8 broke weeks: rewrite to assert `brokeRounds` reaches 8 and the state still advances (the sacking assertion returns in Task 6).

- [ ] **Step 5: Run all tests** — `npx vitest run` → green; `npx tsc -b --force` → clean.

- [ ] **Step 6: Commit** — `git commit -m "feat(career): v7 state — managers everywhere, gameOver removed"`

---

### Task 2: Expectation function, league-wide squad floor, makeRookie

**Files:**
- Create: `src/engine/career.ts`, `src/engine/career.test.ts`
- Modify: `src/engine/rollover.ts`, `src/engine/season.ts` (youthIntake call), `src/engine/rollover.test.ts`

**Interfaces:**
- Produces:
  - `career.ts`: `teamStrength(team: Team, players: Record<number, Player>): number` (sum of the 11 highest levels); `expectedRank(state: GameState, teamId: number): number` (1 = strongest squad in the division); `positionOf(state: GameState, teamId: number): number` (current table position, exported for tests)
  - `rollover.ts`: `makeRookie(rand: () => number, id: number): Player` (extracted from `youthIntake`'s inline rookie literal, reused by Task 7's takeover top-up); `youthIntake(players, teams, rand, idFloor?)` — the `userTeamId` param is GONE; every club gets `count = max(count, MIN_SQUAD - squadSize)`

- [ ] **Step 1: Write the failing tests**

`src/engine/career.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { expectedRank, teamStrength } from './career'
import { newGame } from './newGame'

describe('expectation', () => {
  it('teamStrength sums the best 11 levels only', () => {
    const state = newGame(1)
    const team = state.teams[0]
    const levels = team.playerIds.map(id => state.players[id].level).sort((a, b) => b - a)
    expect(teamStrength(team, state.players)).toBe(levels.slice(0, 11).reduce((s, l) => s + l, 0))
  })

  it('expectedRank orders a division by squad strength, 1 = strongest', () => {
    const state = newGame(2)
    const division = state.teams.find(t => t.id === state.userTeamId)!.division
    const clubs = state.teams.filter(t => t.division === division)
    const ranks = clubs.map(t => expectedRank(state, t.id))
    expect([...ranks].sort((a, b) => a - b)).toEqual(clubs.map((_, i) => i + 1)) // a permutation of 1..16
    const strongest = clubs.reduce((a, b) => (teamStrength(b, state.players) > teamStrength(a, state.players) ? b : a))
    expect(expectedRank(state, strongest.id)).toBe(1)
  })
})
```

Add to `src/engine/rollover.test.ts`:

```ts
it('youth intake floors EVERY club at MIN_SQUAD', () => {
  const state = newGame(5)
  const rand = mulberry32(9)
  const victim = state.teams.find(t => t.id !== state.userTeamId)!
  const keep = victim.playerIds.slice(0, 11)
  const players = Object.fromEntries(
    Object.values(state.players).filter(p => !victim.playerIds.includes(p.id) || keep.includes(p.id)).map(p => [p.id, p]),
  )
  const teams = state.teams.map(t => (t.id === victim.id ? { ...t, playerIds: keep, lineup: [] } : t))
  const out = youthIntake(players, teams, rand)
  expect(out.teams.find(t => t.id === victim.id)!.playerIds.length).toBeGreaterThanOrEqual(14)
})
```

Update the existing `youthIntake` tests to the new signature (drop the `userTeamId` argument).

- [ ] **Step 2: Run to verify failures** — `npx vitest run src/engine/career.test.ts src/engine/rollover.test.ts`

- [ ] **Step 3: Implement**

`career.ts` (module start — constants used by later tasks land here too):

```ts
import { standings } from './standings'
import type { GameState, Player, Team } from './types'

// ponytail: career tuning — retune here and nowhere else
export const CONFIDENCE_START = 60
export const REPUTATION_START = 30
export const POOL_CAP = 20
export const MAX_JOB_OFFERS = 3
export const JOB_OFFER_ROUNDS = 3
export const TAKEOVER_SQUAD = 16 // sellable headroom above MIN_SQUAD on day one

export function teamStrength(team: Team, players: Record<number, Player>): number {
  const levels = team.playerIds.map(id => players[id].level).sort((a, b) => b - a)
  return levels.slice(0, 11).reduce((sum, l) => sum + l, 0)
}

// 1 = strongest squad in the division: what the board expects the table to look like
export function expectedRank(state: GameState, teamId: number): number {
  const division = state.teams.find(t => t.id === teamId)!.division
  const ranked = state.teams
    .filter(t => t.division === division)
    .map(t => ({ id: t.id, strength: teamStrength(t, state.players) }))
    .sort((a, b) => b.strength - a.strength)
  return ranked.findIndex(r => r.id === teamId) + 1
}

export function positionOf(state: GameState, teamId: number): number {
  const division = state.teams.find(t => t.id === teamId)!.division
  return standings(state, division).findIndex(r => r.teamId === teamId) + 1
}
```

`rollover.ts`: extract the rookie literal out of `youthIntake` into an exported `makeRookie(rand, id): Player` (identical fields: age 16–18, level 22–45, `salaryFor(level)`, `contractSeasons: 3`); change `youthIntake` to:

```ts
export function youthIntake(
  players: Record<number, Player>,
  teams: Team[],
  rand: () => number,
  idFloor = 0,
): { players: Record<number, Player>; teams: Team[] } {
  const nextPlayers = { ...players }
  let nextId = nextFreeId(players, idFloor)
  const nextTeams = teams.map(team => {
    // every club is floored at MIN_SQUAD — an inheritable club can always field a team and still sell
    let count = team.playerIds.length >= 20 ? 0 : team.playerIds.length < 16 ? 2 : 1
    count = Math.max(count, MIN_SQUAD - team.playerIds.length)
    if (count === 0) return team
    const ids: number[] = []
    for (let i = 0; i < count; i++) {
      const rookie = makeRookie(rand, nextId++)
      nextPlayers[rookie.id] = rookie
      ids.push(rookie.id)
    }
    return { ...team, playerIds: [...team.playerIds, ...ids] }
  })
  return { players: nextPlayers, teams: nextTeams }
}
```

`season.ts` `newSeason`: the call becomes `youthIntake(players, teams, rand, idFloor)`.

- [ ] **Step 4: Run all tests** — `npx vitest run` → green.

- [ ] **Step 5: Commit** — `git commit -m "feat(career): expectation function and league-wide squad floor"`

---

### Task 3: AI manager carousel — weekly sackings, pool hiring, news

**Files:**
- Modify: `src/engine/career.ts`, `src/engine/season.ts`, `src/i18n/en.ts`, `src/i18n/pt.ts`, `src/i18n/news.ts`, `src/ui/NewsRail.tsx`
- Test: `src/engine/career.test.ts`

**Interfaces:**
- Produces (`career.ts`):
  - `hireManager(state, teamId, rand, week?): GameState` — 70% pool pick (removed from pool) else fresh `randomName`; sets `manager` + `managerHiredSeason: state.season`; `managerHired` news if the club is in the user's division
  - `sackAiManager(state, teamId, rand, week?): GameState` — old name → pool (capped `POOL_CAP`), `managerSacked` news (same filter), then `hireManager`
  - `runCareerWeek(state, rand): GameState` — this task: AI weekly sack sweep only (extended in Tasks 6/7). Wired into `advanceRound` after `tickConstruction`.
- Consumes: `expectedRank`, `positionOf` (Task 2), `pushNews`, `randomName`, `randInt`, `isManaged`.
- Tuning (add to the constants block): `AI_SACK_WEEKLY = 0.08`, `AI_SACK_FROM_WEEK = 8`, `AI_SACK_GAP = 5`, `POOL_HIRE_CHANCE = 0.7`.

- [ ] **Step 1: Write the failing tests**

Add to `src/engine/career.test.ts`:

```ts
import { hireManager, runCareerWeek, sackAiManager } from './career'
import { pushNews } from './news' // only if needed by helpers you add

const always = () => 0 // rand that always fires probabilistic gates and picks index 0
const never = () => 0.999999

describe('AI manager carousel', () => {
  it('sacking recycles the name through the pool into the next hire', () => {
    const state = newGame(11)
    const club = state.teams.find(t => t.id !== state.userTeamId)!
    const oldName = club.manager
    const sacked = sackAiManager(state, club.id, never) // never → fresh name, pool keeps oldName
    expect(sacked.unemployedPool).toContain(oldName)
    expect(sacked.teams.find(t => t.id === club.id)!.manager).not.toBe(oldName)
    expect(sacked.teams.find(t => t.id === club.id)!.managerHiredSeason).toBe(state.season)

    const other = state.teams.find(t => t.id !== state.userTeamId && t.id !== club.id)!
    const rehired = hireManager(sacked, other.id, always) // always → pool pick, index 0
    expect(rehired.teams.find(t => t.id === other.id)!.manager).toBe(oldName)
    expect(rehired.unemployedPool).not.toContain(oldName)
  })

  it('emits division-filtered news for sackings and hirings', () => {
    const state = newGame(11)
    const userDivision = state.teams.find(t => t.id === state.userTeamId)!.division
    const rival = state.teams.find(t => t.id !== state.userTeamId && t.division === userDivision)!
    const far = state.teams.find(t => t.division !== userDivision)!
    const a = sackAiManager(state, rival.id, never)
    expect(a.news.map(n => n.type)).toEqual(['managerSacked', 'managerHired'])
    const b = sackAiManager(state, far.id, never)
    expect(b.news).toHaveLength(0)
  })

  it('weekly sweep only fires on big underperformers past week 8, never twice a season', () => {
    let state = { ...newGame(11), round: 10 }
    // manufacture a flop: strongest squad in the user division, dead last on points
    // (simplest deterministic route: give one rival's players level 99 and zero points — but
    // with no fixtures played everyone is 0pts and position falls back to insertion order,
    // so instead assert the two hard gates directly:)
    const before = state.teams.map(t => t.manager)
    state = runCareerWeek({ ...state, round: 3 }, always) // before week 8 → untouched
    expect(state.teams.map(t => t.manager)).toEqual(before)

    const hiredNow = {
      ...newGame(11),
      round: 10,
      teams: newGame(11).teams.map(t => ({ ...t, managerHiredSeason: 1 })),
    }
    const after = runCareerWeek(hiredNow, always) // everyone hired this season → all immune
    expect(after.teams.map(t => t.manager)).toEqual(hiredNow.teams.map(t => t.manager))
  })

  it('a genuine flop gets sacked when the dice say so', () => {
    // strongest squad, bottom of the table: fabricate played fixtures where the rival lost every game
    const base = newGame(11)
    const userDivision = base.teams.find(t => t.id === base.userTeamId)!.division
    const rival = base.teams.find(t => t.id !== base.userTeamId && t.division === userDivision)!
    const players = { ...base.players }
    for (const id of rival.playerIds) players[id] = { ...players[id], level: 99 }
    const opponents = base.teams.filter(t => t.division === userDivision && t.id !== rival.id).slice(0, 10)
    const fixtures = opponents.map((opp, i) => ({
      round: i + 1, homeId: rival.id, awayId: opp.id, homeGoals: 0, awayGoals: 3,
    }))
    const state = { ...base, players, fixtures, round: 11 }
    const sacked = runCareerWeek(state, always)
    expect(sacked.teams.find(t => t.id === rival.id)!.manager).not.toBe(rival.manager)
    const spared = runCareerWeek(state, never)
    expect(spared.teams.find(t => t.id === rival.id)!.manager).toBe(rival.manager)
  })
})
```

- [ ] **Step 2: Run to verify failures** — `npx vitest run src/engine/career.test.ts`

- [ ] **Step 3: Implement**

`career.ts` additions:

```ts
import { pushNews } from './news'
import { randomName } from './names'
import { randInt } from './rng'
import { isManaged } from './types'

export const POOL_HIRE_CHANCE = 0.7
export const AI_SACK_WEEKLY = 0.08
export const AI_SACK_FROM_WEEK = 8
export const AI_SACK_GAP = 5

function userDivision(state: GameState): number {
  return state.teams.find(t => t.id === state.userTeamId)!.division
}

export function hireManager(state: GameState, teamId: number, rand: () => number, week?: number): GameState {
  const pool = [...state.unemployedPool]
  const fromPool = pool.length > 0 && rand() < POOL_HIRE_CHANCE
  const name = fromPool ? pool.splice(randInt(rand, 0, pool.length - 1), 1)[0] : randomName(rand)
  const club = state.teams.find(t => t.id === teamId)!
  let s: GameState = {
    ...state,
    unemployedPool: pool,
    teams: state.teams.map(t => (t.id === teamId ? { ...t, manager: name, managerHiredSeason: state.season } : t)),
  }
  if (club.division === userDivision(state)) s = pushNews(s, 'managerHired', { club: club.name, manager: name }, week)
  return s
}

export function sackAiManager(state: GameState, teamId: number, rand: () => number, week?: number): GameState {
  const club = state.teams.find(t => t.id === teamId)!
  let s = state
  if (club.division === userDivision(state)) s = pushNews(s, 'managerSacked', { club: club.name, manager: club.manager }, week)
  // hire BEFORE pooling the old name — a club must not rehire the manager it just sacked
  s = hireManager(s, teamId, rand, week)
  return { ...s, unemployedPool: [...s.unemployedPool, club.manager].slice(-POOL_CAP) }
}

function runAiSackings(state: GameState, rand: () => number): GameState {
  if (state.round < AI_SACK_FROM_WEEK) return state // early tables are noise
  let s = state
  for (const team of state.teams) {
    if (isManaged(s, team.id)) continue
    if (team.managerHiredSeason === s.season) continue // one sacking per club per season
    if (positionOf(s, team.id) - expectedRank(s, team.id) < AI_SACK_GAP) continue
    if (rand() < AI_SACK_WEEKLY) s = sackAiManager(s, team.id, rand)
  }
  return s
}

// The weekly career tick. Extended by later tasks (confidence, sackings, job market).
export function runCareerWeek(state: GameState, rand: () => number): GameState {
  return runAiSackings(state, rand)
}
```

`season.ts` `advanceRound`: after `s = tickConstruction(s)` add `s = runCareerWeek(s, rand)` (import from `./career`).

`en.ts`:

```ts
'news.managerSacked': '{club} part ways with manager {manager}',
'news.managerHired': '{manager} takes over at {club}',
```

`pt.ts`:

```ts
'news.managerSacked': '{club} demite o técnico {manager}',
'news.managerHired': '{manager} assume o comando do {club}',
```

`i18n/news.ts` `NEWS_KEYS`: add `managerSacked: 'news.managerSacked', managerHired: 'news.managerHired'` — plus placeholder entries for the three types added to the union in Task 1 (`userSacked: 'news.userSacked'`, `userHired: 'news.userHired'`, `jobOffer: 'news.jobOffer'`) and their dictionary keys now, so the typed `Record<NewsType, ...>` compiles (final copy below; Tasks 6/7 rely on them):

`en.ts`:

```ts
'news.userSacked': 'You have been sacked by {club}',
'news.userHired': 'You are the new manager of {club}',
'news.jobOffer': '{club} want you as their manager',
```

`pt.ts`:

```ts
'news.userSacked': 'Você foi demitido pelo {club}',
'news.userHired': 'Você é o novo técnico do {club}',
'news.jobOffer': 'O {club} quer você como técnico',
```

`NewsRail.tsx` `ICONS`: add `managerSacked: SquadIcon, managerHired: SquadIcon, userSacked: SquadIcon, userHired: SquadIcon, jobOffer: SquadIcon`. `toneOf`: `userSacked` → `'text-danger'`, `managerSacked` → keep `'text-ink'`.

- [ ] **Step 4: Run all tests** — `npx vitest run` → green; `npx tsc -b --force` → clean.

- [ ] **Step 5: Commit** — `git commit -m "feat(career): AI manager carousel with pool hiring and news"`

---

### Task 4: Season-end carousel + newSeason career threading

**Files:**
- Modify: `src/engine/career.ts`, `src/engine/season.ts`
- Test: `src/engine/career.test.ts`, `src/engine/season.test.ts`

**Interfaces:**
- Produces: `runCareerSeasonEnd(state: GameState, rand: () => number, week: number): GameState` — this task: AI season-end sackings (relegated 70%, flop 40%, honeymoon immune), news week-stamped at `week`. Extended in Task 6 with the user's verdict. `newSeason` calls it right after the champions/cup news block (pre-rollover standings still intact) and threads its result (`teams`, `manager`, `unemployedPool`, `news`) through the rest of the function.
- Tuning: `AI_SACK_RELEGATED = 0.7`, `AI_SACK_FLOP = 0.4`.

- [ ] **Step 1: Write the failing tests**

Add to `src/engine/career.test.ts`:

```ts
describe('season-end carousel', () => {
  // helper: a state where `rival` finished bottom of the user's division
  function bottomedOut(seed: number) {
    const base = newGame(seed)
    const userDivision = base.teams.find(t => t.id === base.userTeamId)!.division
    const rival = base.teams.find(t => t.id !== base.userTeamId && t.division === userDivision)!
    const opponents = base.teams.filter(t => t.division === userDivision && t.id !== rival.id)
    const fixtures = opponents.map((opp, i) => ({
      round: i + 1, homeId: rival.id, awayId: opp.id, homeGoals: 0, awayGoals: 3,
    }))
    return { state: { ...base, fixtures, round: 31 }, rival }
  }

  it('relegated clubs sack with high probability, week-stamped at season end', () => {
    const { state, rival } = bottomedOut(13)
    const out = runCareerSeasonEnd(state, always, 36)
    expect(out.teams.find(t => t.id === rival.id)!.manager).not.toBe(rival.manager)
    const item = out.news.find(n => n.type === 'managerSacked')!
    expect(item.week).toBe(36)
    expect(runCareerSeasonEnd(state, never, 36).teams.find(t => t.id === rival.id)!.manager).toBe(rival.manager)
  })

  it('a manager hired this season survives even relegation', () => {
    const { state, rival } = bottomedOut(13)
    const grace = {
      ...state,
      teams: state.teams.map(t => (t.id === rival.id ? { ...t, managerHiredSeason: state.season } : t)),
    }
    const out = runCareerSeasonEnd(grace, always, 36)
    expect(out.teams.find(t => t.id === rival.id)!.manager).toBe(rival.manager)
  })
})
```

Add to `src/engine/season.test.ts`:

```ts
it('newSeason carries career state through the rollover', () => {
  let state = newGame(17)
  while (state.round <= totalRounds(state)) state = advanceRound(state)
  const next = newSeason(state)
  expect(next.manager).toBeDefined()
  expect(next.unemployedPool).toBeDefined()
  expect(next.teams.every(t => typeof t.manager === 'string')).toBe(true)
  expect(next.history[next.history.length - 1].club).toBe(
    state.teams.find(t => t.id === state.userTeamId)!.name,
  )
})
```

- [ ] **Step 2: Run to verify failures** — `npx vitest run src/engine/career.test.ts src/engine/season.test.ts`

- [ ] **Step 3: Implement**

`career.ts`:

```ts
export const AI_SACK_RELEGATED = 0.7
export const AI_SACK_FLOP = 0.4

export function runCareerSeasonEnd(state: GameState, rand: () => number, week: number): GameState {
  let s = state
  for (const team of state.teams) {
    if (isManaged(s, team.id)) continue
    if (team.managerHiredSeason === s.season) continue
    const pos = positionOf(s, team.id)
    const size = s.teams.filter(t => t.division === team.division).length
    const relegated = team.division < 3 && pos > size - 3
    const flop = pos - expectedRank(s, team.id) >= AI_SACK_GAP
    const p = relegated ? AI_SACK_RELEGATED : flop ? AI_SACK_FLOP : 0
    if (p > 0 && rand() < p) s = sackAiManager(s, team.id, rand, week)
  }
  return s
}
```

`season.ts` `newSeason`: after the cup-winner news block (still before prize money), add:

```ts
const careered = runCareerSeasonEnd(newsAcc, rand, seasonEnd)
```

Then: `let teams = careered.teams` (was `state.teams`), and every later `pushNews(newsAcc, ...)` accumulation for promotion/relegation switches its base from `newsAcc` to a `let` threading of `careered` (rename the accumulator: `let storyAcc = careered`, promotion/relegation pushes go through `storyAcc`). The final return adds:

```ts
manager: storyAcc.manager,
unemployedPool: storyAcc.unemployedPool,
news: storyAcc.news,
```

(`seasonRecord(state)` stays computed from the pre-career `state` — the verdict is about the season just played.)

- [ ] **Step 4: Run all tests** — `npx vitest run` → green.

- [ ] **Step 5: Commit** — `git commit -m "feat(career): season-end sackings threaded through rollover"`

---

### Task 5: Spectator gates — the engine treats an unmanaged club as AI

**Files:**
- Modify: `src/engine/season.ts`, `src/engine/finance.ts`, `src/engine/transfers.ts`
- Test: `src/engine/season.test.ts`

**Interfaces:**
- Consumes: `isManaged` from `./types`.
- Behavior contract (binding): while `manager.employed === false` —
  - the old club's lineup is `autoPick`ed, it never hosts friendlies, and it participates in AI listing/bidding like any club;
  - no ledger entries accrue, `brokeRounds` stays 0, no deposit/loan/overdraft lines;
  - no incoming offers are generated, no `userSigned`/`userSold`/`starterInjured`/`boardWarning` news (its transfers surface as `rivalTransfer` when the division filter passes);
  - at rollover the old club's expiring contracts auto-renew like any AI club;
  - the world otherwise advances normally (matches, cup, market, carousel).

- [ ] **Step 1: Write the failing test**

Add to `src/engine/season.test.ts`:

```ts
it('an unemployed manager spectates: world advances, old club runs itself', () => {
  const base = newGame(23)
  const state = { ...base, manager: { ...base.manager, employed: false } }
  let s = state
  for (let i = 0; i < 8; i++) s = advanceRound(s)
  expect(s.round).toBe(9) // the world kept moving
  expect(s.finances).toEqual([]) // no ledger for a club you don't run
  expect(s.brokeRounds).toBe(0)
  expect(s.incomingOffers).toEqual([])
  const badTypes = ['userSigned', 'userSold', 'starterInjured', 'boardWarning', 'offerReceived']
  expect(s.news.filter(n => badTypes.includes(n.type))).toEqual([])
})

it('at rollover an unmanaged club auto-renews its expiring contracts', () => {
  let state = newGame(29)
  state = { ...state, manager: { ...state.manager, employed: false } }
  const user = state.teams.find(t => t.id === state.userTeamId)!
  const players = { ...state.players }
  for (const id of user.playerIds) players[id] = { ...players[id], contractSeasons: 1 }
  state = { ...state, players, round: totalRounds(state) + 1 }
  const next = newSeason(state)
  const after = next.teams.find(t => t.id === state.userTeamId)!
  // retirees may still leave, but nobody walks over an expired deal: survivors are all renewed
  expect(after.playerIds.length).toBeGreaterThanOrEqual(14)
  for (const id of after.playerIds) expect(next.players[id].contractSeasons).toBeGreaterThanOrEqual(1)
})
```

- [ ] **Step 2: Run to verify failures** — `npx vitest run src/engine/season.test.ts`

- [ ] **Step 3: Implement** (every site is a one-line predicate swap; import `isManaged` from `./types` where missing)

`season.ts` `advanceRound`:
- friendly gate: `if (state.manager.employed && state.playFriendlies && ...)`
- lineups: `isManaged(state, t.id) ? patchLineup(...) : autoPick(...)`
- the `starterInjured` news loop: wrap in `if (state.manager.employed) { ... }`

`season.ts` `newSeason` contracts block — gate on `careered` (Task 4's post-verdict state), NOT `state`: a user sacked at the season-end verdict must have their old club auto-renew like any AI club:
- `const expiring = careered.manager.employed ? userTeamNow.playerIds.filter(...) : []` (unemployed → nothing walks)
- renewal condition: `} else if (!isManaged(careered, team.id) || forceRenewed.has(id)) {`

`finance.ts` `runWeeklyFinances`:
- `const user = state.manager.employed && team.id === state.userTeamId` (inline — finance must not import career)
- broke counting: `const brokeRounds = state.manager.employed && cashAfter < 0 ? state.brokeRounds + 1 : 0`

`transfers.ts` `runTransfers`:
- incoming-offer block gate: `if (s.manager.employed && rand() < 0.15) {`
- AI listing skip: `if (isManaged(s, team.id) || team.playerIds.length <= MIN_SQUAD) continue`
- AI bidding skip: `if (isManaged(s, team.id)) continue`

`transfers.ts` `transferPlayer` news gates: `if (isManaged(state, from.id))` → `userSold`; `else if (isManaged(state, toTeamId))` → `userSigned`; the ledger writes get the same guards (`if (isManaged(state, from.id)) finances = userLedger(...)` etc.).

- [ ] **Step 4: Run all tests** — `npx vitest run` → green.

- [ ] **Step 5: Commit** — `git commit -m "feat(career): spectator gates — unmanaged club runs as AI"`

---

### Task 6: Board confidence, the user's sackings, reputation verdicts

**Files:**
- Modify: `src/engine/career.ts`, `src/engine/finance.ts` (export `BROKE_ROUNDS_LIMIT`), `src/ui/toastEvents.ts`
- Test: `src/engine/career.test.ts`

**Interfaces:**
- Produces (`career.ts`):
  - `sackUser(state, rand, week?): GameState` — `userSacked` news, `employed: false`, reputation −12 (floor 0), `jobOffers: []`, `loanBalance: 0` (the debt stays with the club's board), `brokeRounds: 0`, `construction: null` (an in-flight expansion is abandoned with the job), old club hires from the pool
  - `runCareerWeek` extended: when employed — weekly confidence update (from week 4; gap-scaled; relegation-zone sting; honeymoon = gains only), then sack when `confidence <= 0` OR `brokeRounds >= BROKE_ROUNDS_LIMIT`
  - `runCareerSeasonEnd` extended: user verdict — confidence title +20 / promotion +15 / cup +15 / relegation −25 / gap ≤ −5 → −10 / gap ≥ +3 → +10; reputation title +10 / promotion +8 / cup +6 / gap ≥ +3 → +4; honeymoon drops the negatives; confidence 0 at season end → `sackUser`
- Consumes: `BROKE_ROUNDS_LIMIT` (newly exported from `finance.ts`), `cupWinner` from `./cup`.
- Tuning: `CONFIDENCE_FROM_WEEK = 4`, weekly deltas `+2/+1/0/−1/−2/−3` at gaps `≥3/≥1/else/≤−1/≤−3/≤−5`, relegation-zone extra −1.

- [ ] **Step 1: Write the failing tests**

Add to `src/engine/career.test.ts`:

```ts
import { runCareerSeasonEnd, sackUser } from './career'
import { BROKE_ROUNDS_LIMIT } from './finance'

// helper: user club with fabricated results (wins > 0 → won every game, else lost every game)
function userSeason(seed: number, wins: boolean, games = 10) {
  const base = newGame(seed)
  const user = base.teams.find(t => t.id === base.userTeamId)!
  const opponents = base.teams.filter(t => t.division === user.division && t.id !== user.id).slice(0, games)
  const fixtures = opponents.map((opp, i) => ({
    round: i + 1, homeId: user.id, awayId: opp.id,
    homeGoals: wins ? 3 : 0, awayGoals: wins ? 0 : 3,
  }))
  return { ...base, fixtures, round: games + 1 }
}

describe('board confidence', () => {
  it('drains when a strong squad sits low, fills when it flies', () => {
    const losing = userSeason(31, false)
    const strongUser = {
      ...losing,
      players: Object.fromEntries(Object.values(losing.players).map(p => [p.id,
        losing.teams.find(t => t.id === losing.userTeamId)!.playerIds.includes(p.id) ? { ...p, level: 99 } : p])),
    }
    const drained = runCareerWeek(strongUser, never)
    expect(drained.manager.confidence).toBeLessThan(60)

    const winning = userSeason(31, true)
    const filled = runCareerWeek(winning, never)
    expect(filled.manager.confidence).toBeGreaterThanOrEqual(60)
  })

  it('honeymoon: confidence never falls in the arrival season', () => {
    const losing = userSeason(31, false)
    const grace = { ...losing, manager: { ...losing.manager, hiredSeason: losing.season } }
    expect(runCareerWeek(grace, never).manager.confidence).toBe(60)
  })

  it('confidence 0 → sacked; reputation takes the hit; old club rehires', () => {
    const losing = userSeason(31, false)
    const doomed = { ...losing, manager: { ...losing.manager, confidence: 1 } }
    const strongDoomed = {
      ...doomed,
      players: Object.fromEntries(Object.values(doomed.players).map(p => [p.id,
        doomed.teams.find(t => t.id === doomed.userTeamId)!.playerIds.includes(p.id) ? { ...p, level: 99 } : p])),
    }
    const out = runCareerWeek(strongDoomed, never)
    expect(out.manager.employed).toBe(false)
    expect(out.manager.reputation).toBe(30 - 12)
    expect(out.news.some(n => n.type === 'userSacked')).toBe(true)
    expect(out.teams.find(t => t.id === out.userTeamId)!.managerHiredSeason).toBe(out.season)
    expect(out.loanBalance).toBe(0)
  })

  it('8 broke weeks is a sacking, not a frozen game', () => {
    const state = userSeason(37, true)
    const broke = { ...state, brokeRounds: BROKE_ROUNDS_LIMIT }
    const out = runCareerWeek(broke, never)
    expect(out.manager.employed).toBe(false)
  })
})

describe('season verdict', () => {
  it('champions gain confidence and reputation', () => {
    const winning = userSeason(41, true, 15)
    const out = runCareerSeasonEnd(winning, never, 36)
    expect(out.manager.confidence).toBeGreaterThan(60)
    expect(out.manager.reputation).toBeGreaterThan(30)
  })

  it('a relegation-grade flop drains hard — but not in the honeymoon', () => {
    const losing = userSeason(41, false, 15)
    const strong = {
      ...losing,
      players: Object.fromEntries(Object.values(losing.players).map(p => [p.id,
        losing.teams.find(t => t.id === losing.userTeamId)!.playerIds.includes(p.id) ? { ...p, level: 99 } : p])),
    }
    const judged = runCareerSeasonEnd(strong, never, 36)
    expect(judged.manager.confidence).toBeLessThan(60)
    const grace = { ...strong, manager: { ...strong.manager, hiredSeason: strong.season } }
    expect(runCareerSeasonEnd(grace, never, 36).manager.confidence).toBe(60)
  })
})
```

Note: `newGame` puts the user in Division 3 (no relegation there), so the weekly relegation-zone sting and the −25 relegation verdict are covered indirectly by the delta assertions; the exact constants live in one block and the formulas below are the source of truth.

- [ ] **Step 2: Run to verify failures** — `npx vitest run src/engine/career.test.ts`

- [ ] **Step 3: Implement**

`finance.ts`: change `const BROKE_ROUNDS_LIMIT = 8` to `export const BROKE_ROUNDS_LIMIT = 8`.

`career.ts`:

```ts
import { BROKE_ROUNDS_LIMIT } from './finance'
import { cupWinner } from './cup'

export const CONFIDENCE_FROM_WEEK = 4
export const REP_SACKED = -12
export const REP_TITLE = 10
export const REP_PROMOTION = 8
export const REP_CUP = 6
export const REP_OVERPERFORM = 4

const clamp = (n: number) => Math.max(0, Math.min(100, n))

function weeklyDelta(gap: number): number {
  if (gap >= 3) return 2
  if (gap >= 1) return 1
  if (gap <= -5) return -3
  if (gap <= -3) return -2
  if (gap <= -1) return -1
  return 0
}

function updateConfidence(state: GameState): GameState {
  if (state.round < CONFIDENCE_FROM_WEEK) return state // early tables are noise
  const pos = positionOf(state, state.userTeamId)
  const division = userDivision(state)
  const size = state.teams.filter(t => t.division === division).length
  let delta = weeklyDelta(expectedRank(state, state.userTeamId) - pos)
  if (division < 3 && pos > size - 3) delta -= 1 // the drop zone stings extra
  if (state.manager.hiredSeason === state.season) delta = Math.max(0, delta) // honeymoon: gains only
  return { ...state, manager: { ...state.manager, confidence: clamp(state.manager.confidence + delta) } }
}

export function sackUser(state: GameState, rand: () => number, week?: number): GameState {
  const club = state.teams.find(t => t.id === state.userTeamId)!
  let s = pushNews(state, 'userSacked', { club: club.name }, week)
  s = {
    ...s,
    manager: {
      ...s.manager,
      employed: false,
      reputation: clamp(s.manager.reputation + REP_SACKED),
      jobOffers: [],
    },
    loanBalance: 0, // the debt stays with the club's board, not the manager
    brokeRounds: 0,
    construction: null, // ponytail: an in-flight expansion is abandoned with the job
  }
  return hireManager(s, s.userTeamId, rand, week)
}
```

`runCareerWeek` becomes:

```ts
export function runCareerWeek(state: GameState, rand: () => number): GameState {
  let s = runAiSackings(state, rand)
  if (!s.manager.employed) return s
  s = updateConfidence(s)
  if (s.manager.confidence <= 0 || s.brokeRounds >= BROKE_ROUNDS_LIMIT) return sackUser(s, rand)
  return s
}
```

`runCareerSeasonEnd`: after the AI loop, add the user verdict:

```ts
if (!s.manager.employed) return s
const user = s.teams.find(t => t.id === s.userTeamId)!
const pos = positionOf(s, s.userTeamId)
const size = s.teams.filter(t => t.division === user.division).length
const gap = expectedRank(s, s.userTeamId) - pos
const honeymoon = s.manager.hiredSeason === s.season
let conf = 0
let rep = 0
if (pos === 1 && user.division === 1) { conf += 20; rep += REP_TITLE }
if (user.division > 1 && pos <= 3) { conf += 15; rep += REP_PROMOTION }
if (cupWinner(s) === s.userTeamId) { conf += 15; rep += REP_CUP }
if (gap >= 3) { conf += 10; rep += REP_OVERPERFORM }
if (!honeymoon) {
  if (user.division < 3 && pos > size - 3) conf -= 25 // relegation
  else if (gap <= -5) conf -= 10 // flop
}
s = {
  ...s,
  manager: {
    ...s.manager,
    confidence: clamp(s.manager.confidence + conf),
    reputation: clamp(s.manager.reputation + rep),
  },
}
if (s.manager.confidence <= 0) s = sackUser(s, rand, week)
return s
```

`toastEvents.ts` `TOASTABLE`: add `userSacked: 'danger'`.

- [ ] **Step 4: Run all tests** — `npx vitest run` → green.

- [ ] **Step 5: Commit** — `git commit -m "feat(career): board confidence, sackings, reputation verdicts"`

---

### Task 7: Job market — offers, poaching, takeover package

**Files:**
- Modify: `src/engine/career.ts`, `src/ui/toastEvents.ts`
- Test: `src/engine/career.test.ts`

**Interfaces:**
- Produces (`career.ts`):
  - `restructuredLoan(team: Team): number` — `min(max(0, -team.cash), LOAN_CAP)`; used by `acceptJob` AND the offer UI preview
  - `declineOffer(state, teamId): GameState` — drops the offer, no penalty
  - `renameManager(state, name): GameState` — trims; ignores empty
  - `acceptJob(state, teamId): GameState` — NO rand param: derives `mulberry32(state.rngState)` internally and re-captures `rngState` (UI actions stay deterministic-from-state). Does, in order: no-op unless the offer exists; if employed, old club hires from pool; incumbent at target → pool + `managerSacked` news; `userTeamId` switch; target gets `manager: state.manager.name`, `managerHiredSeason: season`; debt restructure (cash floored at 0, `loanBalance = restructuredLoan`, beyond-cap written off); `brokeRounds: 0`, `incomingOffers: []`, `finances: []` (fresh ledger for the new club), `construction: null`; manager `employed: true, confidence: CONFIDENCE_START, hiredSeason: season, jobOffers: []`; academy top-up to `TAKEOVER_SQUAD` via `makeRookie`; `userHired` news
  - `runCareerWeek` extended: offers age first (`roundsLeft − 1`, drop ≤ 0); unemployed → `generateJobOffers` (reputation-tiered divisions: ≥65 → 1/2/3, ≥45 → 2/3, else 3; 40%/week; max 3; bottom-half clubs preferred; `jobOffer` news); employed → `maybePoach` (division above only, gap ≥ 3, week ≥ 8, 3%/week, only when no offer pending)
  - `runCareerSeasonEnd` extended: employed + gap ≥ 3 + division > 1 → 50% poach offer, week-stamped
- Tuning: `JOB_OFFER_CHANCE = 0.4`, `POACH_WEEKLY = 0.03`, `POACH_SEASON_END = 0.5`, `REP_D1 = 65`, `REP_D2 = 45`.

- [ ] **Step 1: Write the failing tests**

Add to `src/engine/career.test.ts`:

```ts
import { acceptJob, declineOffer, renameManager, restructuredLoan } from './career'
import { LOAN_CAP } from './finance'
import { MIN_SQUAD } from './transfers'

function unemployed(seed: number) {
  const base = newGame(seed)
  return { ...base, manager: { ...base.manager, employed: false } }
}

describe('job market', () => {
  it('offers arrive reputation-tiered and age out', () => {
    const low = { ...unemployed(43), round: 5 }
    const out = runCareerWeek(low, always) // always → offer fires, rep 30 → Division 3 only
    expect(out.manager.jobOffers).toHaveLength(1)
    const club = out.teams.find(t => t.id === out.manager.jobOffers[0].teamId)!
    expect(club.division).toBe(3)
    expect(out.news.some(n => n.type === 'jobOffer')).toBe(true)

    let aging = out
    for (let i = 0; i < JOB_OFFER_ROUNDS; i++) {
      aging = runCareerWeek({ ...aging, manager: { ...aging.manager, jobOffers: aging.manager.jobOffers.slice(0, 1) } }, never)
    }
    expect(aging.manager.jobOffers).toHaveLength(0)

    const famous = { ...unemployed(43), round: 5, manager: { ...unemployed(43).manager, employed: false, reputation: 80 } }
    const rich = runCareerWeek(famous, always)
    expect([1, 2, 3]).toContain(rich.teams.find(t => t.id === rich.manager.jobOffers[0].teamId)!.division)
  })

  it('acceptJob: restructure, top-up, incumbent to pool, honeymoon on', () => {
    const state = unemployed(47)
    const target = state.teams.find(t => t.id !== state.userTeamId)!
    const broke = {
      ...state,
      teams: state.teams.map(t => (t.id === target.id ? { ...t, cash: -3_000_000, playerIds: t.playerIds.slice(0, MIN_SQUAD) } : t)),
      manager: { ...state.manager, employed: false, jobOffers: [{ teamId: target.id, roundsLeft: 3 }] },
    }
    const out = acceptJob(broke, target.id)
    expect(out.userTeamId).toBe(target.id)
    expect(out.manager).toMatchObject({ employed: true, confidence: 60, hiredSeason: broke.season })
    const club = out.teams.find(t => t.id === target.id)!
    expect(club.cash).toBe(0)
    expect(out.loanBalance).toBe(LOAN_CAP) // 3M debt: 2M loan, 1M written off
    expect(club.playerIds.length).toBe(16) // academy top-up to sellable headroom
    expect(club.manager).toBe(out.manager.name)
    expect(out.unemployedPool).toContain(target.manager)
    expect(out.incomingOffers).toEqual([])
    expect(out.finances).toEqual([])
    expect(out.news.some(n => n.type === 'userHired')).toBe(true)
    expect(out.rngState).not.toBe(broke.rngState) // UI action recaptures the stream
  })

  it('restructuredLoan previews the takeover debt', () => {
    const t = newGame(1).teams[0]
    expect(restructuredLoan({ ...t, cash: 500_000 })).toBe(0)
    expect(restructuredLoan({ ...t, cash: -700_000 })).toBe(700_000)
    expect(restructuredLoan({ ...t, cash: -9_000_000 })).toBe(LOAN_CAP)
  })

  it('decline and rename are safe no-ops on bad input', () => {
    const state = unemployed(53)
    const withOffer = { ...state, manager: { ...state.manager, jobOffers: [{ teamId: 3, roundsLeft: 2 }] } }
    expect(declineOffer(withOffer, 3).manager.jobOffers).toEqual([])
    expect(renameManager(state, '  ').manager.name).toBe(state.manager.name)
    expect(renameManager(state, ' Zé Mão de Onça ').manager.name).toBe('Zé Mão de Onça')
    expect(acceptJob(state, 999)).toBe(state) // no such offer
  })

  it('poaching while employed: division above, overperformers only', () => {
    // user overperforming in Division 3 → poach offer can only come from Division 2
    const base = newGame(59)
    const user = base.teams.find(t => t.id === base.userTeamId)!
    const opponents = base.teams.filter(t => t.division === user.division && t.id !== user.id).slice(0, 10)
    const fixtures = opponents.map((opp, i) => ({
      round: i + 1, homeId: user.id, awayId: opp.id, homeGoals: 3, awayGoals: 0,
    }))
    const flying = { ...base, fixtures, round: 11 }
    const out = runCareerWeek(flying, always)
    if (out.manager.jobOffers.length > 0) {
      expect(out.teams.find(t => t.id === out.manager.jobOffers[0].teamId)!.division).toBe(user.division - 1)
    }
    // season end fires more reliably
    const seasonOut = runCareerSeasonEnd(flying, always, 36)
    expect(seasonOut.manager.jobOffers.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run to verify failures** — `npx vitest run src/engine/career.test.ts`

- [ ] **Step 3: Implement**

`career.ts` additions:

```ts
import { LOAN_CAP } from './finance'
import { makeRookie } from './rollover'
import { mulberry32 } from './rng'

export const JOB_OFFER_CHANCE = 0.4
export const POACH_WEEKLY = 0.03
export const POACH_SEASON_END = 0.5
export const REP_D1 = 65
export const REP_D2 = 45

export function restructuredLoan(team: Team): number {
  return Math.min(Math.max(0, -team.cash), LOAN_CAP)
}

function ageJobOffers(state: GameState): GameState {
  if (state.manager.jobOffers.length === 0) return state
  const jobOffers = state.manager.jobOffers
    .map(o => ({ ...o, roundsLeft: o.roundsLeft - 1 }))
    .filter(o => o.roundsLeft > 0)
  return { ...state, manager: { ...state.manager, jobOffers } }
}

function pushJobOffer(state: GameState, teamId: number, week?: number): GameState {
  const club = state.teams.find(t => t.id === teamId)!
  const next: GameState = {
    ...state,
    manager: { ...state.manager, jobOffers: [...state.manager.jobOffers, { teamId, roundsLeft: JOB_OFFER_ROUNDS }] },
  }
  return pushNews(next, 'jobOffer', { club: club.name }, week)
}

function generateJobOffers(state: GameState, rand: () => number): GameState {
  if (state.manager.jobOffers.length >= MAX_JOB_OFFERS || rand() >= JOB_OFFER_CHANCE) return state
  const rep = state.manager.reputation
  const divisions = rep >= REP_D1 ? [1, 2, 3] : rep >= REP_D2 ? [2, 3] : [3]
  const offering = new Set(state.manager.jobOffers.map(o => o.teamId))
  const candidates = state.teams.filter(
    t => divisions.includes(t.division) && t.id !== state.userTeamId && !offering.has(t.id),
  )
  // strugglers are where jobs open up
  const size = 16
  const strugglers = candidates.filter(t => positionOf(state, t.id) > size / 2)
  const from = strugglers.length > 0 ? strugglers : candidates
  if (from.length === 0) return state
  return pushJobOffer(state, from[randInt(rand, 0, from.length - 1)].id)
}

function maybePoach(state: GameState, rand: () => number): GameState {
  const division = userDivision(state)
  // ponytail: poaching only reaches down from the division above — D1 benches don't get poached
  if (division === 1 || state.round < AI_SACK_FROM_WEEK) return state
  if (state.manager.jobOffers.length > 0) return state
  if (expectedRank(state, state.userTeamId) - positionOf(state, state.userTeamId) < 3) return state
  if (rand() >= POACH_WEEKLY) return state
  const richer = state.teams.filter(t => t.division === division - 1)
  return pushJobOffer(state, richer[randInt(rand, 0, richer.length - 1)].id)
}

export function declineOffer(state: GameState, teamId: number): GameState {
  return {
    ...state,
    manager: { ...state.manager, jobOffers: state.manager.jobOffers.filter(o => o.teamId !== teamId) },
  }
}

export function renameManager(state: GameState, name: string): GameState {
  const trimmed = name.trim()
  return trimmed ? { ...state, manager: { ...state.manager, name: trimmed } } : state
}

function topUpSquad(state: GameState, teamId: number, rand: () => number): GameState {
  const team = state.teams.find(t => t.id === teamId)!
  const need = TAKEOVER_SQUAD - team.playerIds.length
  if (need <= 0) return state
  const players = { ...state.players }
  let nextId = Math.max(0, ...Object.keys(players).map(Number)) + 1
  const ids: number[] = []
  for (let i = 0; i < need; i++) {
    const rookie = makeRookie(rand, nextId++)
    players[rookie.id] = rookie
    ids.push(rookie.id)
  }
  return {
    ...state,
    players,
    teams: state.teams.map(t => (t.id === teamId ? { ...t, playerIds: [...t.playerIds, ...ids] } : t)),
  }
}

// A UI action: derives its own rand from rngState and re-captures it, so the
// result is deterministic from the save and the weekly stream is not reused.
export function acceptJob(state: GameState, teamId: number): GameState {
  if (!state.manager.jobOffers.some(o => o.teamId === teamId)) return state
  const rand = mulberry32(state.rngState)
  let s = state
  if (s.manager.employed) s = hireManager(s, s.userTeamId, rand) // the old bench gets a new face
  const target = s.teams.find(t => t.id === teamId)!
  s = { ...s, unemployedPool: [...s.unemployedPool, target.manager].slice(-POOL_CAP) }
  s = { ...s, userTeamId: teamId } // from here "user division" means the new club (news filters)
  s = pushNews(s, 'managerSacked', { club: target.name, manager: target.manager })
  const debt = restructuredLoan(target)
  s = {
    ...s,
    teams: s.teams.map(t =>
      t.id === teamId
        ? { ...t, manager: s.manager.name, managerHiredSeason: s.season, cash: Math.max(0, t.cash) }
        : t,
    ),
    loanBalance: debt, // the board restructures: overdraft becomes a loan, the rest written off
    brokeRounds: 0,
    incomingOffers: [],
    finances: [], // fresh ledger for the new club
    construction: null,
    manager: {
      ...s.manager,
      employed: true,
      confidence: CONFIDENCE_START,
      hiredSeason: s.season,
      jobOffers: [],
    },
  }
  s = topUpSquad(s, teamId, rand)
  s = pushNews(s, 'userHired', { club: target.name, manager: s.manager.name })
  return { ...s, rngState: randInt(rand, 1, 2 ** 31 - 1) }
}
```

`runCareerWeek` final shape:

```ts
export function runCareerWeek(state: GameState, rand: () => number): GameState {
  let s = ageJobOffers(state)
  s = runAiSackings(s, rand)
  if (!s.manager.employed) return generateJobOffers(s, rand)
  s = updateConfidence(s)
  if (s.manager.confidence <= 0 || s.brokeRounds >= BROKE_ROUNDS_LIMIT) return sackUser(s, rand)
  return maybePoach(s, rand)
}
```

`runCareerSeasonEnd`: after the user verdict (only when still employed), add:

```ts
if (s.manager.employed && gap >= 3 && user.division > 1 && rand() < POACH_SEASON_END) {
  const richer = s.teams.filter(t => t.division === user.division - 1)
  s = pushJobOffer(s, richer[randInt(rand, 0, richer.length - 1)].id, week)
}
```

`toastEvents.ts` `TOASTABLE`: add `userHired: 'accent', jobOffer: 'accent'`.

- [ ] **Step 4: Run all tests** — `npx vitest run` → green; `npx tsc -b --force`.

- [ ] **Step 5: Commit** — `git commit -m "feat(career): job market — offers, poaching, takeover package"`

---

### Task 8: UI — Home confidence meter + poach-offer panel

**Files:**
- Modify: `src/screens/HomeScreen.tsx`, `src/i18n/en.ts`, `src/i18n/pt.ts`

**Interfaces:**
- Consumes: `state.manager.confidence`, `state.manager.jobOffers`, `acceptJob`, `declineOffer`, `restructuredLoan`, `wageBill`.
- HomeScreen Props gain `setState: Dispatch<SetStateAction<GameState>>` (App already holds it; pass it through).

- [ ] **Step 1: Add the dictionary keys**

`en.ts`:

```ts
'home.boardConfidence': 'Board confidence',
'home.confidenceAttention': 'The board is uneasy — confidence {n}/100',
'home.poachPanel': 'They want you',
'home.poachOffer': '{club} (Division {division}) want you as their manager',
'home.poachDetails': 'Cash {cash} · Wages {wages}/wk · Loan after takeover {loan}',
'home.poachAccept': 'Take the job',
'home.poachDecline': 'Decline',
```

`pt.ts`:

```ts
'home.boardConfidence': 'Confiança da diretoria',
'home.confidenceAttention': 'A diretoria está inquieta — confiança {n}/100',
'home.poachPanel': 'Querem você',
'home.poachOffer': 'O {club} (Divisão {division}) quer você como técnico',
'home.poachDetails': 'Caixa {cash} · Salários {wages}/sem · Empréstimo após assumir {loan}',
'home.poachAccept': 'Aceitar o cargo',
'home.poachDecline': 'Recusar',
```

- [ ] **Step 2: Implement**

`HomeScreen.tsx`:
- Props: add `setState: Dispatch<SetStateAction<GameState>>`; App passes `setState={setState}`.
- In the Club panel, directly below the fan-mood row, add a confidence row (same meter pattern, warn color when low):

```tsx
<div className="flex items-center justify-between">
  <span className="text-ink-muted">{t('home.boardConfidence')}</span>
  <div className="flex items-center gap-2">
    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-rule">
      <div
        className={`h-full ${state.manager.confidence < 25 ? 'bg-danger' : state.manager.confidence < 45 ? 'bg-warn' : 'bg-accent'}`}
        style={{ width: `${state.manager.confidence}%` }}
      />
    </div>
    <span className="font-mono text-xs tabular-nums">{state.manager.confidence}</span>
  </div>
</div>
```

- Attention items: add before the cup item:

```tsx
if (state.manager.confidence < 25) {
  attention.push({ text: t('home.confidenceAttention', { n: state.manager.confidence }), screen: 'home', tone: state.manager.confidence < 15 ? 'danger' : 'warn' })
}
```

- Poach panel (employed offers), rendered above the grid when present:

```tsx
{state.manager.jobOffers.length > 0 && (
  <Panel label={t('home.poachPanel')} className="mb-4 border-accent/40!">
    <ul className="flex flex-col gap-3">
      {state.manager.jobOffers.map(o => {
        const club = state.teams.find(tm => tm.id === o.teamId)!
        return (
          <li key={o.teamId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <div>
              <div>{t('home.poachOffer', { club: club.name, division: club.division })}</div>
              <div className="mt-0.5 text-xs text-ink-muted">
                {t('home.poachDetails', {
                  cash: formatMoney(club.cash),
                  wages: formatMoney(wageBill(club.id, state)),
                  loan: formatMoney(restructuredLoan(club)),
                })}
              </div>
            </div>
            <div className="flex gap-1.5">
              <Button variant="primary" size="sm" onClick={() => setState(s => acceptJob(s, o.teamId))}>
                {t('home.poachAccept')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setState(s => declineOffer(s, o.teamId))}>
                {t('home.poachDecline')}
              </Button>
            </div>
          </li>
        )
      })}
    </ul>
  </Panel>
)}
```

Imports: `acceptJob, declineOffer, restructuredLoan` from `../engine/career`; `formatMoney, wageBill` from `../engine/finance`.

- [ ] **Step 3: Verify** — `npx tsc -b --force` clean; `npx vitest run` green; `npm run dev` and eyeball Home: meter present, no offers panel in a fresh game.

- [ ] **Step 4: Commit** — `git commit -m "feat(ui): board confidence meter and poach offers on Home"`

---

### Task 9: UI — UnemployedScreen + Shell/App unemployment wiring

**Files:**
- Create: `src/screens/UnemployedScreen.tsx`
- Modify: `src/App.tsx`, `src/ui/Shell.tsx`, `src/i18n/en.ts`, `src/i18n/pt.ts`

**Interfaces:**
- `UnemployedScreen({ state, setState, onAdvance })` — reputation meter, job offers with the same finance preview as Task 8's poach rows, accept/decline, advance-week.
- `Shell`: when `!state.manager.employed`, NAV drops `squad`/`transfers`/`finance` (desktop, mobile primary bar, and more-sheet); sidebar footer shows `state.manager.name` + `t('shell.unemployed')` + reputation instead of club/cash.
- `App`: temporary sacked screen DELETED; `home` renders UnemployedScreen when unemployed; a `useEffect` redirects any hidden screen to `home` on sacking.

- [ ] **Step 1: Add the dictionary keys**

`en.ts`:

```ts
'shell.unemployed': 'Unemployed',
'unemployed.header': 'Awaiting offers',
'unemployed.message': 'You were sacked. The league plays on — advance the weeks and the offers will come.',
'unemployed.reputation': 'Reputation',
'unemployed.offersPanel': 'Job offers',
'unemployed.noOffers': 'No offers this week. Keep advancing — someone always gets sacked.',
'unemployed.offerRow': '{club} — Division {division}, {position} place, {squad} players',
'unemployed.offerFinances': 'Cash {cash} · Wages {wages}/wk · Loan after takeover {loan}',
'unemployed.accept': 'Take the job',
'unemployed.decline': 'Decline',
```

`pt.ts`:

```ts
'shell.unemployed': 'Desempregado',
'unemployed.header': 'Aguardando propostas',
'unemployed.message': 'Você foi demitido. O campeonato continua — avance as semanas e as propostas virão.',
'unemployed.reputation': 'Reputação',
'unemployed.offersPanel': 'Propostas de emprego',
'unemployed.noOffers': 'Nenhuma proposta esta semana. Continue avançando — sempre demitem alguém.',
'unemployed.offerRow': '{club} — Divisão {division}, {position}º lugar, {squad} jogadores',
'unemployed.offerFinances': 'Caixa {cash} · Salários {wages}/sem · Empréstimo após assumir {loan}',
'unemployed.accept': 'Aceitar o cargo',
'unemployed.decline': 'Recusar',
```

- [ ] **Step 2: Implement UnemployedScreen**

`src/screens/UnemployedScreen.tsx`:

```tsx
import type { Dispatch, SetStateAction } from 'react'
import { acceptJob, declineOffer, positionOf, restructuredLoan } from '../engine/career'
import { formatMoney, wageBill } from '../engine/finance'
import type { GameState } from '../engine/types'
import { t, useLang } from '../i18n'
import Button from '../ui/Button'
import EmptyState from '../ui/EmptyState'
import Panel from '../ui/Panel'
import ScreenHeader from '../ui/ScreenHeader'

interface Props {
  state: GameState
  setState: Dispatch<SetStateAction<GameState>>
  onAdvance: () => void
}

export default function UnemployedScreen({ state, setState, onAdvance }: Props) {
  useLang()
  return (
    <div>
      <ScreenHeader label={t('unemployed.header')} title={state.manager.name} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Panel label={t('unemployed.reputation')}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-rule">
                <div className="h-full bg-accent" style={{ width: `${state.manager.reputation}%` }} />
              </div>
              <span className="font-mono text-xs tabular-nums">{state.manager.reputation}</span>
            </div>
            <Button variant="primary" onClick={onAdvance}>{t('shell.advanceWeek')}</Button>
          </div>
          <p className="mt-3 text-sm text-ink-muted">{t('unemployed.message')}</p>
        </Panel>

        <Panel label={t('unemployed.offersPanel')}>
          {state.manager.jobOffers.length === 0 ? (
            <EmptyState>{t('unemployed.noOffers')}</EmptyState>
          ) : (
            <ul className="flex flex-col gap-3">
              {state.manager.jobOffers.map(o => {
                const club = state.teams.find(tm => tm.id === o.teamId)!
                return (
                  <li key={o.teamId} className="flex flex-col gap-1.5 border-b border-rule/60 pb-3 text-sm last:border-b-0 last:pb-0">
                    <div className="font-medium">
                      {t('unemployed.offerRow', {
                        club: club.name, division: club.division,
                        position: positionOf(state, club.id), squad: club.playerIds.length,
                      })}
                    </div>
                    <div className="text-xs text-ink-muted">
                      {t('unemployed.offerFinances', {
                        cash: formatMoney(club.cash),
                        wages: formatMoney(wageBill(club.id, state)),
                        loan: formatMoney(restructuredLoan(club)),
                      })}
                    </div>
                    <div className="flex gap-1.5">
                      <Button variant="primary" size="sm" onClick={() => setState(s => acceptJob(s, o.teamId))}>
                        {t('unemployed.accept')}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setState(s => declineOffer(s, o.teamId))}>
                        {t('unemployed.decline')}
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Wire Shell and App**

`Shell.tsx`:

```ts
const HIDDEN_WHEN_UNEMPLOYED: ScreenId[] = ['squad', 'transfers', 'finance']
```

- Desktop nav: `NAV.filter(n => employed || !HIDDEN_WHEN_UNEMPLOYED.includes(n.id)).map(...)` where `const employed = state.manager.employed`.
- Mobile primary: `MOBILE_PRIMARY.filter(id => employed || !HIDDEN_WHEN_UNEMPLOYED.includes(id))`; more-sheet: same filter on its `NAV.filter(...)`.
- Sidebar footer + mobile vitals line: when unemployed, replace club name with `state.manager.name` and the money/week line with `{t('shell.unemployed')} · {t('shell.seasonWeek', { season, week })}` (drop `MoneyText`).

`App.tsx`:
- Delete the `if (!state.manager.employed)` sacked-screen block (from Task 1) and the now-unused `app.sacked*` keys from BOTH dictionaries.
- Add after the state declarations:

```tsx
const employed = state.manager.employed
useEffect(() => {
  if (!employed && ['squad', 'transfers', 'finance'].includes(screen)) setScreen('home')
}, [employed, screen])
```

- Home branch: `{screen === 'home' && (employed ? <HomeScreen ... /> : <UnemployedScreen state={state} setState={setState} onAdvance={advance} />)}`
- The season-over champion banner and `expiringCount` block: wrap the `expiringCount` computation with `employed ? ... : 0` (it reads the user squad, which is fine, but expiring contracts of a club you don't run aren't your problem).

- [ ] **Step 4: Verify** — tests + tsc + build green. `npm run dev`: force a sacking (temporarily set confidence to 1 in a dev save via the console, or play a bad run), confirm: nav shrinks, UnemployedScreen shows, offers arrive within a few weeks, accepting one takes over the club and restores the full nav.

- [ ] **Step 5: Commit** — `git commit -m "feat(ui): unemployment — awaiting offers screen and shell wiring"`

---

### Task 10: UI — Club details page + click wiring everywhere

**Files:**
- Create: `src/screens/ClubScreen.tsx`
- Modify: `src/App.tsx`, `src/ui/Shell.tsx`, `src/ui/NewsRail.tsx`, `src/screens/TableScreen.tsx`, `src/screens/CupScreen.tsx`, `src/screens/HomeScreen.tsx`, `src/i18n/en.ts`, `src/i18n/pt.ts`

**Interfaces:**
- `ScreenId` gains `'club'` (NOT added to `NAV` — no nav entry, reached only by clicks).
- `App`: `const [clubView, setClubView] = useState<{ teamId: number; from: ScreenId } | null>(null)`; `openClub(teamId)` records the current screen as `from` and navigates; ClubScreen's back returns to `from`. `openClub` is passed as `onShowClub` to Shell (→ NewsRail), HomeScreen, TableScreen, CupScreen.
- `ClubScreen({ state, teamId, onBack })`: club name, division + position, manager (`isManaged(state, teamId) ? state.manager.name : team.manager`), fan mood meter, capacity, squad DataTable (name, position, age, level, status). No cash.
- `NewsRail` gains optional `onShowClub?: (teamId: number) => void`; a news row whose params contain a resolvable club name renders that name's row as a button. Resolution: first param among `['club', 'winner', 'from', 'bidder', 'loser', 'to']` matching a team name; unresolvable → plain row.
- `TableScreen` gains `onShowClub?: (teamId: number) => void` → `DataTable onRowClick`.
- `CupScreen` refactor: `TieRow`'s outer element is always a `div`; the center score becomes the toggle button (played ties only); `ClubName` gains optional `onClick` and renders a button when provided. `CupScreen` gains `onShowClub?`.
- `HomeScreen`: the next-match opponent button calls `onShowClub(opponentId)` (prop renamed/replaced from `onShowTeam`; App's table-focus pathway `goToTeam` stays for search, but the opponent click now opens the club page per spec).

- [ ] **Step 1: Add the dictionary keys**

`en.ts`:

```ts
'club.header': 'Club',
'club.position': '{position} in Division {division}',
'club.manager': 'Manager',
'club.fanMood': 'Fan mood',
'club.capacity': 'Stadium',
'club.squadPanel': 'Squad',
'club.back': 'Back',
'club.statusOut': 'Out {n}w',
'club.statusBan': 'Suspended',
'club.statusFit': '—',
```

`pt.ts`:

```ts
'club.header': 'Clube',
'club.position': '{position}º na Divisão {division}',
'club.manager': 'Técnico',
'club.fanMood': 'Humor da torcida',
'club.capacity': 'Estádio',
'club.squadPanel': 'Elenco',
'club.back': 'Voltar',
'club.statusOut': 'Fora {n}sem',
'club.statusBan': 'Suspenso',
'club.statusFit': '—',
```

- [ ] **Step 2: Implement ClubScreen**

`src/screens/ClubScreen.tsx`:

```tsx
import { positionOf } from '../engine/career'
import type { GameState, Player } from '../engine/types'
import { isManaged } from '../engine/types'
import { t, useLang } from '../i18n'
import Button from '../ui/Button'
import DataTable from '../ui/DataTable'
import type { Column } from '../ui/DataTable'
import Panel from '../ui/Panel'
import ScreenHeader from '../ui/ScreenHeader'

interface Props {
  state: GameState
  teamId: number
  onBack: () => void
}

export default function ClubScreen({ state, teamId, onBack }: Props) {
  useLang()
  const team = state.teams.find(tm => tm.id === teamId)!
  const manager = isManaged(state, teamId) ? state.manager.name : team.manager
  const squad = team.playerIds.map(id => state.players[id]).sort((a, b) => b.level - a.level)

  const status = (p: Player) =>
    p.injuredForRounds > 0 ? t('club.statusOut', { n: p.injuredForRounds })
    : p.suspendedForRounds > 0 ? t('club.statusBan')
    : t('club.statusFit')

  const columns: Column<Player>[] = [
    { key: 'name', label: t('common.player'), render: p => p.name },
    { key: 'position', label: t('common.position'), mono: true, render: p => p.position },
    { key: 'age', label: t('common.age'), align: 'right', mono: true, render: p => p.age },
    { key: 'level', label: t('common.level'), align: 'right', mono: true, render: p => <strong>{p.level}</strong> },
    { key: 'status', label: t('common.status'), hideOnMobile: true, render: status },
  ]

  return (
    <div>
      <ScreenHeader
        label={t('club.position', { position: positionOf(state, teamId), division: team.division })}
        title={team.name}
        actions={<Button variant="ghost" size="sm" onClick={onBack}>{t('club.back')}</Button>}
      />
      <Panel className="mb-4">
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-ink-muted">{t('club.manager')}</span>
            <span className="font-medium">{manager}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink-muted">{t('club.fanMood')}</span>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-rule">
                <div className="h-full bg-accent" style={{ width: `${team.fanMood}%` }} />
              </div>
              <span className="font-mono text-xs tabular-nums">{team.fanMood}</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink-muted">{t('club.capacity')}</span>
            <span className="font-mono text-xs tabular-nums">{t('home.seats', { n: team.capacity.toLocaleString('en-US') })}</span>
          </div>
        </div>
      </Panel>
      <Panel label={t('club.squadPanel')}>
        <DataTable columns={columns} rows={squad} rowKey={p => p.id} />
      </Panel>
    </div>
  )
}
```

If `common.player`/`common.position`/`common.age`/`common.level`/`common.status` don't all exist yet in the dictionaries, add the missing ones (check `grep "'common\." src/i18n/en.ts` first — SquadScreen likely already defines most; reuse its keys rather than minting new ones).

- [ ] **Step 3: Wire the clicks**

`App.tsx`:

```tsx
const [clubView, setClubView] = useState<{ teamId: number; from: ScreenId } | null>(null)
const openClub = (teamId: number) => {
  setClubView({ teamId, from: screen === 'club' ? (clubView?.from ?? 'home') : screen })
  setScreen('club')
}
```

Render inside Shell's children: `{screen === 'club' && clubView && <ClubScreen state={state} teamId={clubView.teamId} onBack={() => setScreen(clubView.from)} />}`. Pass `onShowClub={openClub}` to Shell, HomeScreen, TableScreen, CupScreen.

`Shell.tsx`: Props gain `onShowClub?: (teamId: number) => void`; pass to `<NewsRail state={state} onShowClub={onShowClub} />`.

`NewsRail.tsx`:

```tsx
const CLUB_PARAMS = ['club', 'winner', 'from', 'bidder', 'loser', 'to'] // first resolvable name wins

function clubIdOf(item: NewsItem, state: GameState): number | null {
  for (const key of CLUB_PARAMS) {
    const v = item.params[key]
    if (typeof v !== 'string') continue
    const team = state.teams.find(t => t.name === v)
    if (team) return team.id
  }
  return null
}
```

`NewsRail` and `NewsRow` gain `state`/`onShowClub`; in `NewsRow`, when `onShowClub` is set and `clubIdOf` resolves, the text span becomes:

```tsx
<button
  type="button"
  onClick={() => onShowClub(clubId)}
  className="min-w-0 flex-1 rounded-sm text-left underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
>
  {newsText(item)}
</button>
```

`HomeScreen.tsx`: pass `onShowClub` down to its `<NewsRail state={state} limit={...} onShowClub={onShowClub} />`; the next-match opponent button's `onClick` becomes `() => onShowClub?.(opponentId)` (replace the `onShowTeam` prop with `onShowClub`; App drops the `onShowTeam={goToTeam}` for Home but KEEPS `goToTeam`/`tableFocus` for the Table search mechanics).

`TableScreen.tsx`: Props gain `onShowClub?: (teamId: number) => void`; `<DataTable ... onRowClick={onShowClub ? r => onShowClub(r.teamId) : undefined} />`.

`CupScreen.tsx` refactor:
- `ClubName` gains `onClick?: () => void`; when set, wraps content in `<button type="button" onClick={onClick} className="rounded-sm underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">…</button>`.
- `TieRow`: outer element is ALWAYS a `div` with `rowClass`; the center score cell becomes a `<button type="button" onClick={onToggle}>` when `played` (with the previous hover/focus classes), otherwise the plain `vs` span. Club names get `onClick={() => onShowClub?.(f.homeId)}` / `awayId` respectively.
- `CupScreen` Props: `{ state, onShowClub }`; pass through to `TieRow` and the expanded panel's `ClubName`s.

- [ ] **Step 4: Verify** — tests + tsc + build; `npm run dev`: click a Table row, a cup tie name, a news item, and Home's opponent — all land on the club page; Back returns to the origin screen; the club page shows manager/mood/capacity/squad and no cash.

- [ ] **Step 5: Commit** — `git commit -m "feat(ui): club details page reachable from table, cup, news and home"`

---

### Task 11: UI — Welcome name input, Saves rename, manager-centric History

**Files:**
- Modify: `src/screens/WelcomeScreen.tsx`, `src/screens/SavesScreen.tsx`, `src/screens/HistoryScreen.tsx`, `src/App.tsx`, `src/i18n/en.ts`, `src/i18n/pt.ts`

- [ ] **Step 1: Add the dictionary keys**

`en.ts`:

```ts
'welcome.managerName': 'Your name',
'saves.managerName': 'Manager name',
'history.clubColumn': 'Club',
'history.reputation': 'Reputation',
```

`pt.ts`:

```ts
'welcome.managerName': 'Seu nome',
'saves.managerName': 'Nome do técnico',
'history.clubColumn': 'Clube',
'history.reputation': 'Reputação',
```

- [ ] **Step 2: Implement**

`WelcomeScreen.tsx`: signature becomes `{ state, onDismiss }: { state: GameState; onDismiss: (managerName: string) => void }`. Add above the start button:

```tsx
const [managerName, setManagerName] = useState(state.manager.name)
```

```tsx
<label className="flex flex-col gap-1 border-t border-rule pt-5">
  <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{t('welcome.managerName')}</span>
  <input
    type="text"
    value={managerName}
    onChange={e => setManagerName(e.target.value)}
    maxLength={40}
    className="rounded-md border border-rule bg-surface-raised px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
  />
</label>
```

Start button: `onClick={() => onDismiss(managerName)}`. NOTE: the auto-focus effect focuses the first `button` — keep that behavior but verify Escape still dismisses (Escape passes the current input value: change the keydown handler to `onDismiss(dialogRef.current?.querySelector('input')?.value ?? '')` — or simpler, hoist `managerName` read via a ref; simplest correct: change the effect's `onDismiss` dependency usage to a `useRef` holding the latest name and call `onDismiss(nameRef.current)`).

`App.tsx`: `<WelcomeScreen state={state} onDismiss={name => { setState(s => renameManager(s, name)); setShowWelcome(false) }} />` (import `renameManager`).

`SavesScreen.tsx`: in the settings Panel, above the language row:

```tsx
<div className="flex items-center justify-between gap-3 text-sm">
  <span className="text-ink-muted">{t('saves.managerName')}</span>
  <input
    type="text"
    defaultValue={state.manager.name}
    key={state.manager.name}
    maxLength={40}
    aria-label={t('saves.managerName')}
    onBlur={e => setState(s => renameManager(s, e.target.value))}
    className="w-48 rounded-md border border-rule bg-surface px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
  />
</div>
```

`HistoryScreen.tsx`:
- Columns: insert after `season`: `{ key: 'club', label: t('history.clubColumn'), render: h => h.club }`.
- Manager-centric counting: `const titles = state.history.filter(h => h.champions[0] === h.club).length` and `const cups = state.history.filter(h => h.cupWinner === h.club).length` (titles/cups won at whichever club you were managing).
- Chips row: add `<StatChip label={t('history.reputation')} value={state.manager.reputation} />` (grid becomes `grid-cols-3`).

- [ ] **Step 3: Verify** — tests + tsc + build; `npm run dev`: new career shows the name input pre-filled with a generated name, typed name appears on the Saves screen and in `userHired` news after a job change; History shows the club column.

- [ ] **Step 4: Commit** — `git commit -m "feat(ui): manager identity — welcome input, saves rename, career history"`

---

### Task 12: End-to-end verification

**Files:** none (fixes only if something surfaces)

- [ ] **Step 1: Full suite** — `npx vitest run` (all green), `npx tsc -b --force` (clean), `npm run build` (clean), `npx oxlint src` if the repo lints.

- [ ] **Step 2: Headless career smoke** — add a temporary script or a one-off test running 3 full seasons of `advanceRound`/`newSeason` from `newGame(1)` asserting: every club always has ≥ 14 players, `manager.confidence` stays in 0–100, the news feed contains at least one `managerSacked`/`managerHired` pair by season 3, and the state survives `migrateToCurrent(JSON.parse(exportSave(state)))`. Keep it if it's fast (<2s); delete if not.

- [ ] **Step 3: Manual playthrough checklist** (`npm run dev`):
  - New career: welcome name input; confidence meter at 60; news rail carries manager moves by mid-season.
  - Sacking path: dev-force `confidence: 1` and lose — sacked → UnemployedScreen; nav shrinks; weeks advance; offers arrive with finances shown; accepting a broke club yields cash 0 + loan + 16 players; honeymoon (confidence frozen upward-only) through the season.
  - Club page from all four entry points; back returns correctly.
  - Language switch retranslates career news retroactively.
  - Old save (localStorage from main branch) loads and migrates: managers everywhere, career intact.

- [ ] **Step 4: Commit** — `git commit -m "chore: phase 7 complete"`
