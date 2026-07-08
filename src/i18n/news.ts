import type { NewsItem, NewsType } from '../engine/types'
import { t } from './index'
import type { TranslationKey } from './index'

// ponytail: career news types (managerSacked etc.) get real copy in Task 3/6/7 — the type key falls back to itself until then
const NEWS_KEYS: Partial<Record<NewsType, TranslationKey>> = {
  userSigned: 'news.userSigned',
  userSold: 'news.userSold',
  userRenewed: 'news.userRenewed',
  userOutbid: 'news.userOutbid',
  offerReceived: 'news.offerReceived',
  starterInjured: 'news.starterInjured',
  boardWarning: 'news.boardWarning',
  constructionDone: 'news.constructionDone',
  rivalTransfer: 'news.rivalTransfer',
  heavyWin: 'news.heavyWin',
  cupRun: 'news.cupRun',
  champions: 'news.champions',
  cupWinner: 'news.cupWinner',
  promoted: 'news.promoted',
  relegated: 'news.relegated',
}

export function newsText(item: NewsItem): string {
  const params: Record<string, string | number> = { ...item.params }
  if (typeof params.amount === 'number') params.amount = `$${params.amount.toLocaleString('en-US')}`
  if (typeof params.salary === 'number') params.salary = `$${params.salary.toLocaleString('en-US')}`
  const key = NEWS_KEYS[item.type]
  return key ? t(key, params) : item.type
}
