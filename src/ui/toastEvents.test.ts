import { describe, expect, it } from 'vitest'
import { newGame } from '../engine/newGame'
import { pushNews } from '../engine/news'
import { setLang } from '../i18n'
import { detectToasts } from './toastEvents'

describe('detectToasts', () => {
  it('projects new toastable news items and ignores rail-only types', () => {
    setLang('en')
    const prev = newGame(1)
    let next = pushNews(prev, 'userSold', { player: 'Test Player', amount: 100_000 })
    next = pushNews(next, 'heavyWin', { winner: 'A', loser: 'B', score: '5-0' }) // rail-only
    const toasts = detectToasts(prev, next)
    expect(toasts).toHaveLength(1)
    expect(toasts[0].tone).toBe('accent')
    expect(toasts[0].text).toContain('Test Player')
  })

  it('survives the news cap (identity diff, not length diff)', () => {
    let prev = newGame(2)
    for (let i = 0; i < 60; i++) prev = pushNews(prev, 'heavyWin', { winner: 'A', loser: 'B', score: '4-0', i })
    const next = pushNews(prev, 'boardWarning', { n: 6 }) // cap: one old item drops, lengths equal
    expect(next.news).toHaveLength(prev.news.length)
    const toasts = detectToasts(prev, next)
    expect(toasts).toHaveLength(1)
    expect(toasts[0].tone).toBe('danger')
  })

  it('caps at three toasts per tick', () => {
    const prev = newGame(3)
    let next = prev
    for (let i = 0; i < 5; i++) next = pushNews(next, 'userSigned', { player: `P${i}`, amount: 1000 })
    expect(detectToasts(prev, next)).toHaveLength(3)
  })
})
