import * as d3 from 'd3'
import type { ChartSettings } from './types.ts'

export interface AxesConfig {
  g: d3.Selection<SVGGElement, unknown, null, undefined>
  xScale: d3.ScaleTime<number, number>
  yScale: d3.ScaleLinear<number, number>
  innerWidth: number
  innerHeight: number
  settings: ChartSettings
  animate: boolean
  duration: number
}

export function renderAxes(config: AxesConfig): void {
  const { g, xScale, yScale, innerWidth, innerHeight, settings, animate, duration } = config

  // ---- Grid ----
  if (settings.showGrid) {
    const yGrid = g.select<SVGGElement>('.lc-grid-y')
    const yGridEl = yGrid.empty()
      ? g.insert('g', ':first-child').attr('class', 'lc-grid-y')
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

    if (animate) {
      yGridEl.transition().duration(duration).call(applyYGrid as never)
    } else {
      applyYGrid(yGridEl)
    }

    const xGrid = g.select<SVGGElement>('.lc-grid-x')
    const xGridEl = xGrid.empty()
      ? g.insert('g', ':first-child').attr('class', 'lc-grid-x').attr('transform', `translate(0,${innerHeight})`)
      : xGrid

    const xGridAxis = d3.axisBottom(xScale).tickSize(-innerHeight).tickFormat(() => '')
    const applyXGrid = (sel: d3.Selection<SVGGElement, unknown, null, undefined>) => {
      sel.call(xGridAxis)
      sel.select('.domain').remove()
      sel.selectAll('.tick line')
        .attr('stroke', settings.gridColor)
        .attr('stroke-opacity', settings.gridOpacity)
        .attr('stroke-dasharray', '3,3')
    }

    xGridEl.attr('transform', `translate(0,${innerHeight})`)
    if (animate) {
      xGridEl.transition().duration(duration).call(applyXGrid as never)
    } else {
      applyXGrid(xGridEl)
    }
  } else {
    g.selectAll('.lc-grid-x,.lc-grid-y').remove()
  }

  // ---- X Axis ----
  const xAxisGen = d3.axisBottom(xScale)
  if (settings.xAxisFormatter !== null) {
    xAxisGen.tickFormat((d, i) => settings.xAxisFormatter!(d as Date, i))
  }

  const xAxisEl = g.select<SVGGElement>('.lc-x-axis')
  const xAxis = xAxisEl.empty()
    ? g.append('g').attr('class', 'lc-x-axis').attr('transform', `translate(0,${innerHeight})`)
    : xAxisEl.attr('transform', `translate(0,${innerHeight})`)

  if (animate) {
    xAxis.transition().duration(duration).call(xAxisGen)
  } else {
    xAxis.call(xAxisGen)
  }

  // ---- Y Axis ----
  const yAxisGen = d3.axisLeft(yScale)
  if (settings.yAxisFormatter !== null) {
    yAxisGen.tickFormat((d, i) => settings.yAxisFormatter!(d as number, i))
  }

  const yAxisEl = g.select<SVGGElement>('.lc-y-axis')
  const yAxis = yAxisEl.empty()
    ? g.append('g').attr('class', 'lc-y-axis')
    : yAxisEl

  if (animate) {
    yAxis.transition().duration(duration).call(yAxisGen)
  } else {
    yAxis.call(yAxisGen)
  }
}
