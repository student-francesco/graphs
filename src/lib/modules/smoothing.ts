import { prepareStep, type ChartModule } from '../engine/index.ts'
import { movingAverage } from '../transforms.ts'
import type { SeriesDataPoint } from '../types.ts'
import { SmoothedSeries, VisibleSeries } from './tokens.ts'

/**
 * Moving-average smoothing as a data-pipeline module. Output feeds the y
 * auto-extent (smoothing affects the domain; decimation does not) and the
 * display pipeline. Per-series memoization keeps array identity stable for
 * unchanged series, so downstream diffs stay quiet.
 */
export function smoothingModule(): ChartModule {
  const memo = new Map<string, { raw: readonly SeriesDataPoint[]; window: number; out: readonly SeriesDataPoint[] }>()

  return {
    id: 'smoothing',
    defaults: { smoothing: 0 },

    prepare: [
      prepareStep({
        id: 'smoothing.apply',
        reads: { visible: VisibleSeries },
        provides: SmoothedSeries,
        run: ({ visible }): ReadonlyMap<string, readonly SeriesDataPoint[]> => {
          const out = new Map<string, readonly SeriesDataPoint[]>()
          for (const s of visible.values()) {
            const window = s.resolved.smoothing
            const cached = memo.get(s.id)
            if (cached && cached.raw === s.raw && cached.window === window) {
              out.set(s.id, cached.out)
              continue
            }
            const smoothed = movingAverage(s.raw as SeriesDataPoint[], window)
            memo.set(s.id, { raw: s.raw, window, out: smoothed })
            out.set(s.id, smoothed)
          }
          for (const id of memo.keys()) {
            if (!visible.has(id)) memo.delete(id)
          }
          return out
        },
      }),
    ],
  }
}
