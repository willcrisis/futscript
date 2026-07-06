import { useEffect, useState } from 'react'
import { newGame } from './engine/newGame'
import { load, save } from './engine/save'
import { advanceRound, newSeason, totalRounds } from './engine/season'
import { standings } from './engine/standings'
import type { GameState } from './engine/types'
import FixturesScreen from './screens/FixturesScreen'
import SquadScreen from './screens/SquadScreen'
import TableScreen from './screens/TableScreen'

type Screen = 'squad' | 'table' | 'fixtures'

export default function App() {
  const [state, setState] = useState<GameState>(() => load() ?? newGame(Date.now() % 2147483647))
  const [screen, setScreen] = useState<Screen>('table')
  useEffect(() => { save(state) }, [state])

  const userTeam = state.teams.find(t => t.id === state.userTeamId)!
  const total = totalRounds(state)
  const seasonOver = state.round > total
  const champion = seasonOver ? state.teams.find(t => t.id === standings(state)[0].teamId)! : null

  return (
    <div className="app">
      <header>
        <h1>Futscript</h1>
        <span>
          {userTeam.name} — Season {state.season}, Round {Math.min(state.round, total)}/{total}
        </span>
        {seasonOver
          ? <button onClick={() => setState(newSeason)}>New Season</button>
          : <button onClick={() => setState(advanceRound)}>Advance Round</button>}
      </header>
      {champion && <div className="banner">🏆 {champion.name} are the season {state.season} champions!</div>}
      <nav>
        {(['squad', 'table', 'fixtures'] as Screen[]).map(s => (
          <button key={s} className={screen === s ? 'active' : ''} onClick={() => setScreen(s)}>
            {s}
          </button>
        ))}
      </nav>
      {screen === 'squad' && <SquadScreen state={state} setState={setState} />}
      {screen === 'table' && <TableScreen state={state} />}
      {screen === 'fixtures' && <FixturesScreen state={state} />}
    </div>
  )
}
