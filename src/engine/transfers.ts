import { adjustCash, marketValue, salaryFor, severanceFor, userLedger } from './finance'
import { pushNews } from './news'
import type { GameState, Player, TransferListing } from './types'
import { isManaged } from './types'

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
  if (isManaged(state, from.id)) finances = userLedger(state, `Sold ${player.name}`, fee)
  else if (isManaged(state, toTeamId)) finances = userLedger(state, `Signed ${player.name}`, -fee)

  let result: GameState = {
    ...state,
    teams,
    finances,
    players: { ...state.players, [playerId]: { ...player, contractSeasons: 2 } },
    transferList: state.transferList.filter(l => l.playerId !== playerId),
    incomingOffers: state.incomingOffers.filter(o => o.playerId !== playerId),
  }

  const userDivision = state.teams.find(t => t.id === state.userTeamId)!.division
  const buyer = state.teams.find(t => t.id === toTeamId)!
  if (isManaged(state, from.id)) {
    result = pushNews(result, 'userSold', { player: player.name, amount: fee })
  } else if (isManaged(state, toTeamId)) {
    result = pushNews(result, 'userSigned', { player: player.name, amount: fee })
  } else if (from.division === userDivision || buyer.division === userDivision) {
    result = pushNews(result, 'rivalTransfer', { player: player.name, from: from.name, to: buyer.name, amount: fee })
  }
  return result
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

export function delistPlayer(state: GameState, playerId: number): GameState {
  const listing = state.transferList.find(l => l.playerId === playerId)
  if (!listing || listing.sellerTeamId !== state.userTeamId) return state
  return { ...state, transferList: state.transferList.filter(l => l.playerId !== playerId) }
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
      l.playerId === playerId ? { ...l, currentBid: amount, currentBidderId: state.userTeamId, userBid: amount } : l,
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

export function makeOffer(state: GameState, playerId: number, amount: number): GameState {
  if (!state.manager.employed) return state
  const owner = state.teams.find(t => t.playerIds.includes(playerId))
  const user = state.teams.find(t => t.id === state.userTeamId)!
  if (!owner || owner.id === state.userTeamId) return state // only AI-owned players
  if (amount <= 0 || amount > user.cash) return state
  if (state.outgoingOffers.some(o => o.playerId === playerId)) return state // one bid at a time
  return {
    ...state,
    outgoingOffers: [...state.outgoingOffers, { playerId, bidderTeamId: state.userTeamId, amount, roundsLeft: OFFER_ROUNDS }],
  }
}

export function renewalSalary(p: Player): number {
  return Math.round(Math.max(p.salary, salaryFor(p.level)) * 1.1)
}

export function renewContract(state: GameState, playerId: number): GameState {
  const user = state.teams.find(t => t.id === state.userTeamId)!
  const p = state.players[playerId]
  if (!user.playerIds.includes(playerId) || p.contractSeasons > 1) return state
  const salary = renewalSalary(p)
  return pushNews(
    {
      ...state,
      players: {
        ...state.players,
        [playerId]: { ...p, salary, contractSeasons: p.contractSeasons + 2 },
      },
    },
    'userRenewed',
    { player: p.name, salary },
  )
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

  // the user's outgoing offers: each selling club accepts or rejects this tick
  const outgoing = s.outgoingOffers
  s = { ...s, outgoingOffers: [] }
  for (const offer of outgoing) {
    const seller = s.teams.find(t => t.playerIds.includes(offer.playerId))
    if (!seller || seller.id === s.userTeamId) continue // player already moved/gone
    const user = s.teams.find(t => t.id === s.userTeamId)!
    const player = s.players[offer.playerId]
    const value = marketValue(player)
    const keyMult = player.level >= 60 ? 1.4 : 1.1 // ponytail: key players cost a premium
    const accept =
      seller.playerIds.length > MIN_SQUAD &&
      offer.amount >= Math.round(value * keyMult) &&
      offer.amount <= user.cash
    if (accept) {
      s = transferPlayer(s, offer.playerId, s.userTeamId, offer.amount)
      // transferPlayer announces the signing as `userSigned`; drop that in favour of the
      // negotiation-framed `offerAccepted` so an accepted bid surfaces exactly one notification.
      const last = s.news[s.news.length - 1]
      if (last?.type === 'userSigned' && last.params.player === player.name) {
        s = { ...s, news: s.news.slice(0, -1) }
      }
      s = pushNews(s, 'offerAccepted', { club: seller.name, player: player.name, amount: offer.amount })
    } else {
      s = pushNews(s, 'offerRejected', { club: seller.name, player: player.name })
    }
  }

  // occasionally an AI club knocks on the user's door
  if (s.manager.employed && rand() < 0.15) {
    const user = s.teams.find(t => t.id === s.userTeamId)!
    const suitors = s.teams.filter(t => t.id !== s.userTeamId && t.cash > 200_000)
    if (suitors.length > 0 && user.playerIds.length > MIN_SQUAD) {
      const suitor = suitors[Math.floor(rand() * suitors.length)]
      const targetId = user.playerIds[Math.floor(rand() * user.playerIds.length)]
      const amount = Math.round(marketValue(s.players[targetId]) * (0.85 + rand() * 0.45))
      const alreadyWanted = s.incomingOffers.some(o => o.playerId === targetId)
      const alreadyListed = s.transferList.some(l => l.playerId === targetId)
      if (!alreadyWanted && !alreadyListed && amount <= suitor.cash) {
        s = {
          ...s,
          incomingOffers: [...s.incomingOffers, { playerId: targetId, bidderTeamId: suitor.id, amount, roundsLeft: OFFER_ROUNDS }],
        }
        s = pushNews(s, 'offerReceived', { bidder: suitor.name, player: s.players[targetId].name, amount })
      }
    }
  }

  // AI clubs list players: forced sale when broke, otherwise occasional squad trim
  for (const team of s.teams) {
    if (isManaged(s, team.id) || team.playerIds.length <= MIN_SQUAD) continue
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
    if (isManaged(s, team.id)) continue
    for (const { playerId } of s.transferList) {
      const listing = s.transferList.find(l => l.playerId === playerId)!
      if (listing.sellerTeamId === team.id || listing.currentBidderId === team.id) continue
      if (rand() >= 0.15) continue
      const bid = requiredBid(listing)
      const valuation = Math.round(marketValue(s.players[playerId]) * (0.9 + rand() * 0.4))
      if (bid <= valuation && bid <= team.cash * 0.7 && team.playerIds.length < 22) {
        const wasUserLeading = listing.currentBidderId === s.userTeamId
        s = {
          ...s,
          transferList: s.transferList.map(l =>
            l.playerId === playerId ? { ...l, currentBid: bid, currentBidderId: team.id } : l,
          ),
        }
        if (wasUserLeading) s = pushNews(s, 'userOutbid', { player: s.players[playerId].name })
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

export function acceptOffer(state: GameState, playerId: number, bidderTeamId: number): GameState {
  const offer = state.incomingOffers.find(o => o.playerId === playerId && o.bidderTeamId === bidderTeamId)
  const user = state.teams.find(t => t.id === state.userTeamId)!
  if (!offer || user.playerIds.length <= MIN_SQUAD) return state
  return transferPlayer(state, playerId, bidderTeamId, offer.amount) // clears every offer for the player
}

export function rejectOffer(state: GameState, playerId: number, bidderTeamId: number): GameState {
  return {
    ...state,
    incomingOffers: state.incomingOffers.filter(o => !(o.playerId === playerId && o.bidderTeamId === bidderTeamId)),
  }
}

// counter = put him on the market at a premium; the suitor can bid like anyone else
export function counterOffer(state: GameState, playerId: number, bidderTeamId: number): GameState {
  const offer = state.incomingOffers.find(o => o.playerId === playerId && o.bidderTeamId === bidderTeamId)
  if (!offer) return state
  return listPlayer(rejectOffer(state, playerId, bidderTeamId), playerId, Math.round(offer.amount * 1.2))
}
