import { useEffect, useState } from 'react'
import { newGame } from './engine/newGame'
import { load, save } from './engine/save'
import { advanceRound, newSeason, totalRounds } from './engine/season'
import { standings } from './engine/standings'
import type { Fixture, GameState } from './engine/types'
import FixturesScreen from './screens/FixturesScreen'
import SquadScreen from './screens/SquadScreen'
import TableScreen from './screens/TableScreen'
import MatchScreen from './screens/MatchScreen'
import TransfersScreen from './screens/TransfersScreen'
import FinanceScreen from './screens/FinanceScreen'

type Screen = 'squad' | 'table' | 'fixtures' | 'transfers' | 'finance'

export default function App() {
  const [state, setState] = useState<GameState>(() => load() ?? newGame(Date.now() % 2147483647))
  const [screen, setScreen] = useState<Screen>('table')
  const [replay, setReplay] = useState<Fixture | null>(null)
  useEffect(() => { save(state) }, [state])

  const advance = () => {
    const next = advanceRound(state)
    const played = next.fixtures.find(
      f => f.round === state.round && (f.homeId === state.userTeamId || f.awayId === state.userTeamId),
    ) ?? null
    setState(next)
    setReplay(played)
  }

  const userTeam = state.teams.find(t => t.id === state.userTeamId)!
  const total = totalRounds(state)
  const seasonOver = state.round > total
  const champion = seasonOver ? state.teams.find(t => t.id === standings(state)[0].teamId)! : null

  if (replay) {
    return <MatchScreen fixture={replay} state={state} onClose={() => setReplay(null)} />
  }

  if (state.gameOver) {
    return (
      <div className="app">
        <h1>Sacked!</h1>
        <p>
          {userTeam.name} spent too long in the red. The board has shown you the door
          after {state.season} season{state.season > 1 ? 's' : ''}.
        </p>
        <button onClick={() => setState(newGame(Date.now() % 2147483647))}>Start a new career</button>
      </div>
    )
  }

  return (
    <div className="app">
      <header>
        <h1>Futscript</h1>
        <span>
          {userTeam.name} — Season {state.season}, Round {Math.min(state.round, total)}/{total}
        </span>
        {seasonOver
          ? <button onClick={() => setState(newSeason)}>New Season</button>
          : <button onClick={advance}>Advance Round</button>}
      </header>
      {champion && <div className="banner">🏆 {champion.name} are the season {state.season} champions!</div>}
      <nav>
        {(['squad', 'table', 'fixtures', 'transfers', 'finance'] as Screen[]).map(s => (
          <button key={s} className={screen === s ? 'active' : ''} onClick={() => setScreen(s)}>
            {s}
          </button>
        ))}
      </nav>
      {screen === 'squad' && <SquadScreen state={state} setState={setState} />}
      {screen === 'table' && <TableScreen state={state} />}
      {screen === 'fixtures' && <FixturesScreen state={state} />}
      {screen === 'transfers' && <TransfersScreen state={state} setState={setState} />}
      {screen === 'finance' && <FinanceScreen state={state} setState={setState} />}
    </div>
  )
}
