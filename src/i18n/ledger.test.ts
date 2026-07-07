import { describe, expect, it } from 'vitest'
import { setLang } from './index'
import { describeLedger } from './ledger'

describe('describeLedger', () => {
  it('translates every engine label shape', () => {
    setLang('pt')
    expect(describeLedger('Wages')).toEqual({ text: 'Salários', category: 'wages' })
    expect(describeLedger('Gate receipts (12345 fans)').text).toContain('12345')
    expect(describeLedger('Sold João Silva').text).toContain('João Silva')
    expect(describeLedger('Prize money (finished 3 in Division 2)').text).toMatch(/3/)
    expect(describeLedger('Stadium expansion complete (+2000 seats)').category).toBe('stadium')
    setLang('en')
    expect(describeLedger('Wages')).toEqual({ text: 'Wages', category: 'wages' })
  })

  it('passes unknown labels through as other', () => {
    expect(describeLedger('Mystery payment')).toEqual({ text: 'Mystery payment', category: 'other' })
  })

  it('categorizes for the finance summary', () => {
    expect(describeLedger('Sponsors').category).toBe('sponsors')
    expect(describeLedger('Deposit interest').category).toBe('interest')
    expect(describeLedger('Loan drawn').category).toBe('loan')
    expect(describeLedger('Signed Pelé').category).toBe('transfers')
  })
})
