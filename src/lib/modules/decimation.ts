import { prepareStep, type ChartModule } from '../engine/index.ts'
import { lttb } from '../transforms.ts'
import type { DataPoint } from '../types.ts'
import { DisplaySeries, SmoothedSeries, VisibleSeries } from './tokens.ts'

/**
 * LTTB decimation as a data-pipeline module: smoothed points → display points.
 * Decimation deliberately does NOT participate in the scale domain (the full
 * smoothed extent stays authoritative). Reusable by any chart whose data flows
 * through the VisibleSeries/SmoothedSeries tokens.
 */
export function decimationModule(): ChartModule {
  const memo = new Map<
    string,
    { input: readonly DataPoint[]; threshold: number; out: readonly DataPoint[] }
  >()

  return {
    id: 'decimation',
    defaults: { decimation: 0 },

    prepare: [
      prepareStep({
        id: 'decimation.apply',
        reads: { smoothed: SmoothedSeries, visible: VisibleSeries },
        provides: DisplaySeries,
        run: ({ smoothed, visible }): ReadonlyMap<string, readonly DataPoint[]> => {
          const out = new Map<string, readonly DataPoint[]>()
          for (const s of visible.values()) {
            const input = smoothed.get(s.id) ?? []
            const threshold = s.resolved.decimation
            const cached = memo.get(s.id)
            if (cached && cached.input === input && cached.threshold === threshold) {
              out.set(s.id, cached.out)
              continue
            }
            const display = threshold === 0 ? input : lttb(input as DataPoint[], threshold)
            memo.set(s.id, { input, threshold, out: display })
            out.set(s.id, display)
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
