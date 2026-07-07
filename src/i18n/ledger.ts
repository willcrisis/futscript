import { t } from './index'
import type { TranslationKey } from './en'

export type LedgerCategory =
  | 'gate'
  | 'sponsors'
  | 'prize'
  | 'wages'
  | 'maintenance'
  | 'interest'
  | 'loan'
  | 'transfers'
  | 'stadium'
  | 'other'

interface LedgerPattern {
  re: RegExp
  key: TranslationKey
  category: LedgerCategory
  params?: (m: RegExpMatchArray) => Record<string, string | number>
}

// Ordered pattern table for the canonical English labels the engine writes into
// state.finances (see src/engine/finance.ts, season.ts, stadium.ts, transfers.ts).
// Display-time translation only — engine data stays untouched, no save migration.
const PATTERNS: LedgerPattern[] = [
  { re: /^Wages$/, key: 'ledger.wages', category: 'wages' },
  { re: /^Stadium maintenance$/, key: 'ledger.maintenance', category: 'maintenance' },
  { re: /^Sponsors$/, key: 'ledger.sponsors', category: 'sponsors' },
  { re: /^Gate receipts \((\d+) fans\)$/, key: 'ledger.gate', category: 'gate', params: m => ({ n: m[1] }) },
  { re: /^Friendly gate receipts$/, key: 'ledger.friendlyGate', category: 'gate' },
  { re: /^Deposit interest$/, key: 'ledger.depositInterest', category: 'interest' },
  { re: /^Overdraft charge$/, key: 'ledger.overdraftCharge', category: 'interest' },
  { re: /^Loan interest$/, key: 'ledger.loanInterest', category: 'interest' },
  { re: /^Loan drawn$/, key: 'ledger.loanDrawn', category: 'loan' },
  { re: /^Loan repayment$/, key: 'ledger.loanRepayment', category: 'loan' },
  { re: /^Sold (.+)$/, key: 'ledger.sold', category: 'transfers', params: m => ({ name: m[1] }) },
  { re: /^Signed (.+)$/, key: 'ledger.signed', category: 'transfers', params: m => ({ name: m[1] }) },
  { re: /^Released (.+) \(severance\)$/, key: 'ledger.released', category: 'transfers', params: m => ({ name: m[1] }) },
  {
    re: /^Prize money \(finished (\d+) in Division (\d+)\)$/,
    key: 'ledger.prizeMoney',
    category: 'prize',
    params: m => ({ p: m[1], d: m[2] }),
  },
  { re: /^Cup winners prize$/, key: 'ledger.cupWinners', category: 'prize' },
  { re: /^Cup runners-up prize$/, key: 'ledger.cupRunnersUp', category: 'prize' },
  {
    re: /^Stadium expansion complete \(\+(\d+) seats\)$/,
    key: 'ledger.stadiumExpansionComplete',
    category: 'stadium',
    params: m => ({ n: m[1] }),
  },
  {
    re: /^Stadium expansion \(\+(\d+) seats\)$/,
    key: 'ledger.stadiumExpansion',
    category: 'stadium',
    params: m => ({ n: m[1] }),
  },
]

export function describeLedger(label: string): { text: string; category: LedgerCategory } {
  for (const pattern of PATTERNS) {
    const m = label.match(pattern.re)
    if (m) return { text: t(pattern.key, pattern.params?.(m)), category: pattern.category }
  }
  return { text: label, category: 'other' }
}
