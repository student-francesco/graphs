import * as d3 from 'd3'
import type { AnimationMode, ChartSettings } from './types.ts'

export type YScale = d3.ScaleLinear<number, number> | d3.ScaleLogarithmic<number, number>

/** Resolved per-axis render data, computed once per render() in LineChart. All fields are fully resolved (cascade applied). */
export interface AxisLayout {
  id: string
  name: string
  color: string | null
  position: 'left' | 'right'
  /** x offset relative to innerG origin (0 = chart's left edge, innerWidth = right edge) */
  offsetX: number
  scaleType: 'linear' | 'log'
  showGrid: boolean
  gridColor: string
  gridOpacity: number
  /** Resolved tick count hint. null = auto-compute from innerHeight (≈ innerHeight / 40). */
  yTickCount: number | null
}

export interface AxesConfig {
  /** Container for fixed y-axes (stays in innerG, outside chart area) */
  g: d3.Selection<SVGGElement, unknown, null, undefined>
  /** Container for the static x-axis baseline line (lc-chart-area — clipped but never scrolls) */
  chartAreaG: d3.Selection<SVGGElement, unknown, null, undefined>
  /** Container for grids and x-axis ticks (lc-scroll-container — scrolls with data) */
  scrollG: d3.Selection<SVGGElement, unknown, null, undefined>
  xScale: d3.ScaleTime<number, number>
  /** One y-scale per axis id; layout[0]'s scale is used for the horizontal grid. */
  yScales: Map<string, YScale>
  layout: AxisLayout[]
  innerWidth: number
  innerHeight: number
  settings: ChartSettings
  mode: AnimationMode
  duration: number
  ease: (t: number) => number
}

/**
 * Renders all chart axes (x-axis, y-axes), grid lines, and axis labels.
 *
 * This function orchestrates the complete axis rendering pipeline:
 * - Horizontal and vertical grid lines (driven by the primary y-axis scale)
 * - X-axis baseline and tick marks with labels
 * - Y-axis rails, ticks, and optional axis names
 *
 * **Asynchronous behaviour**: This function is declared `async` to support .NET interop scenarios.
 * When `settings.xAxisFormatter` or `settings.yAxisFormatter` is a C# delegate provided from
 * the .NET side (e.g. via Blazor Server JS interop), invoking it requires an asynchronous call
 * (`invokeMethodAsync`). Although the current implementation uses synchronous fallback patterns,
 * the function signature remains `async` to accommodate future true async formatter invocations
 * without breaking API compatibility.
 *
 * @param config - Complete axis rendering configuration including scales, layout, containers, and animation settings
 * @returns A promise that resolves when all axis rendering is complete
 */
export async function renderAxes(config: AxesConfig): Promise<void> {
  const {
    g, chartAreaG, scrollG,
    xScale, yScales, layout,
    innerWidth, innerHeight,
    settings, mode, duration, ease,
  } = config
  const animate = mode !== 'none'
  // In transition mode the container scroll drives all horizontal motion — elements
  // must snap to their final positions, so they move as one unit with the container.
  const animateScrollContent = animate && mode !== 'transition'

  // Primary y-scale drives the horizontal grid (avoids ambiguous grid lines under disparate scales).
  const primaryYScale = yScales.get(layout[0]!.id)!

  // Resolve tick counts: null → auto-compute from available space.
  const resolvedYTickCount = layout[0]!.yTickCount ?? Math.max(2, Math.floor(innerHeight / 40))
  const resolvedXTickCount = settings.xTickCount ?? Math.max(2, Math.floor(innerWidth / 80))

  // ---- Grid ----
  // Grid lives here because its lines must fall exactly on axis tick positions — using the same scale instances guarantees that.
  // The grid is rendered through repurposed D3 axis elements without scale texts.
  const primaryAxis = layout[0]!
  if (primaryAxis.showGrid) {
    const yGrid = scrollG.select<SVGGElement>('.lc-grid-y')
    const yGridEl = yGrid.empty()
      ? scrollG.insert('g', ':first-child').attr('class', 'lc-grid-y')
      : yGrid

    const yGridAxis = d3.axisLeft(primaryYScale).ticks(resolvedYTickCount).tickSize(-innerWidth).tickFormat(() => '')
    const applyYGrid = (sel: d3.Selection<SVGGElement, unknown, null, undefined>) => {
      sel.call(yGridAxis)
      sel.select('.domain').remove()
      sel.selectAll('.tick line')
        .attr('stroke', primaryAxis.gridColor)
        .attr('stroke-opacity', primaryAxis.gridOpacity)
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

    const xGridAxis = d3.axisBottom(xScale).ticks(resolvedXTickCount).tickSize(-innerHeight).tickFormat(() => '')
    const applyXGrid = (sel: d3.Selection<SVGGElement, unknown, null, undefined>) => {
      sel.attr('transform', `translate(0,${innerHeight})`)
      sel.call(xGridAxis)
      sel.select('.domain').remove()
      sel.selectAll('.tick line')
        .attr('stroke', primaryAxis.gridColor)
        .attr('stroke-opacity', primaryAxis.gridOpacity)
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
  let tryXAxisFromBlazor = false;
  const ticks = xScale.ticks(resolvedXTickCount)
  const defaultFormatter = xScale.tickFormat()
  type DotNetDelegate = { invokeMethodAsync(method: string, ...args: unknown[]): string }
  type xTickFormatter = (d: Date, i: number) => string;

  // Find best-suited formatter and send request if blazor formatter found
  let formatTick: xTickFormatter;
  if (!settings.xAxisFormatter) formatTick = defaultFormatter;
  else if (typeof settings.xAxisFormatter === 'function') {
    formatTick = settings.xAxisFormatter;
  } else {
    // In this case, it might be a JS Delegate wrapper object from the .NET solution side. Blazor Server only supports asynchronous C# invocation.
    // Nevertheless, ensure to have a fallback to handle interop failures
    tryXAxisFromBlazor = true;
    formatTick = defaultFormatter;
  }
  // Await request promises; below, the renderer chooses between
  // xLabels or the formatTick function based on availability
  let xLabels: string[] | null;
  try {
    xLabels = tryXAxisFromBlazor ? await Promise.all(
        ticks.map((d, i) =>
            (settings.xAxisFormatter as unknown as DotNetDelegate)
                .invokeMethodAsync('executeDelegate', d.toISOString(), i)
        )) : null;
  } catch (e) {
    console.warn("Failed to invoke formatter from Blazor", e)
    xLabels = null;
  }

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
    .text(
        !xLabels
            ? (d, i) => formatTick(d, i)
            : (_, i) => xLabels[i]
    )

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

  // ---- Y Axes (one rail per axis in layout) ----
  const showNames = layout.length >= 2

  // Resolve y-axis tick labels up-front, mirroring the x-axis above: a plain JS function is
  // called inline during render (sync), but a C# delegate wrapper from .NET (Blazor Server)
  // only supports asynchronous invocation, so its labels must be awaited here — the per-axis
  // .each() render below is synchronous and cannot await.
  const tryYAxisFromBlazor =
    settings.yAxisFormatter !== null && typeof settings.yAxisFormatter !== 'function'

  // One label array per axis id, aligned with that axis's tick positions. Stays null when no
  // Blazor delegate is in play or the interop call failed (fall back to the default formatter).
  let yLabelsByAxis: Map<string, string[]> | null = null
  if (tryYAxisFromBlazor) {
    const yDelegate = settings.yAxisFormatter as unknown as DotNetDelegate
    try {
      const entries = await Promise.all(
        layout.map(async (axis): Promise<[string, string[]]> => {
          const yScale = yScales.get(axis.id)
          const yTicks = yScale ? yScale.ticks() : []
          const labels = await Promise.all(
            yTicks.map((d, i) => yDelegate.invokeMethodAsync('executeDelegate', d, i))
          )
          return [axis.id, labels]
        })
      )
      yLabelsByAxis = new Map(entries)
    } catch (e) {
      console.warn('Failed to invoke formatter from Blazor', e)
      yLabelsByAxis = null
    }
  }

  // Data-join over axis groups so removed axes' chrome is cleaned up automatically.
  const axisGroups = g
    .selectAll<SVGGElement, AxisLayout>('.lc-y-axis')
    .data(layout, a => a.id)

  axisGroups.exit().remove()

  const axisEnter = axisGroups.enter()
    .append('g')
    .attr('class', 'lc-y-axis')
    .attr('data-axis-id', a => a.id)

  const axisMerged = axisEnter.merge(axisGroups)
    .attr('transform', a => `translate(${a.offsetX},0)`)

  axisMerged.each(function (axis) {
    const sel = d3.select<SVGGElement, AxisLayout>(this)
    const yScale = yScales.get(axis.id)
    if (!yScale) return

    const axisYTickCount = axis.yTickCount ?? Math.max(2, Math.floor(innerHeight / 40))
    const gen = axis.position === 'right' ? d3.axisRight(yScale) : d3.axisLeft(yScale)
    const yAxisFormatter = settings.yAxisFormatter
    if (yAxisFormatter !== null) {
      if (typeof yAxisFormatter === 'function') {
        gen.ticks(axisYTickCount).tickFormat((d, i) => yAxisFormatter(d as number, i))
      } else {
        // C# delegate: use the labels resolved above, indexed by tick position. If the interop
        // call fails (no labels for this axis), fall back to the scale's default formatter.
        const yLabels = yLabelsByAxis?.get(axis.id)
        if (yLabels) gen.ticks(axisYTickCount).tickFormat((_, i) => yLabels[i])
        else gen.ticks(axisYTickCount)
      }
    } else if (axis.scaleType === 'log') {
      gen.ticks(axisYTickCount, d3.format('.2~s'))
    } else {
      gen.ticks(axisYTickCount)
    }

    if (animate && duration > 0) {
      sel.transition().duration(duration).call(gen)
    } else {
      sel.call(gen)
    }

    // Axis colour paints only the lettering (tick labels + name) and the associated
    // series — the rail and tick marks stay neutral so a series painted in the axis
    // colour can never visually merge with another axis's rail.
    const color = axis.color ?? 'currentColor'
    sel.select('.domain').attr('stroke', 'currentColor')
    sel.selectAll('.tick line').attr('stroke', 'currentColor')
    // Force text-anchor in case this group previously rendered as the opposite axis side
    // (e.g. axis promoted from right to left when a third axis is added).
    sel.selectAll('.tick text')
      .attr('fill', color)
      .attr('text-anchor', axis.position === 'right' ? 'start' : 'end')

    // Axis name below the chart baseline — only shown when ≥ 2 axes exist.
    const nameEl = sel.select<SVGTextElement>('.lc-y-axis-name')
    if (showNames) {
      const el = nameEl.empty()
        ? sel.append<SVGTextElement>('text').attr('class', 'lc-y-axis-name')
        : nameEl
      el
        .attr('y', innerHeight + 9)
        .attr('dy', '0.71em')
        .attr('x', 0)
        .attr('text-anchor', axis.position === 'right' ? 'start' : 'end')
        .attr('font-size', '11px')
        .attr('font-family', 'sans-serif')
        .attr('font-weight', '600')
        .attr('fill', color)
        .text(axis.name)
    } else {
      nameEl.remove()
    }
  })
}
