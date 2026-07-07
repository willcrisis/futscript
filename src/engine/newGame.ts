import { drawFirstCupRound } from './cup'
import { salaryFor, STARTING_CASH } from './finance'
import { generateDivisionFixtures } from './fixtures'
import { autoPick } from './lineup'
import { randomName, TEAM_NAMES } from './names'
import { mulberry32, randInt } from './rng'
import { INITIAL_CAPACITY } from './stadium'
import type { GameState, Player, Position, Team } from './types'

// 2 GK, 6 DF, 6 MF, 4 FW — enough to fill every formation in FORMATIONS
export const SQUAD_TEMPLATE: Position[] = [
  'GK', 'GK',
  'DF', 'DF', 'DF', 'DF', 'DF', 'DF',
  'MF', 'MF', 'MF', 'MF', 'MF', 'MF',
  'FW', 'FW', 'FW', 'FW',
]

// ids 0-15 are Division 3 (the user's club is teams[0]), 16-31 Division 2, 32-47 Division 1
const DIVISION_OF = (index: number) => (index < 16 ? 3 : index < 32 ? 2 : 1)
export const LEVEL_RANGE: Record<number, [number, number]> = { 1: [45, 75], 2: [38, 68], 3: [30, 60] }

export function newGame(seed: number): GameState {
  const rand = mulberry32(seed)
  const players: Record<number, Player> = {}
  const teams: Team[] = []
  let nextPlayerId = 1

  for (let t = 0; t < 48; t++) {
    const division = DIVISION_OF(t)
    const playerIds: number[] = []
    for (const position of SQUAD_TEMPLATE) {
      const level = randInt(rand, LEVEL_RANGE[division][0], LEVEL_RANGE[division][1])
      const player: Player = {
        id: nextPlayerId++,
        name: randomName(rand),
        age: randInt(rand, 17, 34),
        position,
        level,
        form: 0,
        fitness: 100,
        injuredForRounds: 0,
        suspendedForRounds: 0,
        yellowCards: 0,
        salary: salaryFor(level),
        contractSeasons: randInt(rand, 1, 3),
        seasonGoals: 0,
      }
      players[player.id] = player
      playerIds.push(player.id)
    }
    teams.push({
      id: t, name: TEAM_NAMES[t], playerIds, formation: '4-4-2', lineup: [], tactic: 'normal', trainingStyle: 'normal', cash: STARTING_CASH, division,
      capacity: INITIAL_CAPACITY[division],
      ticketPrice: 15,
      fanMood: 50,
    })
  }

  for (const team of teams) team.lineup = autoPick(team, players)

  return {
    version: 5,
    seed,
    rngState: randInt(rand, 1, 2 ** 31 - 1),
    season: 1,
    round: 1,
    userTeamId: teams[0].id, // ponytail: user always gets team 0; team-picker screen deferred
    players,
    teams,
    fixtures: [3, 2, 1].flatMap(d =>
      generateDivisionFixtures(teams.filter(t => t.division === d).map(t => t.id), rand),
    ),
    cupFixtures: drawFirstCupRound(teams, rand),
    history: [],
    playFriendlies: false,
    transferList: [],
    incomingOffers: [],
    loanBalance: 0,
    brokeRounds: 0,
    gameOver: false,
    finances: [],
    construction: null,
    allTimeScorers: [],
  }
}
