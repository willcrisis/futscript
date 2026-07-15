import { describe, expect, it } from 'vitest'
import { newGame } from '../engine/newGame'
import { playerActions } from './playerActions'

describe('playerActions', () => {
  it("flags the user's own player, not offerable", () => {
    const s = newGame(1)
    const ownId = s.teams.find(t => t.id === s.userTeamId)!.playerIds[0]
    expect(playerActions(s, ownId)).toMatchObject({ isOwn: true, canOffer: false })
  })

  it('flags an AI-owned player as offerable', () => {
    const s = newGame(1)
    const aiId = s.teams.find(t => t.id !== s.userTeamId)!.playerIds[0]
    expect(playerActions(s, aiId)).toMatchObject({ isOwn: false, canOffer: true, offerPending: false })
  })

  it('reflects a pending outgoing offer', () => {
    const s = newGame(1)
    const aiId = s.teams.find(t => t.id !== s.userTeamId)!.playerIds[0]
    const s2 = { ...s, outgoingOffers: [{ playerId: aiId, bidderTeamId: s.userTeamId, amount: 1, roundsLeft: 3 }] }
    expect(playerActions(s2, aiId).offerPending).toBe(true)
  })

  it('reflects a listed own player', () => {
    const s = newGame(1)
    const ownId = s.teams.find(t => t.id === s.userTeamId)!.playerIds[0]
    const s2 = { ...s, transferList: [{ playerId: ownId, sellerTeamId: s.userTeamId, minPrice: 1, currentBid: null, currentBidderId: null, roundsLeft: 3 }] }
    expect(playerActions(s2, ownId).listed).toBe(true)
  })

  it('offers nothing when unemployed', () => {
    const s = newGame(1)
    const aiId = s.teams.find(t => t.id !== s.userTeamId)!.playerIds[0]
    const s2 = { ...s, manager: { ...s.manager, employed: false } }
    expect(playerActions(s2, aiId)).toMatchObject({ isOwn: false, canOffer: false })
  })
})
