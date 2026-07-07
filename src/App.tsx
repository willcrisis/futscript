import { useEffect, useState } from 'react'
import { cupWinner } from './engine/cup'
import { newGame } from './engine/newGame'
import { load, save } from './engine/save'
import { advanceRound, newSeason, totalRounds } from './engine/season'
import { standings } from './engine/standings'
import type { GameState } from './engine/types'
import FixturesScreen from './screens/FixturesScreen'
import SquadScreen from './screens/SquadScreen'
import TableScreen from './screens/TableScreen'
import MatchScreen from './screens/MatchScreen'
import type { MatchLike } from './screens/MatchScreen'
import TransfersScreen from './screens/TransfersScreen'
import FinanceScreen from './screens/FinanceScreen'
import CupScreen from './screens/CupScreen'
import HistoryScreen from './screens/HistoryScreen'

type Screen = 'squad' | 'table' | 'fixtures' | 'cup' | 'transfers' | 'finance' | 'history'

export default function App() {
  const [state, setState] = useState<GameState>(() => load() ?? newGame(Date.now() % 2147483647))
  const [screen, setScreen] = useState<Screen>('table')
  const [replay, setReplay] = useState<MatchLike | null>(null)
  useEffect(() => { save(state) }, [state])

  const advance = () => {
    const next = advanceRound(state)
    const mine = (f: { homeId: number; awayId: number }) =>
      f.homeId === state.userTeamId || f.awayId === state.userTeamId
    const played =
      next.fixtures.find(f => f.round === state.round && mine(f)) ??
      next.cupFixtures.find(f => f.week === state.round && mine(f)) ??
      null
    setState(next)
    setReplay(played)
  }

  const userTeam = state.teams.find(t => t.id === state.userTeamId)!
  const total = totalRounds(state)
  const seasonOver = state.round > total
  const champion = seasonOver
    ? state.teams.find(t => t.id === standings(state, userTeam.division)[0].teamId)!
    : null
  const cupChampId = seasonOver ? cupWinner(state) : null
  const expiringCount = seasonOver
    ? userTeam.playerIds.filter(id => state.players[id].contractSeasons <= 1).length
    : 0

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
          {userTeam.name} (Div {userTeam.division}) — Season {state.season}, Week {Math.min(state.round, total)}/{total}
        </span>
        {seasonOver
          ? <button onClick={() => setState(newSeason)}>New Season</button>
          : <button onClick={advance}>Advance Round</button>}
      </header>
      {champion && (
        <div className="banner">
          🏆 {champion.name} are the Division {userTeam.division} champions!
          {cupChampId !== null && <> · 🏆 {state.teams.find(t => t.id === cupChampId)!.name} win the Cup!</>}
          {expiringCount > 0 && (
            <> · ⚠ {expiringCount} contract{expiringCount > 1 ? 's' : ''} expire — unrenewed players leave
            (cheapest are kept automatically if the squad would drop below 14)</>
          )}
        </div>
      )}
      <nav>
        {(['squad', 'table', 'fixtures', 'cup', 'transfers', 'finance', 'history'] as Screen[]).map(s => (
          <button key={s} className={screen === s ? 'active' : ''} onClick={() => setScreen(s)}>
            {s}
          </button>
        ))}
      </nav>
      {screen === 'squad' && <SquadScreen state={state} setState={setState} />}
      {/* key: remount on rollover so the division select re-seeds after promotion/relegation */}
      {screen === 'table' && <TableScreen key={state.season} state={state} />}
      {screen === 'fixtures' && <FixturesScreen key={state.season} state={state} />}
      {screen === 'cup' && <CupScreen key={state.season} state={state} />}
      {screen === 'transfers' && <TransfersScreen state={state} setState={setState} />}
      {screen === 'finance' && <FinanceScreen state={state} setState={setState} />}
      {screen === 'history' && <HistoryScreen state={state} />}
    </div>
  )
}
