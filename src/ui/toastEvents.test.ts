import { beforeEach, describe, expect, it } from 'vitest'
import { newGame } from '../engine/newGame'
import type { FinanceEntry, GameState, Offer } from '../engine/types'
import { setLang } from '../i18n'
import { detectToasts } from './toastEvents'

const base = newGame(1)

beforeEach(() => setLang('en'))

function withFinances(finances: FinanceEntry[]): GameState {
  return { ...base, finances }
}

describe('detectToasts', () => {
  it('spots a sale past the 300-entry ledger cap via identity diff, not length diff', () => {
    const filler: FinanceEntry[] = Array.from({ length: 300 }, (_, i) => (
      { season: 1, round: 1, label: `Filler ${i}`, amount: 0 }
    ))
    const sold: FinanceEntry = { season: 1, round: 2, label: 'Sold Test Player', amount: 100_000 }
    const prev = withFinances(filler)
    const next = withFinances([...filler, sold].slice(-300)) // drops the oldest filler entry

    const toasts = detectToasts(prev, next)
    expect(toasts.some(t => t.text === 'Sold Test Player: +$100,000')).toBe(true)
  })

  it('announces a new incoming offer', () => {
    const offer: Offer = {
      playerId: base.teams[0].playerIds[0], bidderTeamId: base.teams[1].id, amount: 50_000, roundsLeft: 3,
    }
    const prev: GameState = { ...base, incomingOffers: [] }
    const next: GameState = { ...base, incomingOffers: [offer] }

    const toasts = detectToasts(prev, next)
    expect(toasts).toHaveLength(1)
    expect(toasts[0].tone).toBe('accent')
  })

  it('caps output at 3 toasts even when more news qualifies', () => {
    const offers: Offer[] = base.teams[1].playerIds.slice(0, 5).map((playerId, i) => (
      { playerId, bidderTeamId: base.teams[2].id, amount: 10_000 + i, roundsLeft: 3 }
    ))
    const prev: GameState = { ...base, incomingOffers: [] }
    const next: GameState = { ...base, incomingOffers: offers }

    expect(detectToasts(prev, next)).toHaveLength(3)
  })
})
