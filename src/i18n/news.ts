import type { NewsItem, NewsType } from '../engine/types'
import { t } from './index'
import type { TranslationKey } from './index'

const NEWS_KEYS: Record<NewsType, TranslationKey> = {
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
  return t(NEWS_KEYS[item.type], params)
}
