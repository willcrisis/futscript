import type { Fixture } from './types'

// 30 league rounds + 6 cup weeks = a 36-week season
export const CUP_WEEKS = [4, 9, 14, 19, 24, 29]
export const TOTAL_WEEKS = 36
export const LEAGUE_WEEKS = Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1)
  .filter(w => !CUP_WEEKS.includes(w))

export function generateFixtures(teamIds: number[], rand: () => number): Fixture[] {
  const ids = [...teamIds]
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
  }

  const n = ids.length
  const half = n / 2
  const rounds = n - 1

  // Circle method + venue balancer run over SLOT INDICES (0..n-1), not team ids: the venue
  // pattern is therefore deterministic and the shuffle above only decides which club fills each
  // slot. (Running the balancer directly on shuffled ids let its id-order tiebreak skew a club's
  // home count per seed — the bug this replaces.)
  const slots = Array.from({ length: n }, (_, i) => i)
  let rot = slots.slice(1)
  const pairingsByRound: [number, number][][] = []
  for (let r = 0; r < rounds; r++) {
    const left = [slots[0], ...rot.slice(0, half - 1)]
    const right = rot.slice(half - 1).reverse()
    pairingsByRound.push(Array.from({ length: half }, (_, m) => [left[m], right[m]] as [number, number]))
    rot = [rot[rot.length - 1], ...rot.slice(0, -1)]
  }

  // Greedy venue balancer over slots: never give a slot a home game right after it just played
  // home, break remaining ties toward the slot with fewer homes so far, then by slot order.
  // ponytail: guaranteed only for the 16-club divisions the game actually uses — every club gets
  // a 7/8 first-leg home split with no venue streak past 2 (verified across seeds). Other even n
  // can still streak past 2 (this one-game lookback can't always break a mutual home run); revisit
  // the balancer before introducing any non-16-team division.
  const homeCount = new Map<number, number>(slots.map(s => [s, 0]))
  const lastVenue = new Map<number, 'H' | 'A' | null>(slots.map(s => [s, null]))
  const fixtures: Fixture[] = []
  pairingsByRound.forEach((pairs, r) => {
    for (const [x, y] of pairs) {
      const xJustHome = lastVenue.get(x) === 'H'
      const yJustHome = lastVenue.get(y) === 'H'
      let homeSlot: number
      let awaySlot: number
      if (xJustHome && !yJustHome) { homeSlot = y; awaySlot = x }
      else if (yJustHome && !xJustHome) { homeSlot = x; awaySlot = y }
      else if (homeCount.get(x)! !== homeCount.get(y)!) {
        ;[homeSlot, awaySlot] = homeCount.get(x)! < homeCount.get(y)! ? [x, y] : [y, x]
      } else {
        ;[homeSlot, awaySlot] = x < y ? [x, y] : [y, x]
      }
      homeCount.set(homeSlot, homeCount.get(homeSlot)! + 1)
      lastVenue.set(homeSlot, 'H')
      lastVenue.set(awaySlot, 'A')
      const homeId = ids[homeSlot]
      const awayId = ids[awaySlot]
      // first leg now, reverse leg mirrored a half-season later
      fixtures.push({ round: r + 1, homeId, awayId, homeGoals: null, awayGoals: null })
      fixtures.push({ round: r + 1 + rounds, homeId: awayId, awayId: homeId, homeGoals: null, awayGoals: null })
    }
  })

  return fixtures.sort((a, b) => a.round - b.round)
}

export function generateDivisionFixtures(teamIds: number[], rand: () => number): Fixture[] {
  return generateFixtures(teamIds, rand).map(f => ({ ...f, round: LEAGUE_WEEKS[f.round - 1] }))
}
