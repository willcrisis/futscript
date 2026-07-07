import { useSyncExternalStore } from 'react'
import { en } from './en'
import type { TranslationKey } from './en'
import { pt } from './pt'

export type Lang = 'en' | 'pt'
export type { TranslationKey }

const KEY = 'futscript-lang'
const DICTS: Record<Lang, Record<TranslationKey, string>> = { en, pt }

function storedLang(): Lang | null {
  if (typeof localStorage === 'undefined') return null
  const raw = localStorage.getItem(KEY)
  return raw === 'en' || raw === 'pt' ? raw : null
}

function browserLang(): Lang {
  if (typeof navigator === 'undefined') return 'en'
  return navigator.language?.toLowerCase().startsWith('pt') ? 'pt' : 'en'
}

let current: Lang = storedLang() ?? browserLang()
const listeners = new Set<() => void>()

export function getLang(): Lang {
  return current
}

export function setLang(lang: Lang): void {
  current = lang
  if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, lang)
  for (const fn of listeners) fn()
}

export function useLang(): Lang {
  return useSyncExternalStore(
    fn => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    getLang,
    getLang,
  )
}

export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  let out: string = DICTS[current][key]
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      out = out.replaceAll(`{${name}}`, String(value))
    }
  }
  return out
}
