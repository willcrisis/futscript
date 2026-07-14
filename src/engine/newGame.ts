import { drawFirstCupRound } from './cup'
import { salaryFor, STARTING_CASH } from './finance'
import { generateDivisionFixtures } from './fixtures'
import { autoPick } from './lineup'
import { randomName, TEAM_NAMES } from './names'
import { mulberry32, randInt } from './rng'
import { INITIAL_CAPACITY } from './stadium'
import type { GameState, Player, Position, Team } from './types'
import { isActive } from './types'

// 2 GK, 6 DF, 6 MF, 4 FW — enough to fill every formation in FORMATIONS
export const SQUAD_TEMPLATE: Position[] = [
  'GK', 'GK',
  'DF', 'DF', 'DF', 'DF', 'DF', 'DF',
  'MF', 'MF', 'MF', 'MF', 'MF', 'MF',
  'FW', 'FW', 'FW', 'FW',
]

// ids 0-15 = Division 4 (user's club is a random draw among them), 16-31 D3, 32-47 D2, 48-63 D1
const DIVISION_OF = (index: number) => (index < 16 ? 4 : index < 32 ? 3 : index < 48 ? 2 : 1)
export const LEVEL_RANGE: Record<number, [number, number]> = {
  1: [58, 80], // span 22
  2: [46, 66], // span 20
  3: [40, 52], // span 12 — ponytail: lower divisions kept uniformly weak
  4: [30, 40], // span 10
}

export function newGame(seed: number): GameState {
  const rand = mulberry32(seed)
  const players: Record<number, Player> = {}
  const teams: Team[] = []
  let nextPlayerId = 1

  for (let t = 0; t < 64; t++) {
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
      manager: randomName(rand),
      managerHiredSeason: 0,
    })
  }

  // four clubs wait in the demotion pool so D4 stays at 16 from the first rollover (they rejoin season 2)
  for (let t = 64; t < 68; t++) {
    const playerIds: number[] = []
    for (const position of SQUAD_TEMPLATE) {
      const level = randInt(rand, LEVEL_RANGE[4][0], LEVEL_RANGE[4][1])
      const player: Player = {
        id: nextPlayerId++, name: randomName(rand), age: randInt(rand, 17, 34), position, level,
        form: 0, fitness: 100, injuredForRounds: 0, suspendedForRounds: 0, yellowCards: 0,
        salary: salaryFor(level), contractSeasons: randInt(rand, 1, 3), seasonGoals: 0,
      }
      players[player.id] = player
      playerIds.push(player.id)
    }
    teams.push({
      id: t, name: TEAM_NAMES[t], playerIds, formation: '4-4-2', lineup: [], tactic: 'normal',
      trainingStyle: 'normal', cash: STARTING_CASH, division: 4, capacity: INITIAL_CAPACITY[4],
      ticketPrice: 15, fanMood: 50, manager: randomName(rand), managerHiredSeason: 0,
      poolReturn: 2,
    })
  }

  for (const team of teams) team.lineup = autoPick(team, players)

  const fixtures = [4, 3, 2, 1].flatMap(d =>
    generateDivisionFixtures(teams.filter(t => t.division === d && isActive(t, 1)).map(t => t.id), rand),
  )
  const cupFixtures = drawFirstCupRound(teams, rand)

  // The user's own manager name is drawn here, AFTER every world-shaping draw above
  // (teams/players/fixtures/cup) and BEFORE the user-club draw below.
  const managerName = randomName(rand)

  // Random Division 4 starting club, drawn with the world's own rand AFTER every other
  // draw above (teams/players/fixtures/cup/manager name) so the world itself is unaffected
  // by this pick for a given seed — only userTeamId and the captured rngState below differ.
  // This MUST stay the very last rand consumption before rngState is captured, or
  // determinism breaks (rngState would no longer reflect "one draw past this point").
  const divisionFour = teams.filter(t => t.division === 4 && isActive(t, 1))
  const userTeamId = divisionFour[randInt(rand, 0, divisionFour.length - 1)].id

  return {
    version: 8,
    seed,
    rngState: randInt(rand, 1, 2 ** 31 - 1),
    season: 1,
    round: 1,
    userTeamId,
    players,
    teams,
    fixtures,
    cupFixtures,
    history: [],
    transferList: [],
    incomingOffers: [],
    outgoingOffers: [],
    loanBalance: 0,
    brokeRounds: 0,
    finances: [],
    construction: null,
    allTimeScorers: [],
    news: [],
    manager: { name: managerName, reputation: 30, confidence: 60, employed: true, hiredSeason: 0, jobOffers: [] },
    unemployedPool: [],
  }
}
