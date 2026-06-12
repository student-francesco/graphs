import * as d3 from 'd3'
import { renderStep, type ChartModule } from '../engine/index.ts'
import { AnimationCtx, AxisLayouts, HasData, Layout, Scales } from './tokens.ts'

/**
 * Grid lines, driven by the primary axis's scale and the shared tick arrays from
 * the scales module — grid lines and axis ticks can never disagree. Lives in the
 * scroll layer below all series content; snaps in transition mode (the container
 * carries the motion).
 */
export function gridModule(): ChartModule {
  return {
    id: 'grid',
    defaults: { showGrid: true, gridColor: '#e5e7eb', gridOpacity: 0.7 },

    render: [
      renderStep({
        id: 'grid.render',
        reads: {
          scales: Scales,
          axisLayouts: AxisLayouts,
          layout: Layout,
          anim: AnimationCtx,
          hasData: HasData,
        },
        layer: { name: 'grid', z: 10, host: 'scroll' },
        run: ({ scales, axisLayouts, layout, anim, hasData }, ctx) => {
          const g = ctx.layer!
          const primary = axisLayouts[0]!
          if (!hasData || !primary.showGrid) {
            g.selectAll('.lc-grid-x,.lc-grid-y').remove()
            return
          }

          const { innerWidth, innerHeight } = layout
          const primaryYScale = scales.y.get(primary.id)!
          const yTickValues = scales.yTicks.get(primary.id) ?? []

          const yGrid = g.select<SVGGElement>('.lc-grid-y')
          const yGridEl = yGrid.empty()
            ? g.insert('g', ':first-child').attr('class', 'lc-grid-y')
            : yGrid
          const yGridAxis = d3
            .axisLeft(primaryYScale)
            .tickValues(yTickValues as number[])
            .tickSize(-innerWidth)
            .tickFormat(() => '')
          const applyYGrid = (sel: d3.Selection<SVGGElement, unknown, null, undefined>): void => {
            sel.call(yGridAxis)
            sel.select('.domain').remove()
            sel
              .selectAll('.tick line')
              .attr('stroke', primary.gridColor)
              .attr('stroke-opacity', primary.gridOpacity)
              .attr('stroke-dasharray', '3,3')
          }
          anim.position(yGridEl, 'scrolled', s =>
            applyYGrid(s as d3.Selection<SVGGElement, unknown, null, undefined>),
          )

          const xGrid = g.select<SVGGElement>('.lc-grid-x')
          const xGridEl = xGrid.empty()
            ? g.insert('g', ':first-child').attr('class', 'lc-grid-x')
            : xGrid
          const xGridAxis = d3
            .axisBottom(scales.x)
            .tickValues(scales.xTicks as Date[])
            .tickSize(-innerHeight)
            .tickFormat(() => '')
          const applyXGrid = (sel: d3.Selection<SVGGElement, unknown, null, undefined>): void => {
            sel.attr('transform', `translate(0,${innerHeight})`)
            sel.call(xGridAxis)
            sel.select('.domain').remove()
            sel
              .selectAll('.tick line')
              .attr('stroke', primary.gridColor)
              .attr('stroke-opacity', primary.gridOpacity)
              .attr('stroke-dasharray', '3,3')
          }
          anim.position(xGridEl, 'scrolled', s =>
            applyXGrid(s as d3.Selection<SVGGElement, unknown, null, undefined>),
          )
        },
      }),
    ],
  }
}
