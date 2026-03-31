import * as d3 from 'd3'
import type { AnimationMode, ChartSettings } from './types.ts'

export interface AxesConfig {
  /** Container for the fixed y-axis (stays in innerG, outside chart area) */
  g: d3.Selection<SVGGElement, unknown, null, undefined>
  /** Container for the static x-axis baseline line (lc-chart-area — clipped but never scrolls) */
  chartAreaG: d3.Selection<SVGGElement, unknown, null, undefined>
  /** Container for grids and x-axis ticks (lc-scroll-container — scrolls with data) */
  scrollG: d3.Selection<SVGGElement, unknown, null, undefined>
  xScale: d3.ScaleTime<number, number>
  yScale: d3.ScaleLinear<number, number>
  innerWidth: number
  innerHeight: number
  settings: ChartSettings
  mode: AnimationMode
  duration: number
  ease: (t: number) => number
}

export function renderAxes(config: AxesConfig): void {
  const { g, chartAreaG, scrollG, xScale, yScale, innerWidth, innerHeight, settings, mode, duration, ease } = config
  const animate = mode !== 'none'
  // In transition mode the container scroll drives all horizontal motion — elements
  // must snap to their final positions so they move as one unit with the container.
  const animateScrollContent = animate && mode !== 'transition'

  // ---- Grid ----
  if (settings.showGrid) {
    const yGrid = scrollG.select<SVGGElement>('.lc-grid-y')
    const yGridEl = yGrid.empty()
      ? scrollG.insert('g', ':first-child').attr('class', 'lc-grid-y')
      : yGrid

    const yGridAxis = d3.axisLeft(yScale).tickSize(-innerWidth).tickFormat(() => '')
    const applyYGrid = (sel: d3.Selection<SVGGElement, unknown, null, undefined>) => {
      sel.call(yGridAxis)
      sel.select('.domain').remove()
      sel.selectAll('.tick line')
        .attr('stroke', settings.gridColor)
        .attr('stroke-opacity', settings.gridOpacity)
        .attr('stroke-dasharray', '3,3')
    }

    if (animateScrollContent) {
      yGridEl.transition().duration(duration).call(applyYGrid as never)
    } else {
      applyYGrid(yGridEl)
    }

    const xGrid = scrollG.select<SVGGElement>('.lc-grid-x')
    const xGridEl = xGrid.empty()
      ? scrollG.insert('g', ':first-child').attr('class', 'lc-grid-x')
      : xGrid

    const xGridAxis = d3.axisBottom(xScale).tickSize(-innerHeight).tickFormat(() => '')
    const applyXGrid = (sel: d3.Selection<SVGGElement, unknown, null, undefined>) => {
      sel.attr('transform', `translate(0,${innerHeight})`)
      sel.call(xGridAxis)
      sel.select('.domain').remove()
      sel.selectAll('.tick line')
        .attr('stroke', settings.gridColor)
        .attr('stroke-opacity', settings.gridOpacity)
        .attr('stroke-dasharray', '3,3')
    }

    if (animateScrollContent) {
      xGridEl.transition().duration(duration).ease(ease).call(applyXGrid as never)
    } else {
      applyXGrid(xGridEl)
    }
  } else {
    scrollG.selectAll('.lc-grid-x,.lc-grid-y').remove()
  }

  // ---- X Axis baseline (static — lives in chart area, never scrolls) ----
  const baseline = chartAreaG.select<SVGLineElement>('.lc-x-axis-line')
  const baselineEl = baseline.empty()
    ? chartAreaG.append('line').attr('class', 'lc-x-axis-line')
    : baseline
  baselineEl
    .attr('stroke', 'currentColor')
    .attr('x1', 0)
    .attr('y1', innerHeight)
    .attr('x2', innerWidth)
    .attr('y2', innerHeight)

  // ---- X Axis ticks (data-join — managed like dots, inside scroll container) ----
  const ticks = xScale.ticks()
  const defaultFormatter = xScale.tickFormat()
  const formatTick = (d: Date, i: number): string =>
    settings.xAxisFormatter ? settings.xAxisFormatter(d, i) : defaultFormatter(d)

  const tickSel = scrollG
    .selectAll<SVGGElement, Date>('.lc-x-tick')
    .data(ticks, d => d.getTime())

  // Enter: new ticks placed at their final x position immediately
  const enterG = tickSel
    .enter()
    .append('g')
    .attr('class', 'lc-x-tick')
    .attr('transform', d => `translate(${xScale(d)}, ${innerHeight})`)

  enterG
    .append('line')
    .attr('stroke', 'currentColor')
    .attr('y2', 6)

  enterG
    .append('text')
    .attr('fill', 'currentColor')
    .attr('font-size', '10px')
    .attr('font-family', 'sans-serif')
    .attr('dy', '0.71em')
    .attr('y', 9)
    .attr('text-anchor', 'middle')
    .text((d, i) => formatTick(d, i))

  const merged = enterG.merge(tickSel)
  merged.select('text').text((d, i) => formatTick(d, i))

  if (mode === 'transition') {
    // Snap all ticks to their final positions — the container scroll carries them.
    merged.attr('transform', d => `translate(${xScale(d)}, ${innerHeight})`)
  } else if (animateScrollContent && duration > 0) {
    merged
      .transition()
      .duration(duration)
      .ease(ease)
      .attr('transform', d => `translate(${xScale(d)}, ${innerHeight})`)
  } else {
    merged.attr('transform', d => `translate(${xScale(d)}, ${innerHeight})`)
  }

  // Rename class immediately so future joins never see these elements again,
  // then fade them out independently of any subsequent render.
  const exitTicks = tickSel.exit<Date>().attr('class', 'lc-x-tick-exiting')
  if (duration > 0) {
    exitTicks.transition().duration(duration).ease(ease).style('opacity', 0).remove()
  } else {
    exitTicks.remove()
  }

  // ---- Y Axis (fixed, in innerG — rendered on top of chart area) ----
  const yAxisGen = d3.axisLeft(yScale)
  if (settings.yAxisFormatter !== null) {
    yAxisGen.tickFormat((d, i) => settings.yAxisFormatter!(d as number, i))
  }

  const yAxisEl = g.select<SVGGElement>('.lc-y-axis')
  const yAxis = yAxisEl.empty()
    ? g.append('g').attr('class', 'lc-y-axis')
    : yAxisEl

  if (animate && duration > 0) {
    yAxis.transition().duration(duration).call(yAxisGen)
  } else {
    yAxis.call(yAxisGen)
  }
}