import type { Dispatch, SetStateAction } from 'react'
import { useState } from 'react'
import { acceptJob, declineOffer, restructuredLoan } from '../engine/career'
import { formatMoney, wageBill } from '../engine/finance'
import { totalRounds } from '../engine/season'
import { standings } from '../engine/standings'
import type { GameState } from '../engine/types'
import { t, useLang } from '../i18n'
import Button from '../ui/Button'
import DataTable from '../ui/DataTable'
import type { Column } from '../ui/DataTable'
import MoneyText from '../ui/MoneyText'
import NewsRail from '../ui/NewsRail'
import Panel from '../ui/Panel'
import ScreenHeader from '../ui/ScreenHeader'
import type { ScreenId } from '../ui/Shell'
import Sparkline from '../ui/Sparkline'

interface Props {
  state: GameState
  setState: Dispatch<SetStateAction<GameState>>
  onAdvance: () => void
  advanceDisabled?: boolean
  onNavigate: (s: ScreenId) => void
  onShowClub?: (teamId: number) => void
}

interface Row { pos: number; teamId: number; name: string; points: number; gd: number }

export default function HomeScreen({ state, setState, onAdvance, advanceDisabled, onNavigate, onShowClub }: Props) {
  useLang()
  const [newsExpanded, setNewsExpanded] = useState(false)
  const user = state.teams.find(t => t.id === state.userTeamId)!
  const userLineupLen = state.teams.find(t => t.id === state.userTeamId)?.lineup.length ?? 0
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
    { key: 'pos', label: t('common.pos'), mono: true, render: r => r.pos },
    { key: 'team', label: t('common.team'), render: r => r.name },
    { key: 'gd', label: t('common.gd'), align: 'right', mono: true, render: r => (r.gd > 0 ? `+${r.gd}` : r.gd) },
    { key: 'pts', label: t('common.pts'), align: 'right', mono: true, render: r => <strong>{r.points}</strong> },
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
    attention.push({
      text: t('home.offersAttention', { n: state.incomingOffers.length, best: `$${best.toLocaleString('en-US')}` }),
      screen: 'transfers',
    })
  }
  if (expiring > 0) attention.push({ text: t('home.contractsExpiring', { n: expiring }), screen: 'squad', tone: 'warn' })
  if (state.construction) {
    attention.push({ text: t('home.stadiumExpansionReady', { n: state.construction.weeksLeft }), screen: 'finance' })
  }
  if (state.brokeRounds > 0) {
    attention.push({
      text: t('home.boardPatience', { n: state.brokeRounds }),
      screen: 'finance',
      tone: state.brokeRounds >= 6 ? 'danger' : 'warn',
    })
  }
  if (state.manager.confidence < 25) {
    attention.push({
      text: t('home.confidenceAttention', { n: state.manager.confidence }),
      screen: 'home',
      tone: state.manager.confidence < 15 ? 'danger' : 'warn',
    })
  }
  if (cup) attention.push({ text: t('home.cupTieThisWeek'), screen: 'cup' })

  return (
    <div>
      <ScreenHeader label={t('home.header', { season: state.season, week: Math.min(week, total), total })} title={user.name} />
      {state.manager.jobOffers.length > 0 && (
        <Panel label={t('home.poachPanel')} className="mb-4 border-accent/40!">
          <ul className="flex flex-col gap-3">
            {state.manager.jobOffers.map(o => {
              const club = state.teams.find(tm => tm.id === o.teamId)!
              return (
                <li key={o.teamId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <div>
                    <div>{t('home.poachOffer', { club: club.name, division: club.division })}</div>
                    <div className="mt-0.5 text-xs text-ink-muted">
                      {t('home.poachDetails', {
                        cash: formatMoney(club.cash),
                        wages: formatMoney(wageBill(club.id, state)),
                        loan: formatMoney(restructuredLoan(club)),
                      })}
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <Button variant="primary" size="sm" onClick={() => setState(s => acceptJob(s, o.teamId))}>
                      {t('home.poachAccept')}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setState(s => declineOffer(s, o.teamId))}>
                      {t('home.poachDecline')}
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        </Panel>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Panel label={seasonOver ? t('home.seasonComplete') : t('home.nextMatch')}>
          {seasonOver ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-ink-muted">{t('home.seasonOverMessage')}</p>
              <Button variant="primary" onClick={onAdvance}>{t('shell.newSeason')}</Button>
            </div>
          ) : nextMatch ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-medium">
                  {opponentId !== null && (onShowClub ? (
                    <button
                      type="button"
                      onClick={() => onShowClub(opponentId)}
                      className="rounded-sm underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                    >
                      {name(opponentId)}
                    </button>
                  ) : name(opponentId))}
                </div>
                <div className="mt-0.5 text-xs text-ink-muted">
                  {isHome ? t('home.venueHome') : t('home.venueAway')} ·{' '}
                  {league ? t('home.leagueWeek', { week }) : t('home.cupRound', { round: cup!.cupRound })}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Button variant="primary" disabled={advanceDisabled} onClick={onAdvance}>{t('shell.advanceWeek')}</Button>
                {advanceDisabled && <span className="text-[11px] text-warn">{t('squad.selectElevenHint', { n: userLineupLen })}</span>}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-ink-muted">
                {t('home.freeWeek')}
              </p>
              <div className="flex flex-col items-end gap-1">
                <Button variant="primary" disabled={advanceDisabled} onClick={onAdvance}>{t('shell.advanceWeek')}</Button>
                {advanceDisabled && <span className="text-[11px] text-warn">{t('squad.selectElevenHint', { n: userLineupLen })}</span>}
              </div>
            </div>
          )}
        </Panel>

        <Panel label={t('home.money')} action={<button className="rounded-sm text-xs text-ink-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface" onClick={() => onNavigate('finance')}>{t('home.financeLink')}</button>}>
          <div className="flex items-end justify-between gap-3">
            <div>
              <MoneyText amount={user.cash} size="lg" />
              <div className="mt-1 text-xs text-ink-muted">
                {t('home.thisWeek')} <MoneyText amount={weekDelta} size="sm" signed />
              </div>
            </div>
            <Sparkline values={balances} />
          </div>
        </Panel>

        <Panel label={t('home.division', { division: user.division })} action={<button className="rounded-sm text-xs text-ink-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface" onClick={() => onNavigate('table')}>{t('home.fullTableLink')}</button>}>
          <DataTable
            columns={excerptColumns}
            rows={excerpt}
            rowKey={r => r.teamId}
            rowClass={r => (r.teamId === user.id ? 'bg-accent/10 font-semibold' : undefined)}
          />
        </Panel>

        <Panel label={t('home.club')}>
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-ink-muted">{t('home.fanMood')}</span>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-rule">
                  <div className="h-full bg-accent" style={{ width: `${user.fanMood}%` }} />
                </div>
                <span className="font-mono text-xs tabular-nums">{user.fanMood}</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-muted">{t('home.boardConfidence')}</span>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-rule">
                  <div
                    className={`h-full ${state.manager.confidence < 25 ? 'bg-danger' : state.manager.confidence < 45 ? 'bg-warn' : 'bg-accent'}`}
                    style={{ width: `${state.manager.confidence}%` }}
                  />
                </div>
                <span className="font-mono text-xs tabular-nums">{state.manager.confidence}</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-muted">{t('home.stadium')}</span>
              <span className="font-mono text-xs tabular-nums">{t('home.seats', { n: user.capacity.toLocaleString('en-US') })}</span>
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
              <div className="border-t border-rule pt-3 text-xs text-ink-faint">{t('home.allQuiet')}</div>
            )}
          </div>
        </Panel>
      </div>

      <div className="mt-4 xl:hidden">
        <Panel label={t('news.title')}>
          <NewsRail state={state} limit={newsExpanded ? undefined : 5} onShowClub={onShowClub} />
          {state.news.length > 5 && (
            <button
              className="mt-2 text-xs text-ink-muted underline-offset-2 hover:underline"
              onClick={() => setNewsExpanded(e => !e)}
            >
              {newsExpanded ? t('news.showLess') : t('news.showAll', { n: state.news.length })}
            </button>
          )}
        </Panel>
      </div>
    </div>
  )
}
