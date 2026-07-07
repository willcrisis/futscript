import { totalRounds } from '../engine/season'
import { standings } from '../engine/standings'
import type { GameState } from '../engine/types'
import Button from '../ui/Button'
import DataTable from '../ui/DataTable'
import type { Column } from '../ui/DataTable'
import MoneyText from '../ui/MoneyText'
import Panel from '../ui/Panel'
import ScreenHeader from '../ui/ScreenHeader'
import type { ScreenId } from '../ui/Shell'
import Sparkline from '../ui/Sparkline'

interface Props {
  state: GameState
  onAdvance: () => void
  onNavigate: (s: ScreenId) => void
}

interface Row { pos: number; teamId: number; name: string; points: number; gd: number }

export default function HomeScreen({ state, onAdvance, onNavigate }: Props) {
  const user = state.teams.find(t => t.id === state.userTeamId)!
  const name = (id: number) => state.teams.find(t => t.id === id)!.name
  const total = totalRounds(state)
  const week = state.round
  const seasonOver = week > total

  // next match: league or cup, this week
  const mine = (f: { homeId: number; awayId: number }) => f.homeId === user.id || f.awayId === user.id
  const league = state.fixtures.find(f => f.round === week && mine(f))
  const cup = state.cupFixtures.find(f => f.week === week && f.winnerId === null && mine(f))
  const nextMatch = league ?? cup
  const isHome = nextMatch?.homeId === user.id
  const opponentId = nextMatch ? (isHome ? nextMatch.awayId : nextMatch.homeId) : null

  // table excerpt: 5 rows centered on the user
  const table = standings(state, user.division)
  const myIndex = table.findIndex(r => r.teamId === user.id)
  const from = Math.max(0, Math.min(myIndex - 2, table.length - 5))
  const excerpt: Row[] = table.slice(from, from + 5).map((r, i) => ({
    pos: from + i + 1, teamId: r.teamId, name: name(r.teamId), points: r.points, gd: r.goalsFor - r.goalsAgainst,
  }))
  const excerptColumns: Column<Row>[] = [
    { key: 'pos', label: '#', mono: true, render: r => r.pos },
    { key: 'team', label: 'Team', render: r => r.name },
    { key: 'gd', label: 'GD', align: 'right', mono: true, render: r => (r.gd > 0 ? `+${r.gd}` : r.gd) },
    { key: 'pts', label: 'Pts', align: 'right', mono: true, render: r => <strong>{r.points}</strong> },
  ]

  // money: sparkline over running balance of recent ledger, delta of this week's entries
  const recent = state.finances.slice(-20)
  let running = user.cash - recent.reduce((s, e) => s + e.amount, 0)
  const balances = recent.map(e => (running += e.amount))
  const lastWeekPlayed = week - 1
  const weekDelta = state.finances
    .filter(e => e.season === state.season && e.round === lastWeekPlayed)
    .reduce((s, e) => s + e.amount, 0)

  // attention items
  const expiring = user.playerIds.filter(id => state.players[id].contractSeasons <= 1).length
  const attention: { text: string; screen: ScreenId; tone?: 'warn' | 'danger' }[] = []
  if (state.incomingOffers.length > 0) {
    const best = Math.max(...state.incomingOffers.map(o => o.amount))
    attention.push({ text: `${state.incomingOffers.length} offer${state.incomingOffers.length > 1 ? 's' : ''} on the table (best $${best.toLocaleString('en-US')})`, screen: 'transfers' })
  }
  if (expiring > 0) attention.push({ text: `${expiring} contract${expiring > 1 ? 's' : ''} expiring`, screen: 'squad', tone: 'warn' })
  if (state.construction) attention.push({ text: `Stadium expansion ready in ${state.construction.weeksLeft}w`, screen: 'finance' })
  if (state.brokeRounds > 0) attention.push({ text: `Board patience ${state.brokeRounds}/8`, screen: 'finance', tone: state.brokeRounds >= 6 ? 'danger' : 'warn' })
  if (cup) attention.push({ text: 'Cup tie this week', screen: 'cup' })

  return (
    <div>
      <ScreenHeader label={`Season ${state.season} · Week ${Math.min(week, total)}/${total}`} title={user.name} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Panel label={seasonOver ? 'Season complete' : 'Next match'}>
          {seasonOver ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-ink-muted">The season is over — start the next one when ready.</p>
              <Button variant="primary" onClick={onAdvance}>New Season</Button>
            </div>
          ) : nextMatch ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-medium">{opponentId !== null && name(opponentId)}</div>
                <div className="mt-0.5 text-xs text-ink-muted">
                  {isHome ? 'Home' : 'Away'} · {league ? `League · Week ${week}` : `Cup · Round ${cup!.cupRound}`}
                </div>
              </div>
              <Button variant="primary" onClick={onAdvance}>Advance Week</Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-ink-muted">
                Free week{state.playFriendlies ? ' — a friendly will be arranged' : ''}.
              </p>
              <Button variant="primary" onClick={onAdvance}>Advance Week</Button>
            </div>
          )}
        </Panel>

        <Panel label="Money" action={<button className="rounded-sm text-xs text-ink-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface" onClick={() => onNavigate('finance')}>Finance →</button>}>
          <div className="flex items-end justify-between gap-3">
            <div>
              <MoneyText amount={user.cash} size="lg" />
              <div className="mt-1 text-xs text-ink-muted">
                This week: <MoneyText amount={weekDelta} size="sm" signed />
              </div>
            </div>
            <Sparkline values={balances} />
          </div>
        </Panel>

        <Panel label={`Division ${user.division}`} action={<button className="rounded-sm text-xs text-ink-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface" onClick={() => onNavigate('table')}>Full table →</button>}>
          <DataTable
            columns={excerptColumns}
            rows={excerpt}
            rowKey={r => r.teamId}
            rowAccent={r => (r.teamId === user.id ? 'user' : null)}
          />
        </Panel>

        <Panel label="Club">
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-ink-muted">Fan mood</span>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-rule">
                  <div className="h-full bg-accent" style={{ width: `${user.fanMood}%` }} />
                </div>
                <span className="font-mono text-xs tabular-nums">{user.fanMood}</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-muted">Stadium</span>
              <span className="font-mono text-xs tabular-nums">{user.capacity.toLocaleString('en-US')} seats</span>
            </div>
            {attention.length > 0 ? (
              <ul className="mt-1 flex flex-col gap-1.5 border-t border-rule pt-3">
                {attention.map((a, i) => (
                  <li key={i}>
                    <button
                      onClick={() => onNavigate(a.screen)}
                      className={`rounded-sm text-left text-sm underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                        a.tone === 'danger' ? 'text-danger' : a.tone === 'warn' ? 'text-warn' : 'text-ink'
                      }`}
                    >
                      {a.text} →
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="border-t border-rule pt-3 text-xs text-ink-faint">All quiet at the club.</div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  )
}
