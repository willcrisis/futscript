import { useEffect, useRef, useState } from 'react'
import { cupWinner } from './engine/cup'
import { newGame } from './engine/newGame'
import { load, save } from './engine/save'
import { advanceRound, newSeason, totalRounds } from './engine/season'
import { standings } from './engine/standings'
import type { GameState } from './engine/types'
import { t, useLang } from './i18n'
import Button from './ui/Button'
import Panel from './ui/Panel'
import SectionLabel from './ui/SectionLabel'
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
  // Subscribing here re-renders the whole tree on language change — acceptable at this app's size.
  useLang()
  const { push } = useToasts()
  const [state, setState] = useState<GameState>(() => load() ?? newGame(Date.now() % 2147483647))
  const [screen, setScreen] = useState<ScreenId>('home')
  const [replay, setReplay] = useState<MatchLike | null>(null)
  const advancingRef = useRef(false)
  useEffect(() => { save(state) }, [state])

  const userTeam = state.teams.find(t => t.id === state.userTeamId)!
  const total = totalRounds(state)
  const seasonOver = state.round > total

  const advance = () => {
    if (advancingRef.current) return
    advancingRef.current = true
    try {
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
    } finally {
      advancingRef.current = false
    }
  }

  if (replay) {
    return <MatchScreen fixture={replay} state={state} onClose={() => setReplay(null)} />
  }

  if (state.gameOver) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
        <SectionLabel>THE BOARD HAS DECIDED</SectionLabel>
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
      advanceLabel={seasonOver ? t('shell.newSeason') : t('shell.advanceWeek')}
      onAdvance={advance}
    >
      {champion && (
        <Panel className="mb-4 border-accent/40!">
          <p className="text-lg font-semibold">
            🏆 {champion.name} are the Division {userTeam.division} champions!
          </p>
          {(cupChampId !== null || expiringCount > 0) && (
            <p className="mt-1 text-sm text-ink-muted">
              {cupChampId !== null && <>🏆 {state.teams.find(t => t.id === cupChampId)!.name} win the Cup!</>}
              {cupChampId !== null && expiringCount > 0 && ' · '}
              {expiringCount > 0 && (
                <>⚠ {expiringCount} contract{expiringCount > 1 ? 's' : ''} expire — unrenewed players leave
                (cheapest are kept automatically if the squad would drop below 14)</>
              )}
            </p>
          )}
        </Panel>
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
