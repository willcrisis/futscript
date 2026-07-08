import { describe, expect, it } from 'vitest'
import { newGame } from './newGame'
import { NEWS_CAP, pushNews } from './news'

describe('pushNews', () => {
  it('appends stamped items and defaults the week to the current round', () => {
    const s0 = { ...newGame(1), season: 2, round: 7 }
    const s1 = pushNews(s0, 'heavyWin', { winner: 'A', loser: 'B', score: '5-0' })
    expect(s1.news).toHaveLength(1)
    expect(s1.news[0]).toEqual({ season: 2, week: 7, type: 'heavyWin', params: { winner: 'A', loser: 'B', score: '5-0' } })
    expect(s0.news).toHaveLength(0) // pure
    const s2 = pushNews(s1, 'cupWinner', { club: 'C' }, 36)
    expect(s2.news[1].week).toBe(36) // explicit week override
  })

  it('caps at NEWS_CAP dropping the oldest', () => {
    let s = newGame(1)
    for (let i = 0; i < NEWS_CAP + 5; i++) s = pushNews(s, 'heavyWin', { i })
    expect(s.news).toHaveLength(NEWS_CAP)
    expect(s.news[0].params.i).toBe(5) // 0..4 dropped
    expect(s.news[NEWS_CAP - 1].params.i).toBe(NEWS_CAP + 4)
  })
})
