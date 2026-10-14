import * as d3 from 'd3'
import { prepareStep, token, type ChartModule } from '@/lib/engine/index.ts'
import { HoverTargets, Scales, Settings, VisibleSeries, type HoverTarget } from './tokens.ts'

const PointTargets = token<readonly HoverTarget[]>('hoverPoints.targets')

/**
 * The line chart's tooltip targets: one hit circle per RAW data point per series
 * (each carries its own axis's pixel y, so multi-axis charts hit accurately),
 * sized max(dotRadius, 8). Owns the tooltip formats; the content (series name on
 * multi-series charts, formatted x, formatted y) is built lazily on hover.
 */
export function hoverPointsModule(): ChartModule {
  return {
    id: 'hover-points',
    defaults: { tooltipDateFormat: '%b %d, %Y', tooltipValueFormat: '.2f' },

    prepare: [
      prepareStep({
        id: 'hoverPoints.targets',
        description: 'One tooltip hit circle per raw data point, at its pixel position on the series’ own axis.',
        reads: { visible: VisibleSeries, scales: Scales, settings: Settings },
        provides: PointTargets,
        contributes: [{ to: HoverTargets, select: targets => targets }],
        run: ({ visible, scales, settings }): readonly HoverTarget[] => {
          const dateFormat = d3.timeFormat(settings.tooltipDateFormat)
          const valueFormat = d3.format(settings.tooltipValueFormat)
          const r = Math.max(
            Math.max(...Array.from(visible.values()).map(s => s.resolved.dotRadius)),
            8,
          )
          const multiSeries = visible.size > 1

          const targets: HoverTarget[] = []
          for (const s of visible.values()) {
            const yScale = scales.y.get(s.resolved.axisId) ?? scales.y.values().next().value!
            for (const d of s.raw) {
              targets.push({
                key: `${+d.x}-${s.id}`,
                shape: { kind: 'circle', cx: scales.x(d.x as never), cy: yScale(d.y), r },
                content: () => ({
                  title: multiSeries ? s.id : undefined,
                  // x is polymorphic (Date | number); the date formatter needs a Date.
                  label: typeof d.x === 'number' ? valueFormat(d.x) : dateFormat(d.x),
                  value: valueFormat(d.y),
                }),
              })
            }
          }
          return targets
        },
      }),
    ],
  }
}
