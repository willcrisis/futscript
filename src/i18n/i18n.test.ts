import { describe, expect, it } from 'vitest'
import { en } from './en'
import { pt } from './pt'
import { t, setLang, getLang } from './index'

describe('dictionaries', () => {
  it('pt covers every en key with a non-empty string', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(pt[key], `pt missing ${key}`).toBeTruthy()
    }
  })
})

describe('t', () => {
  it('resolves keys in the active language and interpolates params', () => {
    setLang('en')
    expect(t('nav.home')).toBe('Home')
    setLang('pt')
    expect(t('nav.home')).toBe('Início')
    expect(getLang()).toBe('pt')
    setLang('en')
  })

  it('interpolates {param} placeholders', () => {
    setLang('en')
    expect(t('common.weeksShort', { n: 3 })).toBe('3w')
  })
})
