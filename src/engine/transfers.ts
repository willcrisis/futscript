import { adjustCash, marketValue, salaryFor, severanceFor, userLedger } from './finance'
import type { GameState, Player, TransferListing } from './types'

export const MIN_SQUAD = 14
export const LISTING_ROUNDS = 3
export const OFFER_ROUNDS = 2

export function transferPlayer(state: GameState, playerId: number, toTeamId: number, fee: number): GameState {
  const from = state.teams.find(t => t.playerIds.includes(playerId))!
  // Seller's squad may have shrunk below MIN_SQUAD since the player was listed
  // (e.g. via releases or other sales resolving first) — don't let this sale drop it further.
  if (from.playerIds.length <= MIN_SQUAD) return state
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

// One market tick: offers age, AI clubs list and bid, deadlines resolve.
// Task 5 adds incoming-offer generation at the marked point.
export function runTransfers(state: GameState, rand: () => number): GameState {
  let s = state

  // offers age out
  s = {
    ...s,
    incomingOffers: s.incomingOffers
      .map(o => ({ ...o, roundsLeft: o.roundsLeft - 1 }))
      .filter(o => o.roundsLeft > 0),
  }

  // [Task 5 inserts incoming-offer generation here]

  // AI clubs list players: forced sale when broke, otherwise occasional squad trim
  for (const team of s.teams) {
    if (team.id === s.userTeamId || team.playerIds.length <= MIN_SQUAD) continue
    if (s.transferList.some(l => l.sellerTeamId === team.id)) continue
    const broke = team.cash < 0
    if (!broke && rand() >= 0.05) continue
    const squad = team.playerIds.map(id => s.players[id])
    const candidate = broke
      ? [...squad].sort((a, b) => b.salary - a.salary)[0] // shed the biggest wage
      : [...squad].sort((a, b) => a.level - b.level)[0] // trim the weakest
    s = listPlayer(s, candidate.id, Math.round(marketValue(candidate) * 0.9))
  }

  // AI clubs bid (re-read each listing so later bidders see earlier bids)
  for (const team of s.teams) {
    if (team.id === s.userTeamId) continue
    for (const { playerId } of s.transferList) {
      const listing = s.transferList.find(l => l.playerId === playerId)!
      if (listing.sellerTeamId === team.id || listing.currentBidderId === team.id) continue
      if (rand() >= 0.15) continue
      const bid = requiredBid(listing)
      const valuation = Math.round(marketValue(s.players[playerId]) * (0.9 + rand() * 0.4))
      if (bid <= valuation && bid <= team.cash * 0.7 && team.playerIds.length < 22) {
        s = {
          ...s,
          transferList: s.transferList.map(l =>
            l.playerId === playerId ? { ...l, currentBid: bid, currentBidderId: team.id } : l,
          ),
        }
      }
    }
  }

  // deadlines: sell to the highest bidder or quietly delist
  const due = s.transferList.filter(l => l.roundsLeft <= 1)
  s = {
    ...s,
    transferList: s.transferList
      .filter(l => l.roundsLeft > 1)
      .map(l => ({ ...l, roundsLeft: l.roundsLeft - 1 })),
  }
  for (const l of due) {
    if (l.currentBid !== null && l.currentBidderId !== null) {
      s = transferPlayer(s, l.playerId, l.currentBidderId, l.currentBid)
    }
  }
  return s
}
