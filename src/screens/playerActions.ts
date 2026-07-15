import type { GameState, Team } from '../engine/types'

export interface PlayerActionInfo {
  owner: Team | undefined
  isOwn: boolean
  canOffer: boolean
  offerPending: boolean
  listed: boolean
}

// Which actions the popup may offer for a player, from the user's vantage point.
export function playerActions(state: GameState, playerId: number): PlayerActionInfo {
  const owner = state.teams.find(t => t.playerIds.includes(playerId))
  const employed = state.manager.employed
  const isOwn = employed && owner != null && owner.id === state.userTeamId
  const canOffer = employed && owner != null && owner.id !== state.userTeamId
  const offerPending = state.outgoingOffers.some(o => o.playerId === playerId)
  const listed = state.transferList.some(l => l.playerId === playerId && l.sellerTeamId === state.userTeamId)
  return { owner, isOwn, canOffer, offerPending, listed }
}
