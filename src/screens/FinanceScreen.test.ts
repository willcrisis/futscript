import { describe, expect, it } from 'vitest'
import type { FinanceEntry } from '../engine/types'
import { summarizeByCategory } from './FinanceScreen'

const entry = (label: string, amount: number): FinanceEntry => ({ season: 1, round: 3, label, amount })

describe('summarizeByCategory', () => {
  it('returns nothing for an empty week', () => {
    expect(summarizeByCategory([])).toEqual([])
  })

  it('sums multiple entries in the same category', () => {
    const totals = summarizeByCategory([entry('Sold Ana', 100), entry('Signed Beto', -40)])
    expect(totals).toEqual([{ category: 'transfers', total: 60 }])
  })

  it('orders income categories first, each side sorted by absolute size', () => {
    const totals = summarizeByCategory([
      entry('Wages', -5000),
      entry('Stadium maintenance', -500),
      entry('Gate receipts (2000 fans)', 20000),
      entry('Sponsors', 3000),
    ])
    expect(totals.map(c => c.category)).toEqual(['gate', 'sponsors', 'wages', 'maintenance'])
  })

  it('keeps a category that nets to zero, since it still had entries this week', () => {
    const totals = summarizeByCategory([entry('Stadium expansion complete (+2000 seats)', 0)])
    expect(totals).toEqual([{ category: 'stadium', total: 0 }])
  })

  it('falls back to "other" for unrecognized labels', () => {
    const totals = summarizeByCategory([entry('Mystery payment', 10)])
    expect(totals).toEqual([{ category: 'other', total: 10 }])
  })
})
