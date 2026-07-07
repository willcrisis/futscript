// ponytail: stadium economy constants — retune here and nowhere else
export const INITIAL_CAPACITY: Record<number, number> = { 1: 25_000, 2: 15_000, 3: 9_000 }
export const EXPANSION = { seats: 2000, cost: 600_000, weeks: 6 }

export function clampMood(mood: number): number {
  return Math.max(0, Math.min(100, mood))
}
