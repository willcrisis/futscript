import { useEffect, useState } from 'react'
import { cupWinner } from './engine/cup'
import { newGame } from './engine/newGame'
import { load, save } from './engine/save'
import { advanceRound, newSeason, totalRounds } from './engine/season'
import { standings } from './engine/standings'
import type { GameState } from './engine/types'
import Button from './ui/Button'
import Shell from './ui/Shell'
import type { ScreenId } from './ui/Shell'
import { ToastProvider, useToasts } from './ui/Toast'
import { detectToasts } from './ui/toastEvents'
import CupScreen from './screens/CupScreen'
import FinanceScreen from './screens/FinanceScreen'
import FixturesScreen from './screens/FixturesScreen'
import HistoryScreen from './screens/HistoryScreen'
import HomeScreen from './screens/HomeScreen'
import MatchScreen from './screens/MatchScreen'
import type { MatchLike } from './screens/MatchScreen'
import SavesScreen from './screens/SavesScreen'
import SquadScreen from './screens/SquadScreen'
import StatsScreen from './screens/StatsScreen'
import TableScreen from './screens/TableScreen'
import TransfersScreen from './screens/TransfersScreen'

export default function App() {
  return (
    <ToastProvider>
      <Game />
    </ToastProvider>
  )
}

function Game() {
  const { push } = useToasts()
  const [state, setState] = useState<GameState>(() => load() ?? newGame(Date.now() % 2147483647))
  const [screen, setScreen] = useState<ScreenId>('home')
  const [replay, setReplay] = useState<MatchLike | null>(null)
  useEffect(() => { save(state) }, [state])

  const userTeam = state.teams.find(t => t.id === state.userTeamId)!
  const total = totalRounds(state)
  const seasonOver = state.round > total

  const advance = () => {
    if (seasonOver) {
      setState(newSeason)
      return
    }
    const next = advanceRound(state)
    for (const t of detectToasts(state, next)) push(t)
    const mine = (f: { homeId: number; awayId: number }) =>
      f.homeId === state.userTeamId || f.awayId === state.userTeamId
    const played =
      next.fixtures.find(f => f.round === state.round && mine(f)) ??
      next.cupFixtures.find(f => f.week === state.round && mine(f)) ??
      null
    setState(next)
    setReplay(played)
  }

  if (replay) {
    return <MatchScreen fixture={replay} state={state} onClose={() => setReplay(null)} />
  }

  if (state.gameOver) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="font-mono text-4xl font-bold">Sacked!</h1>
        <p className="max-w-md text-ink-muted">
          {userTeam.name} spent too long in the red. The board has shown you the door
          after {state.season} season{state.season > 1 ? 's' : ''}.
        </p>
        <Button variant="primary" onClick={() => setState(newGame(Date.now() % 2147483647))}>
          Start a new career
        </Button>
      </div>
    )
  }

  const champion = seasonOver
    ? state.teams.find(t => t.id === standings(state, userTeam.division)[0].teamId)!
    : null
  const cupChampId = seasonOver ? cupWinner(state) : null
  const expiringCount = seasonOver
    ? userTeam.playerIds.filter(id => state.players[id].contractSeasons <= 1).length
    : 0

  return (
    <Shell
      screen={screen}
      onNavigate={setScreen}
      state={state}
      advanceLabel={seasonOver ? 'New Season' : 'Advance Week'}
      onAdvance={advance}
    >
      {champion && (
        <div className="mb-4 rounded-lg border border-accent/40 bg-surface-raised px-4 py-3 text-sm">
          🏆 {champion.name} are the Division {userTeam.division} champions!
          {cupChampId !== null && <> · 🏆 {state.teams.find(t => t.id === cupChampId)!.name} win the Cup!</>}
          {expiringCount > 0 && (
            <> · ⚠ {expiringCount} contract{expiringCount > 1 ? 's' : ''} expire — unrenewed players leave
            (cheapest are kept automatically if the squad would drop below 14)</>
          )}
        </div>
      )}
      {screen === 'home' && <HomeScreen state={state} onAdvance={advance} onNavigate={setScreen} />}
      {screen === 'squad' && <SquadScreen state={state} setState={setState} />}
      {screen === 'table' && <TableScreen key={state.season} state={state} />}
      {screen === 'fixtures' && <FixturesScreen key={state.season} state={state} />}
      {screen === 'cup' && <CupScreen key={state.season} state={state} />}
      {screen === 'stats' && <StatsScreen state={state} />}
      {screen === 'transfers' && <TransfersScreen state={state} setState={setState} />}
      {screen === 'finance' && <FinanceScreen state={state} setState={setState} />}
      {screen === 'history' && <HistoryScreen state={state} />}
      {screen === 'saves' && <SavesScreen state={state} setState={setState} />}
    </Shell>
  )
}
