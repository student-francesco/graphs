import { renderStep, type ChartModule } from '../engine/index.ts'
import type { DataPoint } from '../types.ts'
import { AnimationCtx, DisplaySeries, Scales, VisibleSeries } from './tokens.ts'

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
        },
        layer: { name: 'series', z: 30, host: 'scroll' },
        run: ({ visible, display, scales, anim }, ctx) => {
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
            const joinData =
              s.exit.length > 0 ? [...s.exit, ...displayPoints] : (displayPoints as DataPoint[])

            const yScale = scales.y.get(s.resolved.axisId) ?? primary!
            const dots = g
              .selectAll<SVGCircleElement, DataPoint>('.lc-dot')
              .data(joinData, d => d.date.getTime())

            const enter = dots
              .enter()
              .append('circle')
              .attr('class', 'lc-dot')
              .attr('cx', d => scales.x(d.date))
              .attr('cy', d => yScale(d.value))
              .attr('r', 0)
              .attr('stroke-width', 2)

            const merged = enter
              .merge(dots)
              .attr('fill', s.resolved.color)
              .attr('stroke', s.resolved.dotBorderColor)

            anim.position(merged, 'marker', sel =>
              sel
                .attr('cx', (d: DataPoint) => scales.x(d.date))
                .attr('cy', (d: DataPoint) => yScale(d.value))
                .attr('r', dotRadius),
            )

            anim.fadeOutExit(dots.exit(), 'lc-dot-exiting', { kind: 'attr-x', attr: 'cx' })
          }
        },
      }),
    ],
  }
}
