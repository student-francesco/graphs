import * as d3 from 'd3'
import type { AnimationMode, ChartSettings } from './types.ts'

export interface AxesConfig {
  /** Container for the fixed y-axis (stays outside the scroll container) */
  g: d3.Selection<SVGGElement, unknown, null, undefined>
  /** Container for grids and x-axis ticks (inside the scroll container) */
  scrollG: d3.Selection<SVGGElement, unknown, null, undefined>
  xScale: d3.ScaleTime<number, number>
  yScale: d3.ScaleLinear<number, number>
  innerWidth: number
  innerHeight: number
  settings: ChartSettings
  mode: AnimationMode
  duration: number
}

export function renderAxes(config: AxesConfig): void {
  const { g, scrollG, xScale, yScale, innerWidth, innerHeight, settings, mode, duration } = config
  const animate = mode !== 'none'
  // In transition mode the container scroll drives all horizontal motion — axis
  // elements must be placed at their final positions instantly so they move in
  // unison with the container, not via a competing D3 transition.
  const animateXContent = animate && mode !== 'transition'

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

    if (animateXContent) {
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

    if (animateXContent) {
      xGridEl.transition().duration(duration).call(applyXGrid as never)
    } else {
      applyXGrid(xGridEl)
    }
  } else {
    scrollG.selectAll('.lc-grid-x,.lc-grid-y').remove()
  }

  // ---- X Axis ticks (data-join — managed like dots) ----
  const ticks = xScale.ticks()
  const defaultFormatter = xScale.tickFormat()
  const formatTick = (d: Date, i: number): string =>
    settings.xAxisFormatter ? settings.xAxisFormatter(d, i) : defaultFormatter(d)

  const tickSel = scrollG
    .selectAll<SVGGElement, Date>('.lc-x-tick')
    .data(ticks, d => d.getTime())

  // Enter: new ticks start at their final x position
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

  // Update text for all visible ticks
  merged.select('text').text((d, i) => formatTick(d, i))

  if (animateXContent && duration > 0) {
    merged
      .transition()
      .duration(duration)
      .attr('transform', d => `translate(${xScale(d)}, ${innerHeight})`)
    tickSel.exit().remove()
  } else if (mode === 'transition') {
    // Snap to final positions; the container scroll carries everything together
    merged.attr('transform', d => `translate(${xScale(d)}, ${innerHeight})`)
    // Exit ticks stay in DOM until the container scroll completes, then are removed
    tickSel.exit<Date>()
      .transition()
      .delay(duration)
      .duration(0)
      .remove()
  } else {
    merged.attr('transform', d => `translate(${xScale(d)}, ${innerHeight})`)
    tickSel.exit().remove()
  }

  // Axis baseline — extended well beyond visible range so clipping handles edges cleanly
  const baseline = scrollG.select<SVGLineElement>('.lc-x-axis-line')
  const baselineEl = baseline.empty()
    ? scrollG.append('line').attr('class', 'lc-x-axis-line')
    : baseline
  baselineEl
    .attr('stroke', 'currentColor')
    .attr('x1', -innerWidth)
    .attr('y1', innerHeight)
    .attr('x2', innerWidth * 2)
    .attr('y2', innerHeight)

  // ---- Y Axis (fixed, outside scroll container) ----
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