import type { LineChartHandle, RawDataPoint } from '../lib/index.ts'

export interface AxisRecord {
  name: string
  color: string
  range?: [number, number]
  limits?: [number, number]
}

/**
 * Shared harness state threaded through every tab module. Mirrors what a Blazor
 * component would track on its side of the interop boundary.
 */
export interface Harness {
  chart: LineChartHandle
  impl: 'monolith' | 'modules'
  setLog(msg: string): void
  /** Per-series data store for append operations */
  seriesDataMap: Map<string, RawDataPoint[]>
  seriesColorMap: Map<string, string>
  axisRecords: Map<string, AxisRecord>
  activeSeriesId(): string
  activeAxisId(): string
  /** Iterate every series with at least one point. */
  forEachLiveSeries(fn: (id: string, data: RawDataPoint[]) => void): void
}

/** Palette matching the one used by the library for visual consistency */
export const PALETTE = [
  '#e11d48', '#0891b2', '#16a34a', '#d97706', '#7c3aed', '#db2777', '#0284c7', '#4f46e5',
]

export function createHarness(chart: LineChartHandle, impl: Harness['impl']): Harness {
  const log = document.getElementById('log')!
  const seriesDataMap = new Map<string, RawDataPoint[]>([['default', []]])
  return {
    chart,
    impl,
    setLog: msg => {
      log.textContent = msg
    },
    seriesDataMap,
    seriesColorMap: new Map([['default', '#4f46e5']]),
    axisRecords: new Map([['default', { name: 'default', color: '#4f46e5' }]]),
    activeSeriesId: () => (document.getElementById('series-select') as HTMLSelectElement).value,
    activeAxisId: () => (document.getElementById('axis-select') as HTMLSelectElement).value,
    forEachLiveSeries: fn => {
      for (const [id, data] of seriesDataMap.entries()) {
        if (data.length > 0) fn(id, data)
      }
    },
  }
}
