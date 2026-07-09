# Balanced Home/Away Fixtures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop long home/away streaks (a fresh career opened with 6 straight away games; another had an all-home first half and all-away second half).

**Architecture:** Keep the circle-method pairings but replace the flawed `(r + m) % 2` venue heuristic with a greedy per-round balancer that avoids extending a team's current venue and keeps home counts even. The second leg stays the venue-mirror of the first, which — once the first leg is balanced — no longer produces block streaks.

**Tech Stack:** TypeScript, Vitest.

## Global Constraints

- Engine stays pure; randomness threaded through `rand`. Fully self-contained; independent of the other batch plans.
- Typecheck `npx tsc -b --force`; tests `npm test`.

## File Structure

| File | Change |
|------|--------|
| `src/engine/fixtures.ts` | `generateFixtures` venue assignment |
| `src/engine/fixtures.test.ts` | balance + streak assertions |

---

### Task 1: Greedy venue balancer

**Files:**
- Modify: `src/engine/fixtures.ts` (`generateFixtures`)
- Test: `src/engine/fixtures.test.ts`

**Interfaces:**
- `generateFixtures(teamIds, rand)` keeps its signature and its double round-robin (every pair plays home and away); only venue assignment changes.

- [ ] **Step 1: Write the failing test**

Append to `src/engine/fixtures.test.ts` (imports `generateFixtures`, `mulberry32`):
```ts
describe('home/away balance', () => {
  it('gives every club a near-even home split with no long streaks in the first leg', () => {
    const ids = Array.from({ length: 16 }, (_, i) => i)
    const fx = generateFixtures(ids, mulberry32(1))
    const firstLegRounds = ids.length - 1 // 15

    for (const id of ids) {
      const legGames = fx
        .filter(f => f.round <= firstLegRounds && (f.homeId === id || f.awayId === id))
        .sort((a, b) => a.round - b.round)
      expect(legGames).toHaveLength(firstLegRounds)

      const homes = legGames.filter(f => f.homeId === id).length
      // 15 games → 7 or 8 home
      expect(homes).toBeGreaterThanOrEqual(7)
      expect(homes).toBeLessThanOrEqual(8)

      // no more than two consecutive home or away
      let streak = 1
      let maxStreak = 1
      for (let i = 1; i < legGames.length; i++) {
        const prevHome = legGames[i - 1].homeId === id
        const curHome = legGames[i].homeId === id
        streak = prevHome === curHome ? streak + 1 : 1
        maxStreak = Math.max(maxStreak, streak)
      }
      expect(maxStreak).toBeLessThanOrEqual(2)
    }
  })

  it('still schedules a full double round-robin', () => {
    const ids = Array.from({ length: 16 }, (_, i) => i)
    const fx = generateFixtures(ids, mulberry32(2))
    expect(fx).toHaveLength(16 * 15) // 240 fixtures
    // each ordered pair (home, away) appears exactly once
    const seen = new Set(fx.map(f => `${f.homeId}-${f.awayId}`))
    expect(seen.size).toBe(16 * 15)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/engine/fixtures.test.ts`
Expected: FAIL — the current heuristic lets some clubs streak well past 2 (the reported bug).

- [ ] **Step 3: Implement**

Replace `generateFixtures` in `src/engine/fixtures.ts` with a version that builds the circle-method pairings, then assigns venues greedily:
```ts
export function generateFixtures(teamIds: number[], rand: () => number): Fixture[] {
  const ids = [...teamIds]
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
  }

  const n = ids.length
  const half = n / 2
  const rounds = n - 1

  // circle method: collect who-plays-whom per round (venue decided next)
  let rot = ids.slice(1)
  const pairingsByRound: [number, number][][] = []
  for (let r = 0; r < rounds; r++) {
    const left = [ids[0], ...rot.slice(0, half - 1)]
    const right = rot.slice(half - 1).reverse()
    pairingsByRound.push(Array.from({ length: half }, (_, m) => [left[m], right[m]] as [number, number]))
    rot = [rot[rot.length - 1], ...rot.slice(0, -1)]
  }

  // greedy venue balancer: avoid extending a club's current venue; break ties by fewer homes so far.
  const homeCount = new Map<number, number>(ids.map(id => [id, 0]))
  const lastVenue = new Map<number, 'H' | 'A' | null>(ids.map(id => [id, null]))
  const fixtures: Fixture[] = []
  pairingsByRound.forEach((pairs, r) => {
    for (const [x, y] of pairs) {
      const xJustHome = lastVenue.get(x) === 'H'
      const yJustHome = lastVenue.get(y) === 'H'
      let homeId: number
      let awayId: number
      if (xJustHome && !yJustHome) { homeId = y; awayId = x }
      else if (yJustHome && !xJustHome) { homeId = x; awayId = y }
      else if (homeCount.get(x)! !== homeCount.get(y)!) {
        ;[homeId, awayId] = homeCount.get(x)! < homeCount.get(y)! ? [x, y] : [y, x]
      } else {
        ;[homeId, awayId] = x < y ? [x, y] : [y, x]
      }
      homeCount.set(homeId, homeCount.get(homeId)! + 1)
      lastVenue.set(homeId, 'H')
      lastVenue.set(awayId, 'A')
      // first leg now, reverse leg mirrored a half-season later
      fixtures.push({ round: r + 1, homeId, awayId, homeGoals: null, awayGoals: null })
      fixtures.push({ round: r + 1 + rounds, homeId: awayId, awayId: homeId, homeGoals: null, awayGoals: null })
    }
  })

  return fixtures.sort((a, b) => a.round - b.round)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/engine/fixtures.test.ts`
Expected: PASS. Then `npm test` — `generateDivisionFixtures` (which remaps rounds onto `LEAGUE_WEEKS`) is unchanged, and standings/season tests don't depend on venue ordering.

- [ ] **Step 5: Commit**
```bash
git add src/engine/fixtures.ts src/engine/fixtures.test.ts
git commit -m "fix(engine): balance home/away so no club streaks venues"
```

---

## Final verification

- [ ] `npm test` — all green.
- [ ] `npx tsc -b --force` — no errors.
- [ ] Headless: generate several divisions across seeds; every club's first-leg home count is 7–8 and no venue streak exceeds 2.
