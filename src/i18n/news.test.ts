import { describe, expect, it } from 'vitest'
import type { NewsItem } from '../engine/types'
import { setLang } from './index'
import { newsText } from './news'

const item = (type: NewsItem['type'], params: NewsItem['params']): NewsItem =>
  ({ season: 1, week: 3, type, params })

describe('newsText', () => {
  it('formats every news type in both languages', () => {
    setLang('en')
    expect(newsText(item('userSigned', { player: 'João', amount: 250000 }))).toContain('João')
    expect(newsText(item('userSigned', { player: 'João', amount: 250000 }))).toContain('$250,000')
    expect(newsText(item('heavyWin', { winner: 'A', loser: 'B', score: '5-0' }))).toContain('5-0')
    setLang('pt')
    expect(newsText(item('champions', { club: 'Sereno FC', division: 2 }))).toContain('Sereno FC')
    setLang('en')
  })
})
