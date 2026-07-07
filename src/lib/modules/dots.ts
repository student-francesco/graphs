import { renderStep, type ChartModule } from '@/lib/engine/index.ts'
import type { InternalDataPoint } from '@/lib/types.ts'
import { AnimationCtx, DisplaySeries, LineBlurFilter, Scales, VisibleSeries } from './tokens.ts'

/**
 * Dot markers per series. The join always includes pending exit points (they
 * keep the line's left edge visually continuous under the fade mask); dots
 * leaving the join are renamed, marked for the transition reshift, and faded.
 */
export function dotsModule(): ChartModule {
  return {
    id: 'dots',
    defaults: { dotRadius: 4, dotBorderColor: null },

    render: [
      renderStep({
        id: 'dots.render',
        reads: {
          visible: VisibleSeries,
          display: DisplaySeries,
          scales: Scales,
          anim: AnimationCtx,
          lineBlurFilter: LineBlurFilter,
        },
        layer: { name: 'series', z: 30, host: 'scroll' },
        run: ({ visible, display, scales, anim, lineBlurFilter }, ctx) => {
          const layer = ctx.layer!
          const primary = scales.y.values().next().value
          for (const s of visible.values()) {
            const g = layer.select<SVGGElement>(`.lc-series[data-id="${s.id}"]`)
            if (g.empty()) continue

            const dotRadius = s.resolved.dotRadius
            if (dotRadius === 0) {
              g.selectAll('.lc-dot,.lc-dot-exiting').remove()
              continue
            }

            const displayPoints = display.get(s.id) ?? []
            const joinData: InternalDataPoint[] =
              s.exit.length > 0 ? [...s.exit, ...displayPoints] : [...displayPoints]

            const yScale = scales.y.get(s.resolved.axisId) ?? primary!
            const dots = g
              .selectAll<SVGCircleElement, InternalDataPoint>('.lc-dot')
              .data(joinData, d => +d.x)

            const enter = dots
              .enter()
              .append('circle')
              .attr('class', 'lc-dot')
              .attr('cx', d => scales.x(d.x))
              .attr('cy', d => yScale(d.y))
              .attr('r', 0)
              .attr('stroke-width', 2)

            const merged = enter
              .merge(dots)
              .attr('fill', s.resolved.color)
              .attr('stroke', s.resolved.dotBorderColor)
              .attr('filter', lineBlurFilter)

            anim.position(merged, 'marker', sel =>
              sel
                .attr('cx', (d: InternalDataPoint) => scales.x(d.x))
                .attr('cy', (d: InternalDataPoint) => yScale(d.y))
                .attr('r', dotRadius),
            )

            anim.fadeOutExit(dots.exit(), 'lc-dot-exiting', { kind: 'attr-x', attr: 'cx' })
          }
        },
      }),
    ],
  }
}
