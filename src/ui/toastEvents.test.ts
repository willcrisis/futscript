import { beforeEach, describe, expect, it } from 'vitest'
import { newGame } from '../engine/newGame'
import type { FinanceEntry, GameState, Offer, TransferListing } from '../engine/types'
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

  it('warns when a rival covers the user\'s leading bid on a still-listed player', () => {
    const playerId = base.teams[16].playerIds[0] // a Division 2 club, never the user
    const listing: TransferListing = {
      playerId, sellerTeamId: 16, minPrice: 100_000, currentBid: 100_000,
      currentBidderId: base.userTeamId, userBid: 100_000, roundsLeft: 3,
    }
    const prev: GameState = { ...base, transferList: [listing] }
    const next: GameState = {
      ...base,
      transferList: [{ ...listing, currentBid: 120_000, currentBidderId: 17 }],
    }
    const toasts = detectToasts(prev, next)
    expect(toasts.some(t => t.tone === 'warn')).toBe(true)
  })

  it('does not warn while the user is still leading the listing', () => {
    const playerId = base.teams[16].playerIds[0]
    const listing: TransferListing = {
      playerId, sellerTeamId: 16, minPrice: 100_000, currentBid: 100_000,
      currentBidderId: base.userTeamId, userBid: 100_000, roundsLeft: 3,
    }
    const prev: GameState = { ...base, transferList: [listing] }
    const next: GameState = { ...base, transferList: [{ ...listing, roundsLeft: 2 }] }
    expect(detectToasts(prev, next)).toHaveLength(0)
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
