import type { GameState } from '../engine/types'
import { t } from '../i18n'
import { describeLedger } from '../i18n/ledger'
import type { ToastInput } from './Toast'

// Pure diff of two consecutive states → toast-worthy news, max 3.
export function detectToasts(prev: GameState, next: GameState): ToastInput[] {
  const out: ToastInput[] = []

  const known = new Set(prev.incomingOffers.map(o => `${o.playerId}:${o.bidderTeamId}`))
  for (const o of next.incomingOffers) {
    if (known.has(`${o.playerId}:${o.bidderTeamId}`)) continue
    const player = next.players[o.playerId]
    const bidder = next.teams.find(t => t.id === o.bidderTeamId)
    if (player && bidder) {
      out.push({
        tone: 'accent',
        text: t('toast.offer', { bidder: bidder.name, amount: `$${o.amount.toLocaleString('en-US')}`, player: player.name }),
      })
    }
  }

  // identity diff: ledger entries are stable object references through every engine spread,
  // so this survives the 300-entry cap (a length-based slice would go permanently blind once capped)
  const prevEntries = new Set(prev.finances)
  const fresh = next.finances.filter(e => !prevEntries.has(e))
  for (const e of fresh) {
    if (e.label.startsWith('Sold ') || e.label.startsWith('Signed ') || e.label.startsWith('Stadium expansion complete')) {
      const label = describeLedger(e.label).text
      out.push({
        tone: 'accent',
        text: e.amount === 0 ? label : `${label}: ${e.amount > 0 ? '+' : '-'}$${Math.abs(e.amount).toLocaleString('en-US')}`,
      })
    }
  }

  if (next.brokeRounds >= 6 && next.brokeRounds > prev.brokeRounds) {
    out.push({ tone: 'danger', text: t('toast.boardPatience', { n: next.brokeRounds }) })
  }

  return out.slice(0, 3)
}
