import { adjustCash, salaryFor, severanceFor, userLedger } from './finance'
import type { GameState, Player, TransferListing } from './types'

export const MIN_SQUAD = 14
export const LISTING_ROUNDS = 3

export function transferPlayer(state: GameState, playerId: number, toTeamId: number, fee: number): GameState {
  const from = state.teams.find(t => t.playerIds.includes(playerId))!
  const player = state.players[playerId]
  let teams = state.teams.map(t => {
    if (t.id === from.id) {
      return { ...t, playerIds: t.playerIds.filter(id => id !== playerId), lineup: t.lineup.filter(id => id !== playerId) }
    }
    if (t.id === toTeamId) return { ...t, playerIds: [...t.playerIds, playerId] }
    return t
  })
  teams = adjustCash(teams, from.id, fee)
  teams = adjustCash(teams, toTeamId, -fee)

  let finances = state.finances
  if (from.id === state.userTeamId) finances = userLedger(state, `Sold ${player.name}`, fee)
  else if (toTeamId === state.userTeamId) finances = userLedger(state, `Signed ${player.name}`, -fee)

  return {
    ...state,
    teams,
    finances,
    players: { ...state.players, [playerId]: { ...player, contractSeasons: 2 } },
    transferList: state.transferList.filter(l => l.playerId !== playerId),
    incomingOffers: state.incomingOffers.filter(o => o.playerId !== playerId),
  }
}

export function listPlayer(state: GameState, playerId: number, minPrice: number): GameState {
  const owner = state.teams.find(t => t.playerIds.includes(playerId))
  if (!owner || minPrice <= 0) return state
  if (owner.playerIds.length <= MIN_SQUAD) return state
  if (state.transferList.some(l => l.playerId === playerId)) return state
  return {
    ...state,
    transferList: [...state.transferList, {
      playerId,
      sellerTeamId: owner.id,
      minPrice,
      currentBid: null,
      currentBidderId: null,
      roundsLeft: LISTING_ROUNDS,
    }],
  }
}

export function requiredBid(listing: TransferListing): number {
  return listing.currentBid === null ? listing.minPrice : Math.round(listing.currentBid * 1.1)
}

export function placeBid(state: GameState, playerId: number, amount: number): GameState {
  const listing = state.transferList.find(l => l.playerId === playerId)
  if (!listing || listing.sellerTeamId === state.userTeamId) return state
  const user = state.teams.find(t => t.id === state.userTeamId)!
  if (amount < requiredBid(listing) || amount > user.cash) return state
  return {
    ...state,
    transferList: state.transferList.map(l =>
      l.playerId === playerId ? { ...l, currentBid: amount, currentBidderId: state.userTeamId } : l,
    ),
  }
}

export function releasePlayer(state: GameState, playerId: number): GameState {
  const user = state.teams.find(t => t.id === state.userTeamId)!
  if (!user.playerIds.includes(playerId) || user.playerIds.length <= MIN_SQUAD) return state
  const p = state.players[playerId]
  const severance = severanceFor(p)
  const players = { ...state.players }
  delete players[playerId]
  return {
    ...state,
    players,
    teams: adjustCash(
      state.teams.map(t =>
        t.id === user.id
          ? { ...t, playerIds: t.playerIds.filter(id => id !== playerId), lineup: t.lineup.filter(id => id !== playerId) }
          : t,
      ),
      user.id,
      -severance,
    ),
    finances: userLedger(state, `Released ${p.name} (severance)`, -severance),
    transferList: state.transferList.filter(l => l.playerId !== playerId),
    incomingOffers: state.incomingOffers.filter(o => o.playerId !== playerId),
  }
}

export function renewalSalary(p: Player): number {
  return Math.round(Math.max(p.salary, salaryFor(p.level)) * 1.1)
}

export function renewContract(state: GameState, playerId: number): GameState {
  const user = state.teams.find(t => t.id === state.userTeamId)!
  const p = state.players[playerId]
  if (!user.playerIds.includes(playerId) || p.contractSeasons > 1) return state
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: { ...p, salary: renewalSalary(p), contractSeasons: p.contractSeasons + 2 },
    },
  }
}
