import type { Player } from './types'

// ponytail: economy constants tuned by feel — if seasons come out too rich
// or too poor, retune here and nowhere else
export const STARTING_CASH = 1_000_000
export const LOAN_CAP = 2_000_000

export function salaryFor(level: number): number {
  return Math.round(level * level * 2.5)
}

export function marketValue(p: Player): number {
  const ageFactor = p.age <= 23 ? 1.5 : p.age <= 29 ? 1 : 0.5
  return Math.round(p.level * p.level * 120 * ageFactor)
}

// ~12 weeks of wages per remaining contract season
export function severanceFor(p: Player): number {
  return p.salary * 12 * Math.max(1, p.contractSeasons)
}

export function formatMoney(n: number): string {
  const abs = Math.abs(Math.round(n)).toLocaleString('en-US')
  return n < 0 ? `-$${abs}` : `$${abs}`
}
