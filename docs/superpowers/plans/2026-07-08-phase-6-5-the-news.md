# Futscript Phase 6.5 — The News Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A persistent, translated news feed in the save — the season telling its own story: your club's signings, sales, injuries and board trouble; division rivals' transfers and thrashings; promotion, relegation, champions and cup runs — shown in a right sidebar rail on wide screens and a Home panel elsewhere.

**Architecture:** News lives in the engine as structured data: `GameState.news: NewsItem[]` (v6 schema), where each item is `{ season, week, type, params }` — a `NewsType` string plus name/number params, NEVER prose — so the UI translates at render time and a language switch retranslates history. Generation happens where the engine already knows the facts (transferPlayer, runTransfers, runWeeklyFinances, tickConstruction, advanceRound, newSeason) through one `pushNews` helper with a 60-item cap. The UI side is one `newsText(item)` mapper (typed `NewsType → TranslationKey`), a `NewsRail` component slotted into the Shell at ≥1280px, a Home panel fallback below that, and `detectToasts` rewritten to derive from the news identity-diff — deleting its three bespoke detectors.

**Tech Stack:** Existing React 19 + TS strict + Vite + Vitest + Tailwind v4 kit + Phase 6 i18n. No new dependencies.

## Prerequisite

Phase 6 merged (tag `phase-6`, 164/164 green). The i18n module (`t`, `TranslationKey`, `useLang`, en/pt dictionaries) and the kit are the substrate.

## Global Constraints

- Save schema becomes `version: 6`: `GameState` gains `news: NewsItem[]`; `migrateV5` adds `news: []`; `migrateToCurrent`'s terminal check moves to 6 (shape guard otherwise unchanged). All existing migration tests update their terminal expectations.
- The engine stores ONLY structured news (`type` + `params` with names/numbers as data) — no English strings, no translation keys. The `NewsType → TranslationKey` mapping lives in the UI (`src/i18n/news.ts`) and is compile-checked complete via `Record<NewsType, TranslationKey>`.
- News cap: exactly 60 items (`NEWS_CAP = 60` in `src/engine/news.ts`), oldest dropped first; newest stored LAST (append order), rendered newest-FIRST by the UI.
- Feed sources (binding list): user club — `userSigned`, `userSold`, `userRenewed` (contract renewals), `userOutbid`, `offerReceived`, `starterInjured`, `boardWarning`, `constructionDone`; division — `rivalTransfer` (a completed transfer where either club is in the user's division and the user is not a party), `heavyWin` (a margin ≥ 4 in the user's division), `cupRun` (a club from the user's division reaching cup round ≥ 4, user excluded); season — `champions` (per division), `cupWinner`, `promoted`/`relegated` (only moves touching the user's pre-rollover division). Nothing else in this phase.
- `npm test` green after every task (164 + new); `npx tsc -b --force` (plain `tsc --noEmit` is a no-op here); `npm run build` clean.
- Engine purity rules hold: pure functions, seeded RNG only, no i18n imports in `src/engine/`.
- UI: semantic tokens + kit components only; every new string in BOTH dictionaries (pt coverage is compile/test-enforced); the rail must not disturb existing layouts below 1280px.

## File Structure

- `src/engine/types.ts` — `NewsType`, `NewsItem`, `GameState.news`, `version: 6`
- `src/engine/news.ts` — `NEWS_CAP`, `pushNews`
- `src/engine/save.ts` — `migrateV5`, terminal check
- `src/engine/transfers.ts`, `finance.ts`, `stadium.ts`, `season.ts` — generation call sites
- `src/i18n/news.ts` — `newsText(item, ...)` + the typed key map; `en.ts`/`pt.ts` — `news.*` keys
- `src/ui/NewsRail.tsx` — the feed list (shared by rail and Home panel)
- `src/ui/Shell.tsx` — right rail ≥1280px
- `src/screens/HomeScreen.tsx` — news panel < 1280px
- `src/ui/toastEvents.ts` — news-diff rewrite

---

### Task 1: News data model — types, cap, pushNews, v6 migration

**Files:**
- Modify: `src/engine/types.ts`, `src/engine/save.ts`
- Create: `src/engine/news.ts`
- Test: `src/engine/news.test.ts`, `src/engine/save.test.ts`
- Modify (literals): `src/engine/standings.test.ts` (`makeState` gains `news: []`, `version: 6`); any other full-GameState literal the grep in Step 5 finds

**Interfaces:**
- Produces:
  - `types.ts`:

```ts
export type NewsType =
  | 'userSigned' | 'userSold' | 'userRenewed' | 'userOutbid' | 'offerReceived'
  | 'starterInjured' | 'boardWarning' | 'constructionDone'
  | 'rivalTransfer' | 'heavyWin' | 'cupRun'
  | 'champions' | 'cupWinner' | 'promoted' | 'relegated'

export interface NewsItem {
  season: number
  week: number
  type: NewsType
  params: Record<string, string | number> // names and numbers as data — translated at render time
}
```

  - `GameState` gains `news: NewsItem[] // newest last, capped at NEWS_CAP` and `version` becomes `6`
  - `news.ts`: `NEWS_CAP = 60`; `pushNews(state: GameState, type: NewsType, params: NewsItem['params'], week?: number): GameState` — appends `{ season: state.season, week: week ?? state.round, type, params }`, keeps the last 60
  - `save.ts`: `migrateV5(s: any): GameState` adding `news: []`; chained in `migrateToCurrent`; terminal check `version === 6`

- [ ] **Step 1: Write the failing tests**

`src/engine/news.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { newGame } from './newGame'
import { NEWS_CAP, pushNews } from './news'

describe('pushNews', () => {
  it('appends stamped items and defaults the week to the current round', () => {
    const s0 = { ...newGame(1), season: 2, round: 7 }
    const s1 = pushNews(s0, 'heavyWin', { winner: 'A', loser: 'B', score: '5-0' })
    expect(s1.news).toHaveLength(1)
    expect(s1.news[0]).toEqual({ season: 2, week: 7, type: 'heavyWin', params: { winner: 'A', loser: 'B', score: '5-0' } })
    expect(s0.news).toHaveLength(0) // pure
    const s2 = pushNews(s1, 'cupWinner', { club: 'C' }, 36)
    expect(s2.news[1].week).toBe(36) // explicit week override
  })

  it('caps at NEWS_CAP dropping the oldest', () => {
    let s = newGame(1)
    for (let i = 0; i < NEWS_CAP + 5; i++) s = pushNews(s, 'heavyWin', { i })
    expect(s.news).toHaveLength(NEWS_CAP)
    expect(s.news[0].params.i).toBe(5) // 0..4 dropped
    expect(s.news[NEWS_CAP - 1].params.i).toBe(NEWS_CAP + 4)
  })
})
```

Add to `src/engine/save.test.ts` (and update the existing migration tests' terminal expectations from 5 to 6, extending their `toMatchObject`s with `news: []`):

```ts
it('migrates a v5 save to v6 with an empty news feed', () => {
  const storage = fakeStorage()
  const v5 = { ...JSON.parse(JSON.stringify(newGame(3))), version: 5 } as Record<string, unknown>
  delete v5.news
  storage.setItem('futscript-save', JSON.stringify(v5))
  const state = load(storage)
  expect(state!.version).toBe(6)
  expect(state!.news).toEqual([])
  expect(state!.season).toBe(1)
})
```

- [ ] **Step 2: Run to verify failures** — `npx vitest run src/engine/news.test.ts src/engine/save.test.ts`

- [ ] **Step 3: Implement**

`src/engine/news.ts`:

```ts
import type { GameState, NewsItem, NewsType } from './types'

export const NEWS_CAP = 60

// The one way news enters the world. Structured only — the UI translates at render time.
export function pushNews(
  state: GameState,
  type: NewsType,
  params: NewsItem['params'],
  week?: number,
): GameState {
  const item: NewsItem = { season: state.season, week: week ?? state.round, type, params }
  return { ...state, news: [...state.news, item].slice(-NEWS_CAP) }
}
```

`types.ts` per the Interfaces block. `save.ts`: `migrateV5` mirrors `migrateV4`'s shape (`{ ...s, version: 6, news: [] }`), chained after it; terminal check becomes 6. `newGame.ts`: state literal gains `news: []` and `version: 6` — wait, `version` in the newGame literal already references the `GameState` type's literal `6` — set it explicitly.

- [ ] **Step 4: Update literals** — `newGame.ts` (`news: [], version: 6`), `standings.test.ts` `makeState`, and grep `version: 5` across `src/` for stragglers (the composed-migration test in save.test.ts builds `version: 3` payloads — untouched).

- [ ] **Step 5: Verify** — `npm test`, `npx tsc -b --force`. Expected: green (164 + 3).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(news): structured news model, cap, and v6 migration"
```

---

### Task 2: Generation — market and money events

**Files:**
- Modify: `src/engine/transfers.ts`, `src/engine/finance.ts`, `src/engine/stadium.ts`
- Test: `src/engine/news-market.test.ts`

**Interfaces:**
- Consumes: `pushNews` (Task 1)
- Produces news at these exact points (params schemas binding — the i18n map depends on them):
  - `transferPlayer` (after the existing state assembly): user is seller → `userSold { player, amount }`; user is buyer → `userSigned { player, amount }`; neither, but seller's or buyer's division equals the user's division → `rivalTransfer { player, from, to, amount }` (club NAMES, not ids)
  - `renewContract` success path → `userRenewed { player, salary }` (the new weekly salary)
  - `runTransfers` AI-bid loop: when a bid displaces the user as `currentBidderId` → `userOutbid { player }` (once per displacement — the same shape the UI toast already detects, now engine-truth)
  - `runTransfers` offer generation: when an incoming offer is created → `offerReceived { bidder, player, amount }`
  - `runWeeklyFinances`: when `brokeRounds` crosses from <6 to ≥6 → `boardWarning { n: brokeRounds }`
  - `tickConstruction` completion branch → `constructionDone { seats: addedCapacity }`

- [ ] **Step 1: Write the failing tests**

`src/engine/news-market.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { adjustCash } from './finance'
import { newGame } from './newGame'
import { mulberry32 } from './rng'
import { advanceRound } from './season'
import { expandStadium } from './stadium'
import { listPlayer, placeBid, renewContract, runTransfers, transferPlayer } from './transfers'
import type { GameState } from './types'

function userOf(s: GameState) {
  return s.teams.find(t => t.id === s.userTeamId)!
}

describe('market news', () => {
  it('transferPlayer writes userSold / userSigned / rivalTransfer', () => {
    const s0 = newGame(1)
    const user = userOf(s0)
    const sold = transferPlayer(s0, user.playerIds[17], s0.teams.find(t => t.id !== user.id)!.id, 250_000)
    expect(sold.news.at(-1)).toMatchObject({ type: 'userSold', params: { amount: 250_000 } })

    const aiSeller = s0.teams.find(t => t.id !== user.id && t.division === user.division)!
    const bought = transferPlayer(s0, aiSeller.playerIds[0], user.id, 300_000)
    expect(bought.news.at(-1)!.type).toBe('userSigned')

    // rival-to-rival inside the user's division
    const rivals = s0.teams.filter(t => t.id !== user.id && t.division === user.division)
    const rival = transferPlayer(s0, rivals[0].playerIds[0], rivals[1].id, 100_000)
    expect(rival.news.at(-1)).toMatchObject({
      type: 'rivalTransfer',
      params: { from: rivals[0].name, to: rivals[1].name },
    })

    // cross-division AI transfer not touching the user's division: no news
    const far = s0.teams.filter(t => t.division !== user.division)
    const quiet = transferPlayer(s0, far[0].playerIds[0], far[1].id, 100_000)
    expect(quiet.news.filter(n => n.type === 'rivalTransfer')).toHaveLength(0)
  })

  it('renewContract writes userRenewed', () => {
    const s0 = newGame(1)
    const user = userOf(s0)
    const id = user.playerIds[0]
    const expiring: GameState = { ...s0, players: { ...s0.players, [id]: { ...s0.players[id], contractSeasons: 1 } } }
    const s1 = renewContract(expiring, id)
    expect(s1.news.at(-1)).toMatchObject({ type: 'userRenewed', params: { player: s0.players[id].name } })
  })

  it('a displaced user bid writes userOutbid', () => {
    const s0 = newGame(1)
    const aiClub = s0.teams.find(t => t.id !== s0.userTeamId)!
    let s = listPlayer(s0, aiClub.playerIds[0], 100_000)
    s = placeBid(s, aiClub.playerIds[0], 100_000)
    const rand = mulberry32(5)
    for (let i = 0; i < 12 && !s.news.some(n => n.type === 'userOutbid'); i++) {
      s = { ...s, transferList: s.transferList.map(l => ({ ...l, roundsLeft: 5 })) } // keep alive
      s = runTransfers(s, rand)
    }
    expect(s.news.some(n => n.type === 'userOutbid')).toBe(true)
  })

  it('offer generation writes offerReceived', () => {
    let s = newGame(21)
    const rand = mulberry32(21)
    for (let i = 0; i < 30 && !s.news.some(n => n.type === 'offerReceived'); i++) s = runTransfers(s, rand)
    const item = s.news.find(n => n.type === 'offerReceived')!
    expect(typeof item.params.bidder).toBe('string')
    expect(typeof item.params.player).toBe('string')
  })

  it('board warning fires once when patience crosses 6', () => {
    const s0 = newGame(1)
    let s: GameState = { ...s0, teams: adjustCash(s0.teams, s0.userTeamId, -50_000_000), brokeRounds: 5 }
    s = advanceRound(s) // 5 -> 6: warn
    expect(s.news.filter(n => n.type === 'boardWarning')).toHaveLength(1)
    const before = s.news.filter(n => n.type === 'boardWarning').length
    s = advanceRound(s) // 6 -> 7: no repeat
    expect(s.news.filter(n => n.type === 'boardWarning')).toHaveLength(before)
  })

  it('construction completion writes constructionDone', () => {
    let s = expandStadium(newGame(1))
    for (let i = 0; i < 6; i++) s = advanceRound(s)
    expect(s.news.some(n => n.type === 'constructionDone' && n.params.seats === 2000)).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify failures** — `npx vitest run src/engine/news-market.test.ts`

- [ ] **Step 3: Implement**

In `src/engine/transfers.ts` (import `pushNews` from `./news`):
- `transferPlayer`: build the result state as today into a local `let result: GameState = { ... }`, then before returning:

```ts
  const userDivision = state.teams.find(t => t.id === state.userTeamId)!.division
  const buyer = state.teams.find(t => t.id === toTeamId)!
  if (from.id === state.userTeamId) {
    result = pushNews(result, 'userSold', { player: player.name, amount: fee })
  } else if (toTeamId === state.userTeamId) {
    result = pushNews(result, 'userSigned', { player: player.name, amount: fee })
  } else if (from.division === userDivision || buyer.division === userDivision) {
    result = pushNews(result, 'rivalTransfer', { player: player.name, from: from.name, to: buyer.name, amount: fee })
  }
  return result
```

- `renewContract`: the success return wraps in `pushNews(..., 'userRenewed', { player: p.name, salary: renewalSalary(p) })` — compute the salary once and reuse it for both the player patch and the news params.
- `runTransfers` AI-bid acceptance branch: capture `const wasUserLeading = listing.currentBidderId === s.userTeamId` before writing the new bid; after the transferList map, `if (wasUserLeading) s = pushNews(s, 'userOutbid', { player: s.players[playerId].name })`.
- Offer-generation success branch: after appending the offer, `s = pushNews(s, 'offerReceived', { bidder: suitor.name, player: s.players[targetId].name, amount })`.

In `src/engine/finance.ts` (`runWeeklyFinances`, import `pushNews`): the return statement currently assembles `{ ...state, teams, finances, brokeRounds, gameOver }` — assemble into a local, then:

```ts
  if (brokeRounds >= 6 && state.brokeRounds < 6) {
    result = pushNews(result, 'boardWarning', { n: brokeRounds })
  }
  return result
```

In `src/engine/stadium.ts` (`tickConstruction` completion branch): wrap the returned state with `pushNews(..., 'constructionDone', { seats: state.construction.addedCapacity })`.

- [ ] **Step 4: Verify** — `npm test`, `npx tsc -b --force`. If a pre-existing transfers test compares whole states with `toEqual` across a path that now also appends news, update ONLY its expectation to account for the news item (never silence the news write) and list it in the report.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(news): market, board, and stadium events"
```

---

### Task 3: Generation — matchday and season events

**Files:**
- Modify: `src/engine/season.ts`
- Test: `src/engine/news-season.test.ts`

**Interfaces:**
- Consumes: `pushNews`
- Produces:
  - `advanceRound`, after consequences are applied: `starterInjured { player, weeks }` for each injury event whose player was in the USER's lineup this week (weeks = the freshly assigned `injuredForRounds`); `heavyWin { winner, loser, score }` for each fixture this week in the user's division decided by a margin ≥ 4; after a cup draw appends round ≥ 4 fixtures: `cupRun { club, round }` for each entrant from the user's division (user's own club excluded)
  - `newSeason`, before the calendar resets (week stamp `totalRounds(state)`): `champions { club, division }` per division; `cupWinner { club }` when a final was played; `promoted { club }` / `relegated { club }` for each club whose division changed relative to pre-rollover AND whose old or new division is the user's pre-rollover division

- [ ] **Step 1: Write the failing tests**

`src/engine/news-season.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { newGame } from './newGame'
import { advanceRound, newSeason, totalRounds } from './season'
import { standings } from './standings'
import type { GameState } from './types'

function playSeason(seed: number): GameState {
  let s = newGame(seed)
  for (let i = 0; i < totalRounds(s) && !s.gameOver; i++) s = advanceRound(s)
  return s
}

describe('matchday news', () => {
  it('a full season produces division heavy wins and user injuries when they occur', () => {
    const s = playSeason(7)
    // structural checks: every heavyWin names two clubs from the user's division and a valid margin
    const userDivision = s.teams.find(t => t.id === s.userTeamId)!.division
    const clubsInDivision = new Set(s.teams.filter(t => t.division === userDivision).map(t => t.name))
    for (const n of s.news.filter(n => n.type === 'heavyWin')) {
      expect(clubsInDivision.has(String(n.params.winner))).toBe(true)
      const [a, b] = String(n.params.score).split('-').map(Number)
      expect(Math.abs(a - b)).toBeGreaterThanOrEqual(4)
    }
    for (const n of s.news.filter(n => n.type === 'starterInjured')) {
      expect(Number(n.params.weeks)).toBeGreaterThanOrEqual(1)
    }
    // cup runs: any QF+ entrant news names a division club and round >= 4
    for (const n of s.news.filter(n => n.type === 'cupRun')) {
      expect(clubsInDivision.has(String(n.params.club))).toBe(true)
      expect(Number(n.params.round)).toBeGreaterThanOrEqual(4)
    }
  })
})

describe('season news', () => {
  it('rollover writes champions, cup winner, and division-touching moves', () => {
    const s = playSeason(7)
    const userDivision = s.teams.find(t => t.id === s.userTeamId)!.division
    const expectedChampion = s.teams.find(t => t.id === standings(s, 1)[0].teamId)!.name
    const s2 = newSeason(s)
    const champions = s2.news.filter(n => n.type === 'champions')
    expect(champions).toHaveLength(3)
    expect(champions.find(n => n.params.division === 1)!.params.club).toBe(expectedChampion)
    expect(s2.news.filter(n => n.type === 'cupWinner')).toHaveLength(1)
    const moves = s2.news.filter(n => n.type === 'promoted' || n.type === 'relegated')
    expect(moves.length).toBeGreaterThan(0)
    expect(moves.length).toBeLessThanOrEqual(6) // only moves touching the user's division
    // week stamp is season end
    expect(champions[0].week).toBe(totalRounds(s))
  })
})
```

- [ ] **Step 2: Run to verify failures** — `npx vitest run src/engine/news-season.test.ts`

- [ ] **Step 3: Implement**

In `advanceRound` (all on the composed `s`, after `runWeeklyFinances`/`tickConstruction`, before the round increment — order within the tick doesn't matter for these):

```ts
  // the week's stories
  const userDivision = byId.get(state.userTeamId)!.division
  const userLineup = new Set(byId.get(state.userTeamId)!.lineup)
  for (const e of roundEvents) {
    if (e.type === 'injury' && userLineup.has(e.playerId)) {
      const hurt = s.players[e.playerId]
      if (hurt) s = pushNews(s, 'starterInjured', { player: hurt.name, weeks: hurt.injuredForRounds })
    }
  }
  for (const f of fixtures.filter(f => f.round === week && f.homeGoals !== null)) {
    const margin = Math.abs(f.homeGoals! - f.awayGoals!)
    if (margin < 4) continue
    const home = byId.get(f.homeId)!
    if (home.division !== userDivision) continue
    const away = byId.get(f.awayId)!
    const homeWon = f.homeGoals! > f.awayGoals!
    s = pushNews(s, 'heavyWin', {
      winner: homeWon ? home.name : away.name,
      loser: homeWon ? away.name : home.name,
      score: homeWon ? `${f.homeGoals}-${f.awayGoals}` : `${f.awayGoals}-${f.homeGoals}`,
    })
  }
```

and inside the existing cup-draw block (where `next` fixtures are appended), after appending:

```ts
    if (next.length > 0 && next[0].cupRound >= 4) {
      for (const tie of next) {
        for (const id of [tie.homeId, tie.awayId]) {
          if (id === state.userTeamId) continue
          const club = byId.get(id)!
          if (club.division === userDivision) s = pushNews(s, 'cupRun', { club: club.name, round: tie.cupRound })
        }
      }
    }
```

(Friendly injuries: the friendly's events are filtered to injuries and pushed into `roundEvents`, so a starter hurt in a friendly IS news — correct and intended.)

In `newSeason`, right after the `history` construction (so it reads pre-rollover facts; use a working variable since `pushNews` takes and returns state — thread it through a local `let newsAcc: GameState = state` accumulating ONLY news, then carry `newsAcc.news` into the final return):

```ts
  // season verdicts for the feed (week-stamped at season end)
  const seasonEnd = totalRounds(state)
  let newsAcc: GameState = state
  const userDivisionPre = state.teams.find(t => t.id === state.userTeamId)!.division
  for (const division of [...new Set(state.teams.map(t => t.division))].sort()) {
    const top = standings(state, division)[0]
    if (top) newsAcc = pushNews(newsAcc, 'champions', { club: state.teams.find(t => t.id === top.teamId)!.name, division }, seasonEnd)
  }
  const champId = cupWinner(state)
  if (champId !== null) {
    newsAcc = pushNews(newsAcc, 'cupWinner', { club: state.teams.find(t => t.id === champId)!.name }, seasonEnd)
  }
```

and after `teams = applyPromotionRelegation(state, teams)` (where old vs new divisions are both known):

```ts
  for (const t of teams) {
    const before = state.teams.find(x => x.id === t.id)!.division
    if (before === t.division) continue
    if (before !== userDivisionPre && t.division !== userDivisionPre) continue
    newsAcc = pushNews(newsAcc, t.division < before ? 'promoted' : 'relegated', { club: t.name }, seasonEnd)
  }
```

and the final return carries `news: newsAcc.news` (news survives rollover — the cap trims naturally).

- [ ] **Step 4: Verify** — `npm test`, `npx tsc -b --force`. Watch the same `toEqual`-on-whole-state caveat as Task 2.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(news): matchday and season verdict events"
```

---

### Task 4: i18n — news keys and the typed mapper

**Files:**
- Create: `src/i18n/news.ts`, `src/i18n/news.test.ts`
- Modify: `src/i18n/en.ts`, `src/i18n/pt.ts`

**Interfaces:**
- Produces: `newsText(item: NewsItem): string` — formats via `t(NEWS_KEYS[item.type], item.params)` with money params pre-formatted (`amount` values are numbers in the data; `newsText` formats them `$1,234,567` before interpolation); `NEWS_KEYS: Record<NewsType, TranslationKey>` (compile-checked complete — adding a NewsType without a key is a build error)

- [ ] **Step 1: Write the failing test**

`src/i18n/news.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { NewsItem } from '../engine/types'
import { setLang } from './index'
import { newsText } from './news'

const item = (type: NewsItem['type'], params: NewsItem['params']): NewsItem =>
  ({ season: 1, week: 3, type, params })

describe('newsText', () => {
  it('formats every news type in both languages', () => {
    setLang('en')
    expect(newsText(item('userSigned', { player: 'João', amount: 250000 }))).toContain('João')
    expect(newsText(item('userSigned', { player: 'João', amount: 250000 }))).toContain('$250,000')
    expect(newsText(item('heavyWin', { winner: 'A', loser: 'B', score: '5-0' }))).toContain('5-0')
    setLang('pt')
    expect(newsText(item('champions', { club: 'Sereno FC', division: 2 }))).toContain('Sereno FC')
    setLang('en')
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/i18n/news.test.ts`

- [ ] **Step 3: Implement**

`src/i18n/news.ts`:

```ts
import type { NewsItem, NewsType } from '../engine/types'
import { t } from './index'
import type { TranslationKey } from './index'

const NEWS_KEYS: Record<NewsType, TranslationKey> = {
  userSigned: 'news.userSigned',
  userSold: 'news.userSold',
  userRenewed: 'news.userRenewed',
  userOutbid: 'news.userOutbid',
  offerReceived: 'news.offerReceived',
  starterInjured: 'news.starterInjured',
  boardWarning: 'news.boardWarning',
  constructionDone: 'news.constructionDone',
  rivalTransfer: 'news.rivalTransfer',
  heavyWin: 'news.heavyWin',
  cupRun: 'news.cupRun',
  champions: 'news.champions',
  cupWinner: 'news.cupWinner',
  promoted: 'news.promoted',
  relegated: 'news.relegated',
}

export function newsText(item: NewsItem): string {
  const params: Record<string, string | number> = { ...item.params }
  if (typeof params.amount === 'number') params.amount = `$${params.amount.toLocaleString('en-US')}`
  if (typeof params.salary === 'number') params.salary = `$${params.salary.toLocaleString('en-US')}`
  return t(NEWS_KEYS[item.type], params)
}
```

Dictionary entries (en shown; pt with natural football voice — e.g. `news.userSigned` pt: `'Você contratou {player} por {amount}'`):

```ts
  'news.userSigned': 'You signed {player} for {amount}',
  'news.userSold': 'You sold {player} for {amount}',
  'news.userRenewed': '{player} signed a new deal at {salary}/wk',
  'news.userOutbid': 'You were outbid on {player}',
  'news.offerReceived': '{bidder} bid {amount} for {player}',
  'news.starterInjured': '{player} injured — out {weeks}w',
  'news.boardWarning': 'The board is losing patience: {n}/8 weeks in the red',
  'news.constructionDone': 'Stadium expansion complete: +{seats} seats',
  'news.rivalTransfer': '{player} moves from {from} to {to} for {amount}',
  'news.heavyWin': '{winner} thrash {loser} {score}',
  'news.cupRun': '{club} reach cup round {round}',
  'news.champions': '{club} are Division {division} champions',
  'news.cupWinner': '{club} win the Cup',
  'news.promoted': '{club} promoted',
  'news.relegated': '{club} relegated',
```

- [ ] **Step 4: Verify** — `npm test` (the pt-coverage test enforces the pt entries), `npx tsc -b --force`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(i18n): news keys and typed mapper"
```

---

### Task 5: UI — NewsRail, the Shell rail, the Home panel

**Files:**
- Create: `src/ui/NewsRail.tsx`
- Modify: `src/ui/Shell.tsx`, `src/screens/HomeScreen.tsx`, `src/i18n/en.ts`, `src/i18n/pt.ts`

**Interfaces:**
- Produces: `NewsRail({ state, limit? })` — renders `state.news` newest-first (reverse), each row: type icon (map below) · text (`newsText`) · week stamp (`S{season} W{week}`, mono faint); `limit` truncates (Home uses it); `EmptyState` `t('news.empty')` ("Nothing to report yet") when empty
- Icon map (existing icons; no new ones): userSigned/userSold/rivalTransfer/userOutbid/offerReceived → `TransfersIcon`; starterInjured → `SquadIcon`; boardWarning → `FinanceIcon`; constructionDone → `FinanceIcon`; heavyWin/champions/promoted/relegated → `TableIcon`; cupRun/cupWinner → `CupIcon`. Tone: boardWarning + relegated rows `text-warn`; starterInjured `text-danger`; the rest default ink with muted stamps.

- [ ] **Step 1: Create `src/ui/NewsRail.tsx`**

```tsx
import type { FC } from 'react'
import type { GameState, NewsItem, NewsType } from '../engine/types'
import { t, useLang } from '../i18n'
import { newsText } from '../i18n/news'
import EmptyState from './EmptyState'
import { CupIcon, FinanceIcon, SquadIcon, TableIcon, TransfersIcon } from './icons'

const ICONS: Record<NewsType, FC<{ className?: string }>> = {
  userSigned: TransfersIcon, userSold: TransfersIcon, userRenewed: SquadIcon, userOutbid: TransfersIcon,
  offerReceived: TransfersIcon, rivalTransfer: TransfersIcon,
  starterInjured: SquadIcon, boardWarning: FinanceIcon, constructionDone: FinanceIcon,
  heavyWin: TableIcon, champions: TableIcon, promoted: TableIcon, relegated: TableIcon,
  cupRun: CupIcon, cupWinner: CupIcon,
}

function toneOf(type: NewsType): string {
  if (type === 'starterInjured') return 'text-danger'
  if (type === 'boardWarning' || type === 'relegated') return 'text-warn'
  return 'text-ink'
}

export default function NewsRail({ state, limit }: { state: GameState; limit?: number }) {
  useLang()
  const items = [...state.news].reverse().slice(0, limit)
  if (items.length === 0) return <EmptyState>{t('news.empty')}</EmptyState>
  return (
    <ol className="flex flex-col">
      {items.map((item, i) => (
        <NewsRow key={`${state.news.length - i}`} item={item} />
      ))}
    </ol>
  )
}

function NewsRow({ item }: { item: NewsItem }) {
  const RowIcon = ICONS[item.type]
  return (
    <li className={`flex items-baseline gap-2 border-b border-rule/60 py-2 text-sm ${toneOf(item.type)}`}>
      <span className="translate-y-0.5 text-ink-faint"><RowIcon /></span>
      <span className="min-w-0 flex-1">{newsText(item)}</span>
      <span className="shrink-0 font-mono text-[10px] tabular-nums text-ink-faint">
        S{item.season} W{item.week}
      </span>
    </li>
  )
}
```

(Key note: `state.news.length - i` is stable per item because the array is append-only with a front-trim — good enough for a display list that re-renders on state change anyway.)

- [ ] **Step 2: The Shell rail (≥1280px)**

In `src/ui/Shell.tsx`: after the `<main>` block, add

```tsx
      {/* news rail — wide screens only */}
      <aside
        aria-label={t('news.title')}
        className="fixed inset-y-0 right-0 hidden w-72 flex-col overflow-y-auto border-l border-rule bg-surface-raised p-4 xl:flex"
      >
        <SectionLabel>{t('news.title')}</SectionLabel>
        <div className="mt-2">
          <NewsRail state={state} />
        </div>
      </aside>
```

and `<main>`'s classes gain `xl:mr-72` (imports: `NewsRail`, `SectionLabel`; keys `news.title` en 'News' / pt 'Notícias', `news.empty` both languages).

- [ ] **Step 3: The Home panel (<1280px)**

In `src/screens/HomeScreen.tsx`, after the existing grid, a news Panel visible only below the rail breakpoint:

```tsx
      <div className="mt-4 xl:hidden">
        <Panel label={t('news.title')}>
          <NewsRail state={state} limit={newsExpanded ? undefined : 5} />
          {state.news.length > 5 && (
            <button
              className="mt-2 text-xs text-ink-muted underline-offset-2 hover:underline"
              onClick={() => setNewsExpanded(e => !e)}
            >
              {newsExpanded ? t('news.showLess') : t('news.showAll', { n: state.news.length })}
            </button>
          )}
        </Panel>
      </div>
```

with `const [newsExpanded, setNewsExpanded] = useState(false)` and keys `news.showAll` ('Show all {n}') / `news.showLess` ('Show less') in both dictionaries.

- [ ] **Step 4: Verify** — `npm test`, `npx tsc -b --force`, `npm run build`; dev at 1440px (rail visible, main content not overlapped, toasts still clear of the rail — toast viewport is `md:right-4`: add `xl:right-[19rem]` so toasts sit left of the rail; adjust in `src/ui/Toast.tsx`), 1024px (no rail, Home panel present), 390px (panel, mobile layout intact), both themes, both languages (switch language: the whole feed retranslates — the point of structured news).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ui): news rail and home news panel"
```

---

### Task 6: toastEvents derives from the news diff

**Files:**
- Modify: `src/ui/toastEvents.ts`
- Test: `src/ui/toastEvents.test.ts` (rewrite)

**Interfaces:**
- Produces: `detectToasts(prev, next)` keeps its signature and max-3 cap but becomes a thin projection of the news identity-diff: new `NewsItem`s (same identity-Set technique as the old ledger diff — news items are stable object references through engine spreads) whose type is in the TOASTABLE set → `ToastInput` via `newsText`, tone by type. TOASTABLE: `offerReceived`/`userSigned`/`userSold`/`constructionDone` → `accent`; `userOutbid` → `warn`; `boardWarning` → `danger`. Everything else (division/season news) stays rail-only. The three bespoke detectors (offer diff, ledger diff, listing diff) and the brokeRounds check are DELETED — the engine now emits all six facts as news at the source.

- [ ] **Step 1: Rewrite the test file**

`src/ui/toastEvents.test.ts` becomes:

```ts
import { describe, expect, it } from 'vitest'
import { newGame } from '../engine/newGame'
import { pushNews } from '../engine/news'
import { setLang } from '../i18n'
import { detectToasts } from './toastEvents'

describe('detectToasts', () => {
  it('projects new toastable news items and ignores rail-only types', () => {
    setLang('en')
    const prev = newGame(1)
    let next = pushNews(prev, 'userSold', { player: 'Test Player', amount: 100_000 })
    next = pushNews(next, 'heavyWin', { winner: 'A', loser: 'B', score: '5-0' }) // rail-only
    const toasts = detectToasts(prev, next)
    expect(toasts).toHaveLength(1)
    expect(toasts[0].tone).toBe('accent')
    expect(toasts[0].text).toContain('Test Player')
  })

  it('survives the news cap (identity diff, not length diff)', () => {
    let prev = newGame(2)
    for (let i = 0; i < 60; i++) prev = pushNews(prev, 'heavyWin', { winner: 'A', loser: 'B', score: '4-0', i })
    const next = pushNews(prev, 'boardWarning', { n: 6 }) // cap: one old item drops, lengths equal
    expect(next.news).toHaveLength(prev.news.length)
    const toasts = detectToasts(prev, next)
    expect(toasts).toHaveLength(1)
    expect(toasts[0].tone).toBe('danger')
  })

  it('caps at three toasts per tick', () => {
    const prev = newGame(3)
    let next = prev
    for (let i = 0; i < 5; i++) next = pushNews(next, 'userSigned', { player: `P${i}`, amount: 1000 })
    expect(detectToasts(prev, next)).toHaveLength(3)
  })
})
```

- [ ] **Step 2: Run to verify failures** (old implementation ignores news) — `npx vitest run src/ui/toastEvents.test.ts`

- [ ] **Step 3: Rewrite the implementation**

```ts
import type { GameState, NewsType } from '../engine/types'
import { newsText } from '../i18n/news'
import type { ToastInput } from './Toast'

const TOASTABLE: Partial<Record<NewsType, ToastInput['tone']>> = {
  offerReceived: 'accent',
  userSigned: 'accent',
  userSold: 'accent',
  constructionDone: 'accent',
  userOutbid: 'warn',
  boardWarning: 'danger',
}

// The engine already narrates everything as structured news; toasts are just
// the urgent subset of what's new this tick. Identity diff: news items are
// stable object references through every engine spread, so this survives the cap.
export function detectToasts(prev: GameState, next: GameState): ToastInput[] {
  const known = new Set(prev.news)
  const out: ToastInput[] = []
  for (const item of next.news) {
    if (known.has(item)) continue
    const tone = TOASTABLE[item.type]
    if (!tone) continue
    out.push({ tone, text: newsText(item) })
  }
  return out.slice(0, 3)
}
```

(`toast.offer`, `toast.outbid`, `toast.boardPatience` dictionary keys become unused — delete them from both dictionaries; `npx tsc -b --force` will confirm nothing else references them.)

- [ ] **Step 4: Verify** — `npm test`, `npx tsc -b --force`, `npm run build`; dev: sell a player → one toast AND one rail entry from the same news item; get outbid → warn toast + rail entry.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(ui): toasts derive from the news diff"
```

---

### Task 7: Phase 6.5 acceptance

**Files:** none new.

- [ ] **Step 1: Full checks** — `npm test`, `npx tsc -b --force`, `npm run build`.
- [ ] **Step 2: Play** — at 1440px: the rail fills as weeks pass (transfers, a thrashing, an injury); switch to Portuguese — the whole feed retranslates including old items; sell a player and watch toast + rail agree; season rollover writes champions/cup/moves stamped at the final week; at 1024px and 390px the rail yields to the Home panel with Show all; old saves (v5) load with an empty feed that starts filling immediately.
- [ ] **Step 3: Tag**

```bash
git add -A
git commit -m "chore: phase 6.5 complete" --allow-empty
git tag phase-6.5
```
