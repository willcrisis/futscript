# Cup Extra Time & Shootout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve drawn cup ties with 30 minutes of extra time and, if still level, a simulated penalty shootout — replacing the coin-flip — and show it all in the match screen.

**Architecture:** Extract the per-minute simulation from `simulateMatch` into a shared `playMinutes` so a cup resolver can continue the same sides into extra time (red cards and subs carry over). A shootout plays 5 kicks each, then sudden-death rounds where both teams kick and the round decides only when one scores and the other misses. Penalty kicks become a new `MatchEvent` type rendered in the feed; the match screen extends its clock to 120 and shows the shootout score.

**Tech Stack:** TypeScript, React, Vitest.

## Global Constraints

- Engine stays pure; randomness threaded through `rand`.
- This plan is independent of the four-division work — it resolves any cup tie. It can ship before or after the world plan.
- New i18n keys → both `en.ts` and `pt.ts`.
- Per-kick conversion is a `ponytail:`-tagged constant.
- Typecheck `npx tsc -b --force`; tests `npm test`.

## File Structure

| File | Change |
|------|--------|
| `src/engine/types.ts` | `MatchEvent` gains `'penalty'` type + `scored?` |
| `src/engine/match.ts` | extract `playMinutes`; add `resolveCupTie` + shootout |
| `src/engine/season.ts` | cup block calls `resolveCupTie` |
| `src/ui/EventFeed.tsx` | render penalty events |
| `src/screens/MatchScreen.tsx` | clock to 120; shootout score |
| `src/i18n/en.ts`, `src/i18n/pt.ts` | penalty strings |

---

### Task 1: `MatchEvent` gains a penalty type

**Files:**
- Modify: `src/engine/types.ts` (`MatchEvent`)

**Interfaces:**
- Produces: `MatchEvent.type` includes `'penalty'`; optional `scored?: boolean` marks whether a penalty kick was converted.

- [ ] **Step 1: Update the type**

In `src/engine/types.ts`, extend `MatchEvent`:
```ts
export interface MatchEvent {
  minute: number
  type: 'goal' | 'chance' | 'yellow' | 'red' | 'injury' | 'penalty'
  teamId: number
  playerId: number
  playerInId?: number // injury replacement, if a substitute came on
  scored?: boolean // for 'penalty' events: true = converted, false = missed
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b --force`
Expected: no errors (the `switch` in `EventFeed` will be handled in Task 4; TypeScript won't error yet because those switches have no exhaustiveness guard — verify by running the app later).

- [ ] **Step 3: Commit**
```bash
git add src/engine/types.ts
git commit -m "feat(engine): add penalty MatchEvent type"
```

---

### Task 2: Extract `playMinutes` and add `resolveCupTie`

**Files:**
- Modify: `src/engine/match.ts`
- Test: `src/engine/match.test.ts`

**Interfaces:**
- Consumes: `MatchEvent` `'penalty'` (Task 1).
- Produces:
  - `resolveCupTie(home: Team, away: Team, players: Record<number, Player>, rand: () => number): { homeGoals: number; awayGoals: number; winnerId: number; events: MatchEvent[] }` — plays 90', then extra time on a draw, then a shootout; always returns a `winnerId`.
- `simulateMatch` keeps its exact signature and behaviour (now delegating to `playMinutes`), so league simulation and existing tests are unaffected.

- [ ] **Step 1: Write the failing test**

Append to `src/engine/match.test.ts` (imports `simulateMatch`, `mulberry32`; add `resolveCupTie`). Two evenly-matched teams forced to a decision:
```ts
import { resolveCupTie } from './match'

describe('resolveCupTie', () => {
  it('always names a winner, even from a dead-even draw', () => {
    // build two identical low-event teams and run many seeds; every tie yields a winner
    const { home, away, players } = evenTeams() // helper below or reuse an existing fixture
    for (let seed = 1; seed <= 20; seed++) {
      const r = resolveCupTie(home, away, players, mulberry32(seed))
      expect(r.winnerId === home.id || r.winnerId === away.id).toBe(true)
    }
  })

  it('emits penalty events when a tie is level after extra time', () => {
    const { home, away, players } = evenTeams()
    // find a seed that reaches penalties (level after 120')
    let sawPens = false
    for (let seed = 1; seed <= 50 && !sawPens; seed++) {
      const r = resolveCupTie(home, away, players, mulberry32(seed))
      const pens = r.events.filter(e => e.type === 'penalty')
      if (pens.length > 0) {
        sawPens = true
        // both teams took at least 5 kicks
        expect(pens.filter(e => e.teamId === home.id).length).toBeGreaterThanOrEqual(5)
        expect(pens.filter(e => e.teamId === away.id).length).toBeGreaterThanOrEqual(5)
      }
    }
    expect(sawPens).toBe(true)
  })
})
```
Add an `evenTeams()` helper to the test file if one isn't already available (two 11-player squads of equal level; reuse the pattern from `match.test.ts`'s existing setup — build via `makeSquad`-style objects with `lineup` set to 11 ids).

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/engine/match.test.ts`
Expected: FAIL — `resolveCupTie` not exported.

- [ ] **Step 3: Refactor `simulateMatch` + add the resolver**

In `src/engine/match.ts`, extract the per-minute work. Replace the body of `simulateMatch`'s double loop with calls to new helpers:
```ts
function playMinuteForSide(side: Side, opp: Side, minute: number, events: MatchEvent[], rand: () => number) {
  if (side.active.length === 0) return
  const att = attack(side) ** 2
  const def = defense(opp) ** 2
  const share = att / (att + def)

  if (rand() < CHANCE_RATE * share) {
    const shooter = pickWeighted(side.active, p => SCORER_WEIGHT[p.position], rand)
    if (rand() < CONVERSION) {
      side.goals++
      events.push({ minute, type: 'goal', teamId: side.team.id, playerId: shooter.id })
    } else {
      events.push({ minute, type: 'chance', teamId: side.team.id, playerId: shooter.id })
    }
  }

  if (rand() < YELLOW_P) {
    const culprit = pickUniform(side.active, rand)
    if (side.yellowed.has(culprit.id)) {
      side.active = side.active.filter(p => p.id !== culprit.id)
      events.push({ minute, type: 'red', teamId: side.team.id, playerId: culprit.id })
    } else {
      side.yellowed.add(culprit.id)
      events.push({ minute, type: 'yellow', teamId: side.team.id, playerId: culprit.id })
    }
  } else if (rand() < STRAIGHT_RED_P) {
    const culprit = pickUniform(side.active, rand)
    side.active = side.active.filter(p => p.id !== culprit.id)
    events.push({ minute, type: 'red', teamId: side.team.id, playerId: culprit.id })
  }

  if (side.active.length > 0 && rand() < INJURY_P * INJURY_STYLE_MULT[side.team.trainingStyle]) {
    const victim = pickUniform(side.active, rand)
    side.active = side.active.filter(p => p.id !== victim.id)
    const sub =
      side.bench.filter(p => p.position === victim.position).sort((a, b) => b.level - a.level)[0] ??
      side.bench.sort((a, b) => b.level - a.level)[0]
    if (sub) {
      side.bench = side.bench.filter(p => p.id !== sub.id)
      side.active = [...side.active, sub]
    }
    events.push({ minute, type: 'injury', teamId: side.team.id, playerId: victim.id, playerInId: sub?.id })
  }
}

function playMinutes(sides: [Side, Side], from: number, to: number, events: MatchEvent[], rand: () => number) {
  for (let minute = from; minute <= to; minute++) {
    for (const [side, opp] of [[sides[0], sides[1]], [sides[1], sides[0]]] as const) {
      playMinuteForSide(side, opp, minute, events, rand)
    }
  }
}

export function simulateMatch(home: Team, away: Team, players: Record<number, Player>, rand: () => number): MatchResult {
  const sides: [Side, Side] = [makeSide(home, players, true), makeSide(away, players, false)]
  const events: MatchEvent[] = []
  playMinutes(sides, 1, 90, events, rand)
  return { homeGoals: sides[0].goals, awayGoals: sides[1].goals, events }
}
```
Then add the shootout and cup resolver:
```ts
// ponytail: penalties convert at ~75%, nudged a little by taker level; retune here.
const PEN_BASE = 0.75
function penaltyScored(taker: Player, rand: () => number): boolean {
  return rand() < Math.min(0.95, PEN_BASE + (taker.level - 50) * 0.002)
}

function shootout(sides: [Side, Side], events: MatchEvent[], rand: () => number): number {
  const scored = [0, 0]
  const takers: [Player[], Player[]] = [
    sides[0].active.length ? sides[0].active : sides[0].team.lineup.map(id => sides[0].active[0]),
    sides[1].active.length ? sides[1].active : sides[1].active,
  ]
  const kick = (i: 0 | 1, roundIdx: number) => {
    const pool = takers[i].length ? takers[i] : sides[i].active
    const taker = pool[roundIdx % pool.length]
    const ok = penaltyScored(taker, rand)
    if (ok) scored[i]++
    events.push({ minute: 120, type: 'penalty', teamId: sides[i].team.id, playerId: taker.id, scored: ok })
  }
  // five kicks each (play all five, then compare)
  for (let r = 0; r < 5; r++) { kick(0, r); kick(1, r) }
  // sudden death: both kick each round, decided only when one scores and the other misses
  for (let r = 5; scored[0] === scored[1]; r++) { kick(0, r); kick(1, r) }
  return scored[0] > scored[1] ? sides[0].team.id : sides[1].team.id
}

export interface CupTieResult extends MatchResult {
  winnerId: number
}

export function resolveCupTie(home: Team, away: Team, players: Record<number, Player>, rand: () => number): CupTieResult {
  const sides: [Side, Side] = [makeSide(home, players, true), makeSide(away, players, false)]
  const events: MatchEvent[] = []
  playMinutes(sides, 1, 90, events, rand)
  if (sides[0].goals !== sides[1].goals) {
    return { homeGoals: sides[0].goals, awayGoals: sides[1].goals, events, winnerId: sides[0].goals > sides[1].goals ? home.id : away.id }
  }
  // extra time: 30 minutes on the SAME sides — sendings-off and subs carry over
  playMinutes(sides, 91, 120, events, rand)
  if (sides[0].goals !== sides[1].goals) {
    return { homeGoals: sides[0].goals, awayGoals: sides[1].goals, events, winnerId: sides[0].goals > sides[1].goals ? home.id : away.id }
  }
  const winnerId = shootout(sides, events, rand)
  return { homeGoals: sides[0].goals, awayGoals: sides[1].goals, events, winnerId }
}
```
Simplify the `takers` fallback — if a side somehow has no active players (mass sendings-off), fall back to its lineup ids resolved through `players`. Write it cleanly:
```ts
  const takers: [Player[], Player[]] = [
    sides[0].active.length ? sides[0].active : sides[0].team.lineup.map(id => players[id]),
    sides[1].active.length ? sides[1].active : sides[1].team.lineup.map(id => players[id]),
  ]
```
(pass `players` into `shootout` so the fallback resolves ids; update the signature to `shootout(sides, players, events, rand)` and the call site.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/engine/match.test.ts`
Expected: PASS. Then `npm test` — `simulateMatch` behaviour is byte-identical (same rand call order for 1–90), so existing season/finance tests still pass.

- [ ] **Step 5: Commit**
```bash
git add src/engine/match.ts src/engine/match.test.ts
git commit -m "feat(engine): cup extra time + penalty shootout resolver"
```

---

### Task 3: Wire the resolver into the season cup block

**Files:**
- Modify: `src/engine/season.ts` (`advanceRound` cup simulation)
- Test: `src/engine/season.test.ts`

**Interfaces:**
- Consumes: `resolveCupTie` (Task 2).
- The cup block computes `winnerId` from `resolveCupTie` (no more `rand() < 0.5`); the stored `homeGoals`/`awayGoals` are the full-time (incl. extra-time) score.

- [ ] **Step 1: Write the failing test**

Append to `src/engine/season.test.ts` — a played cup tie must never be a scoreless-yet-winnerless draw, and a level tie must carry penalty events:
```ts
describe('cup ties are always decided', () => {
  it('every played cup fixture has a winner, and level ties show penalties', () => {
    let s = newGame(2)
    let checked = 0
    while (s.round <= 30 + 6 && checked < 3) {
      const beforeRound = s.round
      s = advanceRound(s)
      for (const f of s.cupFixtures) {
        if (f.week === beforeRound && f.homeGoals !== null) {
          expect(f.winnerId).not.toBeNull()
          if (f.homeGoals === f.awayGoals) {
            expect((f.events ?? []).some(e => e.type === 'penalty')).toBe(true)
          }
          checked++
        }
      }
    }
    expect(checked).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/engine/season.test.ts`
Expected: FAIL — a level tie is decided by coin-flip today and carries no penalty events.

- [ ] **Step 3: Implement**

In `src/engine/season.ts`, add `resolveCupTie` to the `./match` import. In the cup-fixtures `map` (the block that currently calls `simulateMatch` and then computes `winnerId` with `rand() < 0.5`), replace:
```ts
  let cupFixtures = state.cupFixtures.map(f => {
    if (f.week !== week || f.winnerId !== null) return f
    const result = simulateMatch(byId.get(f.homeId)!, byId.get(f.awayId)!, state.players, rand)
    roundEvents.push(...result.events)
    const winnerId =
      result.homeGoals > result.awayGoals ? f.homeId
      : result.awayGoals > result.homeGoals ? f.awayId
      : rand() < 0.5 ? f.homeId : f.awayId // ponytail: penalty shootout is a coin flip
    return { ...f, homeGoals: result.homeGoals, awayGoals: result.awayGoals, winnerId, events: result.events }
  })
```
with:
```ts
  let cupFixtures = state.cupFixtures.map(f => {
    if (f.week !== week || f.winnerId !== null) return f
    const result = resolveCupTie(byId.get(f.homeId)!, byId.get(f.awayId)!, state.players, rand)
    roundEvents.push(...result.events)
    return { ...f, homeGoals: result.homeGoals, awayGoals: result.awayGoals, winnerId: result.winnerId, events: result.events }
  })
```
Note `roundEvents` now includes `'penalty'` events; existing consumers (news for injuries, heavy wins) filter by their own event types, so this is safe. If `simulateMatch` is no longer referenced elsewhere in `season.ts`, drop it from the import.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/engine/season.test.ts`
Expected: PASS. Then `npm test`.

- [ ] **Step 5: Commit**
```bash
git add src/engine/season.ts src/engine/season.test.ts
git commit -m "feat(engine): cup ties resolved by extra time + shootout, not coin flip"
```

---

### Task 4: Render penalties in the match feed

**Files:**
- Modify: `src/ui/EventFeed.tsx`
- Modify: `src/i18n/en.ts`, `src/i18n/pt.ts`

**Interfaces:**
- Consumes: `MatchEvent` `'penalty'` with `scored`.

- [ ] **Step 1: Add the strings**

`src/i18n/en.ts` (near the other `event.*` keys):
```ts
  'event.penaltyScored': '{player} scores the penalty',
  'event.penaltyMissed': '{player} misses the penalty!',
```
`src/i18n/pt.ts`:
```ts
  'event.penaltyScored': '{player} converte o pênalti',
  'event.penaltyMissed': '{player} perde o pênalti!',
```

- [ ] **Step 2: Render penalty text + icon**

In `src/ui/EventFeed.tsx`, add a `case 'penalty'` to the text switch (the function returning `t('event.…')`):
```ts
    case 'penalty': return e.scored
      ? t('event.penaltyScored', { player })
      : t('event.penaltyMissed', { player })
```
And a `case 'penalty'` to `EventIcon`'s switch — a filled dot when scored, hollow when missed, reusing the goal/chance glyphs:
```tsx
    case 'penalty':
      return event.scored
        ? <span aria-hidden className={`w-4 shrink-0 text-center ${event.teamId === emphasisTeamId ? 'text-accent' : 'text-ink'}`}>◉</span>
        : <span aria-hidden className="w-4 shrink-0 text-center text-ink-faint">✕</span>
```

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc -b --force`
Expected: no errors.
```bash
git add src/ui/EventFeed.tsx src/i18n/en.ts src/i18n/pt.ts
git commit -m "feat(ui): render penalty shootout kicks in the match feed"
```

---

### Task 5: Match screen — extend clock to 120 + shootout score

**Files:**
- Modify: `src/screens/MatchScreen.tsx`
- Modify: `src/i18n/en.ts`, `src/i18n/pt.ts`

**Interfaces:**
- Consumes: fixtures whose `events` may include minutes up to 120 and `'penalty'` events.

- [ ] **Step 1: Add the string**

`src/i18n/en.ts`:
```ts
  'match.shootout': 'Won on penalties {home}–{away}',
```
`src/i18n/pt.ts`:
```ts
  'match.shootout': 'Vitória nos pênaltis {home}–{away}',
```

- [ ] **Step 2: Implement**

In `src/screens/MatchScreen.tsx`:

Compute the full length from the events (extra time pushes it to 120):
```ts
  const fullTime = (fixture.events ?? []).some(e => e.minute > 90) ? 120 : 90
  const done = minute >= fullTime
```
Replace the hard-coded `90` in the progress bar width and the minute clamp with `fullTime`:
```tsx
      <div className="h-full bg-accent transition-[width]" style={{ width: `${(minute / fullTime) * 100}%` }} />
```
```tsx
      <div className="mt-1 font-mono text-sm tabular-nums text-ink-muted">{Math.min(minute, fullTime)}'</div>
```
And in the ticking effect, the guard `m >= 90 ? m : m + 1` becomes `m >= fullTime ? m : m + 1` (and the `done` early-return already covers it).

Add the shootout score line. Derive it from the penalty events and show it when the tie went to kicks (replacing/augmenting the existing `penaltyWin` line):
```tsx
      {done && (() => {
        const pens = (fixture.events ?? []).filter(e => e.type === 'penalty')
        if (pens.length === 0) return null
        const homePens = pens.filter(e => e.teamId === fixture.homeId && e.scored).length
        const awayPens = pens.filter(e => e.teamId === fixture.awayId && e.scored).length
        return (
          <div className="mt-1 text-sm text-ink-muted">
            {t('match.shootout', { home: homePens, away: awayPens })}
          </div>
        )
      })()}
```
If the existing `match.penaltyWin` block conflicts (it renders on `homeGoals === awayGoals`), keep it only for the non-shootout case or remove it in favour of this score line — prefer this line, since it now carries the actual shootout result. (Remove the old `penaltyWin` render and its now-unused key if nothing else uses it.)

- [ ] **Step 3: Typecheck + manual check**

Run: `npx tsc -b --force`
Expected: no errors.
Manual (`npm run dev`): advance into a cup week; a drawn tie plays past 90' to 120', then shows penalty kicks in the feed and a "Won on penalties X–Y" line.

- [ ] **Step 4: Commit**
```bash
git add src/screens/MatchScreen.tsx src/i18n/en.ts src/i18n/pt.ts
git commit -m "feat(ui): match screen extends to extra time + shows shootout score"
```

---

## Final verification

- [ ] `npm test` — all green.
- [ ] `npx tsc -b --force` — no errors.
- [ ] Headless: resolve many cup ties from even squads; every tie names a winner, level ties carry ≥5 penalty events per side with a strict one-scores-one-misses sudden-death ending.
- [ ] Manual: watch a drawn cup tie go to ET and penalties in the match screen.
