import { describe, expect, it } from 'vitest'
import { isPastWeek } from './NewsRail'
import type { NewsItem } from '../engine/types'

const item = (season: number, week: number): NewsItem => ({ season, week, type: 'userSigned', params: {} })

describe('isPastWeek', () => {
  it('is false for the newest week', () => {
    expect(isPastWeek(item(2, 10), { season: 2, week: 10 })).toBe(false)
  })
  it('is true for an earlier week in the same season', () => {
    expect(isPastWeek(item(2, 9), { season: 2, week: 10 })).toBe(true)
  })
  it('is true for an earlier season regardless of week', () => {
    expect(isPastWeek(item(1, 30), { season: 2, week: 1 })).toBe(true)
  })
})
