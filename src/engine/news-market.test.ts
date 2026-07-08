import { describe, expect, it } from 'vitest'
import { adjustCash } from './finance'
import { newGame } from './newGame'
import { mulberry32 } from './rng'
import { advanceRound } from './season'
import { expandStadium } from './stadium'
import { listPlayer, placeBid, renewContract, runTransfers, transferPlayer } from './transfers'
import type { GameState } from './types'

function userOf(s: GameState) {
  return s.teams.find(t => t.id === s.userTeamId)!
}

describe('market news', () => {
  it('transferPlayer writes userSold / userSigned / rivalTransfer', () => {
    const s0 = newGame(1)
    const user = userOf(s0)
    const sold = transferPlayer(s0, user.playerIds[17], s0.teams.find(t => t.id !== user.id)!.id, 250_000)
    expect(sold.news.at(-1)).toMatchObject({ type: 'userSold', params: { amount: 250_000 } })

    const aiSeller = s0.teams.find(t => t.id !== user.id && t.division === user.division)!
    const bought = transferPlayer(s0, aiSeller.playerIds[0], user.id, 300_000)
    expect(bought.news.at(-1)!.type).toBe('userSigned')

    // rival-to-rival inside the user's division
    const rivals = s0.teams.filter(t => t.id !== user.id && t.division === user.division)
    const rival = transferPlayer(s0, rivals[0].playerIds[0], rivals[1].id, 100_000)
    expect(rival.news.at(-1)).toMatchObject({
      type: 'rivalTransfer',
      params: { from: rivals[0].name, to: rivals[1].name },
    })

    // cross-division AI transfer not touching the user's division: no news
    const far = s0.teams.filter(t => t.division !== user.division)
    const quiet = transferPlayer(s0, far[0].playerIds[0], far[1].id, 100_000)
    expect(quiet.news.filter(n => n.type === 'rivalTransfer')).toHaveLength(0)
  })

  it('renewContract writes userRenewed', () => {
    const s0 = newGame(1)
    const user = userOf(s0)
    const id = user.playerIds[0]
    const expiring: GameState = { ...s0, players: { ...s0.players, [id]: { ...s0.players[id], contractSeasons: 1 } } }
    const s1 = renewContract(expiring, id)
    expect(s1.news.at(-1)).toMatchObject({ type: 'userRenewed', params: { player: s0.players[id].name } })
  })

  it('a displaced user bid writes userOutbid', () => {
    const s0 = newGame(1)
    const aiClub = s0.teams.find(t => t.id !== s0.userTeamId)!
    let s = listPlayer(s0, aiClub.playerIds[0], 100_000)
    s = placeBid(s, aiClub.playerIds[0], 100_000)
    const rand = mulberry32(5)
    for (let i = 0; i < 12 && !s.news.some(n => n.type === 'userOutbid'); i++) {
      s = { ...s, transferList: s.transferList.map(l => ({ ...l, roundsLeft: 5 })) } // keep alive
      s = runTransfers(s, rand)
    }
    expect(s.news.some(n => n.type === 'userOutbid')).toBe(true)
  })

  it('offer generation writes offerReceived', () => {
    let s = newGame(21)
    const rand = mulberry32(21)
    for (let i = 0; i < 30 && !s.news.some(n => n.type === 'offerReceived'); i++) s = runTransfers(s, rand)
    const item = s.news.find(n => n.type === 'offerReceived')!
    expect(typeof item.params.bidder).toBe('string')
    expect(typeof item.params.player).toBe('string')
  })

  it('board warning fires once when patience crosses 6', () => {
    const s0 = newGame(1)
    let s: GameState = { ...s0, teams: adjustCash(s0.teams, s0.userTeamId, -50_000_000), brokeRounds: 5 }
    s = advanceRound(s) // 5 -> 6: warn
    expect(s.news.filter(n => n.type === 'boardWarning')).toHaveLength(1)
    const before = s.news.filter(n => n.type === 'boardWarning').length
    s = advanceRound(s) // 6 -> 7: no repeat
    expect(s.news.filter(n => n.type === 'boardWarning')).toHaveLength(before)
  })

  it('construction completion writes constructionDone', () => {
    let s = expandStadium(newGame(1))
    for (let i = 0; i < 6; i++) s = advanceRound(s)
    expect(s.news.some(n => n.type === 'constructionDone' && n.params.seats === 2000)).toBe(true)
  })
})
