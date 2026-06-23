import { bench, describe } from 'vitest'
import { lttb } from '../src/lib/transforms'
import type { InternalDataPoint } from '../src/lib/types'

// Deterministic, somewhat jagged signal so LTTB's area test has real work to do.
function signal(i: number): number {
  return Math.sin(i / 50) * 100 + Math.sin(i / 7) * 10 + (i % 13)
}

function numericPoints(n: number): InternalDataPoint[] {
  const out: InternalDataPoint[] = new Array(n)
  for (let i = 0; i < n; i++) out[i] = { x: i, y: signal(i) }
  return out
}

function datePoints(n: number): InternalDataPoint[] {
  const base = 1_700_000_000_000 // fixed epoch ms — no Date.now()
  const out: InternalDataPoint[] = new Array(n)
  for (let i = 0; i < n; i++) out[i] = { x: new Date(base + i * 60_000), y: signal(i) }
  return out
}

// Downsample to ~1px-per-point for a typical wide chart.
const TARGET = 2000

const SIZES = [10_000, 100_000, 1_000_000]

for (const n of SIZES) {
  describe(`lttb ${n.toLocaleString()} → ${TARGET}`, () => {
    // Build inputs once, outside the measured region.
    const numeric = numericPoints(n)
    const dates = datePoints(n)

    bench('numeric x', () => {
      lttb(numeric, TARGET)
    })

    bench('Date x', () => {
      lttb(dates, TARGET)
    })
  })
}
