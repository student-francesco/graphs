import * as d3 from 'd3'
import { renderStep, type ChartModule } from '../engine/index.ts'
import { CURVE_MAP } from '../d3-maps.ts'
import type { DataPoint } from '../types.ts'
import { AnimationCtx, DisplaySeries, Scales, VisibleSeries } from './tokens.ts'

/**
 * The line path per series. Renders into the per-series groups owned by the
 * series host (registration order puts the path under dots and labels inside
 * each group). All animation-mode behavior — drawOn reveal, morph tween with
 * exit points, transition snap — lives in AnimationCtx.renderPath.
 */
export function geometryLineModule(): ChartModule {
  return {
    id: 'line',
    defaults: { lineColor: '#4f46e5', lineWeight: 2, curveType: 'monotoneX' },

    render: [
      renderStep({
        id: 'line.render',
        reads: {
          visible: VisibleSeries,
          display: DisplaySeries,
          scales: Scales,
          anim: AnimationCtx,
        },
        layer: { name: 'series', z: 30, host: 'scroll' },
        run: ({ visible, display, scales, anim }, ctx) => {
          const layer = ctx.layer!
          const primary = scales.y.values().next().value
          for (const s of visible.values()) {
            const g = layer.select<SVGGElement>(`.lc-series[data-id="${s.id}"]`)
            if (g.empty()) continue

            const yScale = scales.y.get(s.resolved.axisId) ?? primary!
            const lineGen = d3
              .line<DataPoint>()
              .x(d => scales.x(d.date))
              .y(d => yScale(d.value))
              .curve(CURVE_MAP[s.resolved.curveType])

            const existing = g.select<SVGPathElement>('.lc-line')
            const isNew = existing.empty()
            const path = (isNew ? g.append('path') : existing)
              .attr('class', 'lc-line')
              .attr('fill', 'none')
              .attr('stroke', s.resolved.color)
              .attr('stroke-width', s.resolved.lineWeight)
              .attr('stroke-linecap', 'round')
              .attr('stroke-linejoin', 'round')

            anim.renderPath(path, {
              gen: lineGen,
              display: display.get(s.id) ?? [],
              exit: s.exit,
              isNew,
            })
          }
        },
      }),
    ],
  }
}
