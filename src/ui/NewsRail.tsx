import type { FC } from 'react'
import type { GameState, NewsItem, NewsType } from '../engine/types'
import { t, useLang } from '../i18n'
import { newsText } from '../i18n/news'
import EmptyState from './EmptyState'
import { CupIcon, FinanceIcon, MoreIcon, SquadIcon, TableIcon, TransfersIcon } from './icons'

// ponytail: career news types (managerSacked etc.) get real icons in Task 3/6/7 — MoreIcon fallback until then
const ICONS: Partial<Record<NewsType, FC<{ className?: string }>>> = {
  userSigned: TransfersIcon, userSold: TransfersIcon, userRenewed: SquadIcon, userOutbid: TransfersIcon,
  offerReceived: TransfersIcon, rivalTransfer: TransfersIcon,
  starterInjured: SquadIcon, boardWarning: FinanceIcon, constructionDone: FinanceIcon,
  heavyWin: TableIcon, champions: TableIcon, promoted: TableIcon, relegated: TableIcon,
  cupRun: CupIcon, cupWinner: CupIcon,
}

function toneOf(type: NewsType): string {
  if (type === 'starterInjured') return 'text-danger'
  if (type === 'boardWarning' || type === 'relegated') return 'text-warn'
  return 'text-ink'
}

export default function NewsRail({ state, limit }: { state: GameState; limit?: number }) {
  useLang()
  const items = [...state.news].reverse().slice(0, limit)
  if (items.length === 0) return <EmptyState>{t('news.empty')}</EmptyState>
  return (
    <ol className="flex flex-col">
      {items.map((item, i) => (
        <NewsRow key={`${state.news.length - i}`} item={item} />
      ))}
    </ol>
  )
}

function NewsRow({ item }: { item: NewsItem }) {
  const RowIcon = ICONS[item.type] ?? MoreIcon
  return (
    <li className={`flex items-baseline gap-2 border-b border-rule/60 py-2 text-sm ${toneOf(item.type)}`}>
      <span className="translate-y-0.5 text-ink-faint"><RowIcon /></span>
      <span className="min-w-0 flex-1">{newsText(item)}</span>
      <span className="shrink-0 font-mono text-[10px] tabular-nums text-ink-faint">
        S{item.season} W{item.week}
      </span>
    </li>
  )
}
