import { salaryFor, STARTING_CASH } from './finance'
import { generateFixtures } from './fixtures'
import { autoPick } from './lineup'
import { randomName, TEAM_NAMES } from './names'
import { mulberry32, randInt } from './rng'
import type { GameState, Player, Position, Team } from './types'

// 2 GK, 6 DF, 6 MF, 4 FW — enough to fill every formation in FORMATIONS
const SQUAD_TEMPLATE: Position[] = [
  'GK', 'GK',
  'DF', 'DF', 'DF', 'DF', 'DF', 'DF',
  'MF', 'MF', 'MF', 'MF', 'MF', 'MF',
  'FW', 'FW', 'FW', 'FW',
]

export function newGame(seed: number): GameState {
  const rand = mulberry32(seed)
  const players: Record<number, Player> = {}
  const teams: Team[] = []
  let nextPlayerId = 1

  for (let t = 0; t < 16; t++) {
    const playerIds: number[] = []
    for (const position of SQUAD_TEMPLATE) {
      const level = randInt(rand, 30, 70)
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
      }
      players[player.id] = player
      playerIds.push(player.id)
    }
    teams.push({ id: t, name: TEAM_NAMES[t], playerIds, formation: '4-4-2', lineup: [], tactic: 'normal', trainingStyle: 'normal', cash: STARTING_CASH })
  }

  for (const team of teams) team.lineup = autoPick(team, players)

  return {
    version: 3,
    seed,
    rngState: randInt(rand, 1, 2 ** 31 - 1),
    season: 1,
    round: 1,
    userTeamId: teams[0].id, // ponytail: user always gets team 0; team-picker screen when someone asks
    players,
    teams,
    fixtures: generateFixtures(teams.map(t => t.id), rand),
    transferList: [],
    incomingOffers: [],
    loanBalance: 0,
    brokeRounds: 0,
    gameOver: false,
    finances: [],
  }
}
