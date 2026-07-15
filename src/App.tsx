import { useEffect, useRef, useState } from 'react'
import { renameManager } from './engine/career'
import { cupWinner } from './engine/cup'
import { isAvailable, lineupIssue } from './engine/lineup'
import { newGame } from './engine/newGame'
import { load, save } from './engine/save'
import { advanceRound, newSeason, totalRounds } from './engine/season'
import { standings } from './engine/standings'
import type { GameState } from './engine/types'
import { t, useLang } from './i18n'
import { ClubNavProvider } from './ui/ClubLink'
import { PlayerNavProvider } from './ui/PlayerLink'
import Panel from './ui/Panel'
import Shell from './ui/Shell'
import type { ScreenId } from './ui/Shell'
import { ToastProvider, useToasts } from './ui/Toast'
import type { ToastInput } from './ui/Toast'
import { detectToasts } from './ui/toastEvents'
import ClubScreen from './screens/ClubScreen'
import CupScreen from './screens/CupScreen'
import WelcomeScreen from './screens/WelcomeScreen'
import FinanceScreen from './screens/FinanceScreen'
import FixturesScreen from './screens/FixturesScreen'
import HistoryScreen from './screens/HistoryScreen'
import HomeScreen from './screens/HomeScreen'
import MatchScreen from './screens/MatchScreen'
import type { MatchLike } from './screens/MatchScreen'
import PlayerModal from './screens/PlayerModal'
import SavesScreen from './screens/SavesScreen'
import ScoutScreen from './screens/ScoutScreen'
import SquadScreen from './screens/SquadScreen'
import StatsScreen from './screens/StatsScreen'
import TableScreen from './screens/TableScreen'
import TransfersScreen from './screens/TransfersScreen'
import UnemployedScreen from './screens/UnemployedScreen'

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
  // Load once; a missing save means this session begins a brand-new career (show the welcome takeover).
  const [boot] = useState(() => {
    const loaded = load()
    return { state: loaded ?? newGame(Date.now() % 2147483647), fresh: loaded === null }
  })
  const [state, setState] = useState<GameState>(boot.state)
  const [screen, setScreen] = useState<ScreenId>('home')
  const [replay, setReplay] = useState<MatchLike | null>(null)
  const [pendingToasts, setPendingToasts] = useState<ToastInput[]>([])
  const [showWelcome, setShowWelcome] = useState(boot.fresh)
  const [clubView, setClubView] = useState<{ teamId: number; from: ScreenId } | null>(null)
  const [playerView, setPlayerView] = useState<number | null>(null)
  const advancingRef = useRef(false)
  useEffect(() => { save(state) }, [state])

  const openClub = (teamId: number) => {
    setClubView({ teamId, from: screen === 'club' ? (clubView?.from ?? 'home') : screen })
    setScreen('club')
  }
  const startNewCareer = () => { setState(newGame(Date.now() % 2147483647)); setShowWelcome(true); setScreen('home') }

  const userTeam = state.teams.find(t => t.id === state.userTeamId)!
  const total = totalRounds(state)
  const seasonOver = state.round > total
  const employed = state.manager.employed
  const availableCount = employed ? userTeam.playerIds.filter(id => isAvailable(state.players[id])).length : 0
  const lineupProblem = employed && !seasonOver && availableCount >= 11 ? lineupIssue(userTeam, state.players) : null
  const needsEleven = lineupProblem !== null
  const advanceHint = lineupProblem === 'count'
    ? t('squad.selectElevenHint', { n: userTeam.lineup.length })
    : lineupProblem === 'keeper'
      ? t('squad.oneKeeperHint')
      : undefined
  useEffect(() => {
    if (!employed && ['squad', 'transfers', 'scout', 'finance'].includes(screen)) setScreen('home')
  }, [employed, screen])

  const advance = () => {
    if (advancingRef.current || needsEleven) return
    advancingRef.current = true
    try {
      if (seasonOver) {
        setState(newSeason)
        return
      }
      const next = advanceRound(state)
      const toasts = detectToasts(state, next)
      const mine = (f: { homeId: number; awayId: number }) =>
        f.homeId === state.userTeamId || f.awayId === state.userTeamId
      const played =
        next.fixtures.find(f => f.round === state.round && mine(f)) ??
        next.cupFixtures.find(f => f.week === state.round && mine(f)) ??
        null
      setState(next)
      if (played) {
        setPendingToasts(toasts) // flushed when the match report closes
        setReplay(played)
      } else {
        toasts.forEach(push) // no match to defer behind
        setReplay(null)
        setScreen('home')
      }
    } finally {
      advancingRef.current = false
    }
  }

  if (showWelcome) {
    return <WelcomeScreen state={state} onDismiss={name => { setState(s => renameManager(s, name)); setShowWelcome(false) }} />
  }

  if (replay) {
    return (
      <MatchScreen
        fixture={replay}
        state={state}
        onClose={() => {
          pendingToasts.forEach(push)
          setPendingToasts([])
          setReplay(null)
          setScreen('home')
        }}
      />
    )
  }

  const champion = seasonOver
    ? state.teams.find(t => t.id === standings(state, userTeam.division)[0].teamId)!
    : null
  const cupChampId = seasonOver ? cupWinner(state) : null
  const expiringCount = seasonOver && employed
    ? userTeam.playerIds.filter(id => state.players[id].contractSeasons <= 1).length
    : 0
  const freshExpiring = employed && state.season === 1 && state.round === 1
    ? userTeam.playerIds.filter(id => state.players[id].contractSeasons <= 1).length
    : 0

  return (
    <ClubNavProvider value={openClub}>
    <PlayerNavProvider value={setPlayerView}>
    <Shell
      screen={screen}
      onNavigate={setScreen}
      state={state}
      advanceLabel={seasonOver ? t('shell.newSeason') : t('shell.advanceWeek')}
      onAdvance={advance}
      advanceDisabled={needsEleven}
      advanceHint={advanceHint}
    >
      {champion && (
        <Panel className="mb-4 border-accent/40!">
          <p className="text-lg font-semibold">
            {t('app.championMessage', { name: champion.name, division: userTeam.division })}
          </p>
          {(cupChampId !== null || expiringCount > 0) && (
            <p className="mt-1 text-sm text-ink-muted">
              {cupChampId !== null && t('cup.championMessage', { name: state.teams.find(t => t.id === cupChampId)!.name })}
              {cupChampId !== null && expiringCount > 0 && ' · '}
              {expiringCount > 0 && t('app.contractsExpireWarning', { n: expiringCount })}
            </p>
          )}
        </Panel>
      )}
      {freshExpiring > 0 && !champion && (
        <Panel className="mb-4">
          <p className="text-sm text-ink-muted">{t('app.contractsExpireFresh', { n: freshExpiring })}</p>
        </Panel>
      )}
      {screen === 'home' && (employed
        ? <HomeScreen state={state} setState={setState} onAdvance={advance} advanceDisabled={needsEleven} advanceHint={advanceHint} onNavigate={setScreen} />
        : <UnemployedScreen state={state} setState={setState} onAdvance={advance} />)}
      {screen === 'squad' && <SquadScreen state={state} setState={setState} />}
      {screen === 'table' && (
        <TableScreen key={state.season} state={state} onShowClub={openClub} />
      )}
      {screen === 'fixtures' && <FixturesScreen key={state.season} state={state} />}
      {screen === 'cup' && <CupScreen key={state.season} state={state} />}
      {screen === 'stats' && <StatsScreen state={state} />}
      {screen === 'transfers' && <TransfersScreen state={state} setState={setState} />}
      {screen === 'scout' && <ScoutScreen state={state} setState={setState} />}
      {screen === 'finance' && <FinanceScreen state={state} setState={setState} />}
      {screen === 'history' && <HistoryScreen state={state} />}
      {screen === 'saves' && <SavesScreen state={state} setState={setState} onNewCareer={startNewCareer} />}
      {screen === 'club' && clubView && (
        <ClubScreen state={state} setState={setState} teamId={clubView.teamId} onBack={() => setScreen(clubView.from)} />
      )}
    </Shell>
    {playerView != null && (
      <PlayerModal state={state} setState={setState} playerId={playerView} onClose={() => setPlayerView(null)} />
    )}
    </PlayerNavProvider>
    </ClubNavProvider>
  )
}
