import { describe, expect, it } from 'vitest'
import { mulberry32, randInt } from './rng'

describe('mulberry32', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const seqA = [a(), a(), a(), a(), a()]
    const seqB = [b(), b(), b(), b(), b()]
    expect(seqA).toEqual(seqB)
  })

  it('produces values in [0, 1)', () => {
    const rand = mulberry32(7)
    for (let i = 0; i < 1000; i++) {
      const v = rand()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('randInt', () => {
  it('stays within inclusive bounds and hits both ends', () => {
    const rand = mulberry32(1)
    const seen = new Set<number>()
    for (let i = 0; i < 1000; i++) seen.add(randInt(rand, 1, 5))
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5])
  })
})
