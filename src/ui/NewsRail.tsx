import type { FC } from 'react'
import type { GameState, NewsItem, NewsType } from '../engine/types'
import { t, useLang } from '../i18n'
import { newsText } from '../i18n/news'
import { useClubNav } from './ClubLink'
import EmptyState from './EmptyState'
import { CupIcon, FinanceIcon, SquadIcon, TableIcon, TransfersIcon } from './icons'

const ICONS: Record<NewsType, FC<{ className?: string }>> = {
  userSigned: TransfersIcon, userSold: TransfersIcon, userRenewed: SquadIcon, userOutbid: TransfersIcon,
  offerReceived: TransfersIcon, rivalTransfer: TransfersIcon,
  starterInjured: SquadIcon, playerSuspended: SquadIcon, boardWarning: FinanceIcon, constructionDone: FinanceIcon,
  heavyWin: TableIcon, champions: TableIcon, promoted: TableIcon, relegated: TableIcon,
  cupRun: CupIcon, cupWinner: CupIcon,
  managerSacked: SquadIcon, managerHired: SquadIcon, userSacked: SquadIcon, userHired: SquadIcon, jobOffer: SquadIcon,
  offerAccepted: TransfersIcon, offerRejected: TransfersIcon,
}

function toneOf(type: NewsType): string {
  if (type === 'starterInjured' || type === 'userSacked') return 'text-danger'
  if (type === 'boardWarning' || type === 'relegated' || type === 'playerSuspended') return 'text-warn'
  return 'text-ink'
}

const CLUB_PARAMS = ['club', 'winner', 'from', 'bidder', 'loser', 'to'] // first resolvable name wins

function clubIdOf(item: NewsItem, state: GameState): number | null {
  for (const key of CLUB_PARAMS) {
    const v = item.params[key]
    if (typeof v !== 'string') continue
    const team = state.teams.find(t => t.name === v)
    if (team) return team.id
  }
  return null
}

export function isPastWeek(item: NewsItem, latest: { season: number; week: number }): boolean {
  return item.season < latest.season || (item.season === latest.season && item.week < latest.week)
}

export default function NewsRail({ state, limit }: { state: GameState; limit?: number }) {
  useLang()
  const items = [...state.news].reverse().slice(0, limit)
  if (items.length === 0) return <EmptyState>{t('news.empty')}</EmptyState>
  const latest = { season: items[0].season, week: items[0].week }
  return (
    <ol className="flex flex-col">
      {items.map((item, i) => (
        <NewsRow key={`${state.news.length - i}`} item={item} state={state} past={isPastWeek(item, latest)} />
      ))}
    </ol>
  )
}

function NewsRow({ item, state, past }: { item: NewsItem; state: GameState; past: boolean }) {
  const RowIcon = ICONS[item.type]
  const onShowClub = useClubNav()
  const clubId = onShowClub ? clubIdOf(item, state) : null
  return (
    <li className={`flex items-baseline gap-2 border-b border-rule/60 py-2 text-sm ${toneOf(item.type)} ${past ? 'opacity-60' : ''}`}>
      <span className="translate-y-0.5 text-ink-faint"><RowIcon /></span>
      {onShowClub && clubId !== null ? (
        <button
          type="button"
          onClick={() => onShowClub(clubId)}
          className="min-w-0 flex-1 rounded-sm text-left underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {newsText(item)}
        </button>
      ) : (
        <span className="min-w-0 flex-1">{newsText(item)}</span>
      )}
      <span className="shrink-0 font-mono text-[10px] tabular-nums text-ink-faint">
        S{item.season} W{item.week}
      </span>
    </li>
  )
}
