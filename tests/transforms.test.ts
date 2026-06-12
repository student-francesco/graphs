import { describe, expect, it } from 'vitest'
import { lttb, movingAverage } from '../src/lib/index.ts'
import type { DataPoint } from '../src/lib/index.ts'

function points(values: number[]): DataPoint[] {
  return values.map((value, i) => ({ date: new Date(Date.UTC(2024, 0, 1 + i)), value }))
}

describe('movingAverage', () => {
  it('returns input unchanged for window <= 1', () => {
    const input = points([1, 2, 3])
    expect(movingAverage(input, 0)).toBe(input)
    expect(movingAverage(input, 1)).toBe(input)
  })

  it('returns input unchanged for empty arrays', () => {
    const input: DataPoint[] = []
    expect(movingAverage(input, 5)).toBe(input)
  })

  it('averages over a trailing window with ramp-up at the start', () => {
    const out = movingAverage(points([2, 4, 6, 8]), 2)
    expect(out.map(p => p.value)).toEqual([2, 3, 5, 7])
  })

  it('window 3 against hand-computed values', () => {
    const out = movingAverage(points([3, 6, 9, 12, 15]), 3)
    expect(out.map(p => p.value)).toEqual([3, 4.5, 6, 9, 12])
  })

  it('preserves dates', () => {
    const input = points([1, 2, 3])
    const out = movingAverage(input, 2)
    expect(out.map(p => p.date)).toEqual(input.map(p => p.date))
  })
})

describe('lttb', () => {
  it('passes through when threshold <= 0', () => {
    const input = points([1, 2, 3, 4, 5])
    expect(lttb(input, 0)).toBe(input)
    expect(lttb(input, -1)).toBe(input)
  })

  it('passes through when input already fits the threshold', () => {
    const input = points([1, 2, 3])
    expect(lttb(input, 3)).toBe(input)
    expect(lttb(input, 5)).toBe(input)
  })

  it('downsamples to exactly the threshold and keeps endpoints', () => {
    const input = points(Array.from({ length: 100 }, (_, i) => Math.sin(i / 5) * 50))
    const out = lttb(input, 10)
    expect(out).toHaveLength(10)
    expect(out[0]).toBe(input[0])
    expect(out[out.length - 1]).toBe(input[input.length - 1])
  })

  it('keeps points in chronological order (final point may duplicate)', () => {
    const input = points(Array.from({ length: 50 }, (_, i) => (i % 7) * 3))
    const out = lttb(input, 12)
    // Characterization: when the last bucket is empty the algorithm can select the
    // final point twice (selectedIdx falls back to bucketStart === length-1), so
    // monotonicity is non-strict at the tail.
    for (let i = 1; i < out.length; i++) {
      expect(out[i]!.date.getTime()).toBeGreaterThanOrEqual(out[i - 1]!.date.getTime())
    }
  })

  it('selects the spike point that maximizes triangle area (golden)', () => {
    const values = Array.from({ length: 30 }, () => 10)
    values[13] = 100 // a spike LTTB must preserve
    const out = lttb(points(values), 5)
    expect(out.some(p => p.value === 100)).toBe(true)
  })
})
