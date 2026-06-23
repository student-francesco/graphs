import * as d3 from 'd3'
import { renderStep, type ChartModule } from '../engine/index.ts'
import type { SeriesDataPoint } from '../types.ts'
import { AnimationCtx, DisplaySeries, Scales, VisibleSeries } from './tokens.ts'

/**
 * Per-point value labels. Bound to display data WITHOUT exit points (unlike
 * dots); tweens whenever the pass animates — including transition mode, where
 * labels deliberately ride the scroll container AND tween (a preserved quirk of
 * the original implementation).
 */
export function valueLabelsModule(): ChartModule {
  return {
    id: 'value-labels',
    defaults: { showLabels: false, labelFormat: null },

    render: [
      renderStep({
        id: 'value-labels.render',
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

            if (!s.resolved.showLabels) {
              g.selectAll('.lc-label').remove()
              continue
            }

            const fmt = d3.format(s.resolved.labelFormat)
            const color = s.resolved.color
            const dotRadius = s.resolved.dotRadius
            const offsetY = dotRadius > 0 ? -(dotRadius + 5) : -8
            const yScale = scales.y.get(s.resolved.axisId) ?? primary!

            const labels = g
              .selectAll<SVGTextElement, SeriesDataPoint>('.lc-label')
              .data(display.get(s.id) ?? [], d => d.date.getTime())

            const enter = labels
              .enter()
              .append('text')
              .attr('class', 'lc-label')
              .attr('x', d => scales.x(d.date))
              .attr('y', d => yScale(d.value) + offsetY)
              .attr('text-anchor', 'middle')
              .attr('font-size', '10px')
              .attr('font-family', 'sans-serif')
              .attr('fill', color)
              .attr('pointer-events', 'none')
              .style('opacity', 0)
              .text(d => fmt(d.value))

            const merged = enter.merge(labels).attr('fill', color).text(d => fmt(d.value))

            anim.position(merged, 'free', sel =>
              sel
                .attr('x', (d: SeriesDataPoint) => scales.x(d.date))
                .attr('y', (d: SeriesDataPoint) => yScale(d.value) + offsetY)
                .style('opacity', 1),
            )

            labels
              .exit()
              .transition()
              .duration(anim.duration > 0 ? anim.duration : 0)
              .style('opacity', 0)
              .remove()
          }
        },
      }),
    ],
  }
}
