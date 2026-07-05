import { describe, expect, it } from 'vitest'
import { mulberry32 } from './rng'

describe('mulberry32', () => {
  it('is deterministic for the same seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('yields values in [0, 1) with different sequences per seed', () => {
    const a = mulberry32(1)
    const b = mulberry32(2)
    const va = Array.from({ length: 100 }, a)
    expect(va.every((v) => v >= 0 && v < 1)).toBe(true)
    expect(va).not.toEqual(Array.from({ length: 100 }, b))
  })
})
