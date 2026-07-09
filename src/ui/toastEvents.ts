import type { GameState, NewsType } from '../engine/types'
import { newsText } from '../i18n/news'
import type { ToastInput } from './Toast'

const TOASTABLE: Partial<Record<NewsType, ToastInput['tone']>> = {
  offerReceived: 'accent',
  userSigned: 'accent',
  userSold: 'accent',
  constructionDone: 'accent',
  userOutbid: 'warn',
  boardWarning: 'danger',
  userSacked: 'danger',
  userHired: 'accent',
  jobOffer: 'accent',
  offerAccepted: 'accent',
  offerRejected: 'warn',
}

// The engine already narrates everything as structured news; toasts are just
// the urgent subset of what's new this tick. Identity diff: news items are
// stable object references through every engine spread, so this survives the cap.
export function detectToasts(prev: GameState, next: GameState): ToastInput[] {
  const known = new Set(prev.news)
  const out: ToastInput[] = []
  for (const item of next.news) {
    if (known.has(item)) continue
    const tone = TOASTABLE[item.type]
    if (!tone) continue
    out.push({ tone, text: newsText(item) })
  }
  return out.slice(0, 3)
}
