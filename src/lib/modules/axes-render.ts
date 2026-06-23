import * as d3 from 'd3'
import { prepareStep, renderStep, token, type ChartModule, type Token } from '../engine/index.ts'
import type { ChartSettings } from '../types.ts'
import {
  AnimationCtx,
  AxisLayouts,
  HasData,
  Layout,
  Scales,
  Settings,
  type AxisLayoutEntry,
} from './tokens.ts'

interface XTickModel {
  /** Stable join key (epoch ms). */
  readonly ms: number
  readonly x: number
  readonly label: string
}

interface YAxisModel {
  readonly id: string
  readonly name: string
  readonly color: string | null
  readonly position: 'left' | 'right'
  readonly offsetX: number
  /** Tick values aligned 1:1 with their resolved labels. */
  readonly tickValues: readonly number[]
  readonly tickLabels: readonly string[]
}

interface AxisRenderModel {
  readonly show: boolean
  readonly xTicks: readonly XTickModel[]
  readonly yAxes: readonly YAxisModel[]
  readonly showNames: boolean
}

const AxisModel: Token<AxisRenderModel> = token('axes.model')

interface DotNetDelegate {
  invokeMethodAsync(method: string, ...args: unknown[]): Promise<string>
}

/**
 * Blazor hands the chart a JS delegate wrapper object instead of a plain
 * function. The public settings type only declares the function form, so the
 * wrapper arrives through a cast — mirror that on the read side.
 */
const needsDelegate = (formatter: unknown): DotNetDelegate | null =>
  formatter !== null && formatter !== undefined && typeof formatter !== 'function'
    ? (formatter as unknown as DotNetDelegate)
    : null

/**
 * Axis chrome: baseline, x ticks, y rails + names. The async prepare step
 * resolves every tick label — including awaited .NET delegate formatters — into
 * a plain model, so the render steps are synchronous string-stamping.
 *
 * This fixes three monolith bugs: Blazor x labels were overwritten by the
 * default formatter right after being applied; the un-awaited render raced the
 * transition reshift; and y labels were resolved for a different tick array
 * than the one rendered. Here labels are resolved for exactly the shared tick
 * arrays the chrome renders, and the pass waits for them.
 */
export function axesRenderModule(): ChartModule {
  return {
    id: 'axes-render',
    defaults: { xAxisFormatter: null, yAxisFormatter: null },

    prepare: [
      prepareStep({
        id: 'axes.model',
        description: 'Build the tick positions and formatted labels for every axis, resolving formatter delegates.',
        reads: {
          scales: Scales,
          axisLayouts: AxisLayouts,
          settings: Settings,
          hasData: HasData,
        },
        provides: AxisModel,
        equals: (a, b) => JSON.stringify(a) === JSON.stringify(b),
        // CONTRACT: must return a plain value on the sync path — only a real
        // .NET delegate formatter may tip the pass async. An `async` function
        // here would wrap even the sync case in a Promise and break the
        // synchronous mutate→render guarantee for every chart.
        run: ({ scales, axisLayouts, settings, hasData }): AxisRenderModel | Promise<AxisRenderModel> => {
          if (!hasData) return { show: false, xTicks: [], yAxes: [], showNames: false }

          const assemble = (xLabels: string[], yLabels: ReadonlyMap<string, string[]>): AxisRenderModel => {
            const xTicks: XTickModel[] = scales.xTicks.map((date, i) => ({
              ms: date.getTime(),
              x: scales.x(date),
              label: xLabels[i]!,
            }))
            const yAxes: YAxisModel[] = []
            for (const axis of axisLayouts) {
              if (!scales.y.has(axis.id)) continue
              yAxes.push({
                id: axis.id,
                name: axis.name,
                color: axis.color,
                position: axis.position,
                offsetX: axis.offsetX,
                tickValues: scales.yTicks.get(axis.id) ?? [],
                tickLabels: yLabels.get(axis.id) ?? [],
              })
            }
            return { show: true, xTicks, yAxes, showNames: axisLayouts.length >= 2 }
          }

          const xDelegate = needsDelegate(settings.xAxisFormatter)
          const yDelegate = needsDelegate(settings.yAxisFormatter)

          if (!xDelegate && !yDelegate) {
            const yLabels = new Map<string, string[]>()
            for (const axis of axisLayouts) {
              const yScale = scales.y.get(axis.id)
              if (!yScale) continue
              yLabels.set(
                axis.id,
                resolveYLabelsSync(scales.yTicks.get(axis.id) ?? [], yScale, axis, settings),
              )
            }
            return assemble(resolveXLabelsSync(scales.xTicks, scales.x, settings), yLabels)
          }

          return (async () => {
            const xLabels = xDelegate
              ? await resolveXLabelsAsync(scales.xTicks, scales.x, settings, xDelegate)
              : resolveXLabelsSync(scales.xTicks, scales.x, settings)
            const yLabels = new Map<string, string[]>()
            for (const axis of axisLayouts) {
              const yScale = scales.y.get(axis.id)
              if (!yScale) continue
              const tickValues = scales.yTicks.get(axis.id) ?? []
              yLabels.set(
                axis.id,
                yDelegate
                  ? await resolveYLabelsAsync(tickValues, yScale, axis, settings, yDelegate)
                  : resolveYLabelsSync(tickValues, yScale, axis, settings),
              )
            }
            return assemble(xLabels, yLabels)
          })()
        },
      }),
    ],

    render: [
      renderStep({
        id: 'axes.baseline',
        reads: { model: AxisModel, layout: Layout },
        layer: { name: 'baseline', z: 10, host: 'chart-area' },
        run: ({ model, layout }, ctx) => {
          const g = ctx.layer!
          const baseline = g.selectAll<SVGLineElement, number>('.lc-x-axis-line')
            .data(model.show ? [layout.innerHeight] : [])
          baseline.exit().remove()
          baseline
            .enter()
            .append('line')
            .attr('class', 'lc-x-axis-line')
            .attr('stroke', 'currentColor')
            .merge(baseline)
            .attr('x1', 0)
            .attr('y1', d => d)
            .attr('x2', layout.innerWidth)
            .attr('y2', d => d)
        },
      }),

      renderStep({
        id: 'axes.xTicks',
        reads: { model: AxisModel, layout: Layout, anim: AnimationCtx },
        layer: { name: 'x-ticks', z: 15, host: 'scroll' },
        run: ({ model, layout, anim }, ctx) => {
          const g = ctx.layer!
          const innerHeight = layout.innerHeight

          const ticks = g
            .selectAll<SVGGElement, XTickModel>('.lc-x-tick')
            .data(model.show ? model.xTicks : [], d => d.ms)

          const enter = ticks
            .enter()
            .append('g')
            .attr('class', 'lc-x-tick')
            .attr('transform', d => `translate(${d.x}, ${innerHeight})`)
          enter.append('line').attr('stroke', 'currentColor').attr('y2', 6)
          enter
            .append('text')
            .attr('fill', 'currentColor')
            .attr('font-size', '10px')
            .attr('font-family', 'sans-serif')
            .attr('dy', '0.71em')
            .attr('y', 9)
            .attr('text-anchor', 'middle')

          const merged = enter.merge(ticks)
          // Labels come from the resolved model for ALL ticks — the monolith
          // overwrote freshly-applied Blazor labels with the default formatter.
          merged.select('text').text(d => d.label)
          anim.position(merged, 'scrolled', s =>
            s.attr('transform', (d: XTickModel) => `translate(${d.x}, ${innerHeight})`),
          )
          anim.fadeIn(enter)
          anim.fadeOutExit(ticks.exit(), 'lc-x-tick-exiting', {
            kind: 'translate-x',
            fixedY: innerHeight,
          })
        },
      }),

      renderStep({
        id: 'axes.yRails',
        reads: { model: AxisModel, scales: Scales, layout: Layout, anim: AnimationCtx },
        layer: { name: 'y-axes', z: 85, host: 'overlay' },
        run: ({ model, scales, layout, anim }, ctx) => {
          const g = ctx.layer!
          const axisGroups = g
            .selectAll<SVGGElement, YAxisModel>('.lc-y-axis')
            .data(model.show ? model.yAxes : [], a => a.id)

          axisGroups.exit().remove()

          const axisMerged = axisGroups
            .enter()
            .append('g')
            .attr('class', 'lc-y-axis')
            .attr('data-axis-id', a => a.id)
            .merge(axisGroups)
            .attr('transform', a => `translate(${a.offsetX},0)`)

          axisMerged.each(function (axis) {
            const sel = d3.select<SVGGElement, YAxisModel>(this)
            const yScale = scales.y.get(axis.id)
            if (!yScale) return

            const gen = (axis.position === 'right' ? d3.axisRight(yScale) : d3.axisLeft(yScale))
              .tickValues(axis.tickValues as number[])
              .tickFormat((_, i) => axis.tickLabels[i] ?? '')

            if (anim.shouldTween('free')) {
              sel
                .transition()
                .duration(anim.duration)
                .ease(anim.ease)
                .call(gen as never)
            } else {
              sel.call(gen as never)
            }

            // Axis colour paints only the lettering — rail and tick marks stay
            // neutral so a series painted in the axis colour can never merge
            // with another axis's rail.
            const color = axis.color ?? 'currentColor'
            sel.select('.domain').attr('stroke', 'currentColor')
            sel.selectAll('.tick line').attr('stroke', 'currentColor')
            sel
              .selectAll('.tick text')
              .attr('fill', color)
              .attr('text-anchor', axis.position === 'right' ? 'start' : 'end')

            const nameSel = sel.selectAll<SVGTextElement, YAxisModel>('.lc-y-axis-name')
              .data(model.showNames ? [axis] : [])
            nameSel.exit().remove()
            nameSel
              .enter()
              .append('text')
              .attr('class', 'lc-y-axis-name')
              .attr('font-size', '10px')
              .attr('font-family', 'sans-serif')
              .attr('text-anchor', 'middle')
              .merge(nameSel)
              .attr('y', layout.innerHeight + 9)
              .attr('dy', '0.71em')
              .attr('x', 0)
              .attr('fill', color)
              .text(a => a.name)
          })
        },
      }),
    ],
  }
}

function resolveXLabelsSync(
  ticks: readonly Date[],
  xScale: d3.ScaleTime<number, number>,
  settings: ChartSettings,
): string[] {
  const formatter = settings.xAxisFormatter
  if (typeof formatter === 'function') return ticks.map((d, i) => formatter(d, i))
  const fmt = xScale.tickFormat()
  return ticks.map(d => fmt(d))
}

async function resolveXLabelsAsync(
  ticks: readonly Date[],
  xScale: d3.ScaleTime<number, number>,
  settings: ChartSettings,
  delegate: DotNetDelegate,
): Promise<string[]> {
  try {
    return await Promise.all(
      ticks.map((d, i) => delegate.invokeMethodAsync('executeDelegate', d.toISOString(), i)),
    )
  } catch (e) {
    console.warn('Failed to invoke formatter from Blazor', e)
    return resolveXLabelsSync(ticks, xScale, { ...settings, xAxisFormatter: null })
  }
}

interface YScaleLike {
  tickFormat(count?: number, specifier?: string): (d: d3.NumberValue) => string
}

function resolveYLabelsSync(
  tickValues: readonly number[],
  yScale: YScaleLike,
  axis: AxisLayoutEntry,
  settings: ChartSettings,
): string[] {
  const formatter = settings.yAxisFormatter
  if (typeof formatter === 'function') return tickValues.map((v, i) => formatter(v, i))
  const fmt =
    axis.scaleType === 'log'
      ? yScale.tickFormat(tickValues.length, '.2~s')
      : yScale.tickFormat(tickValues.length)
  return tickValues.map(v => fmt(v))
}

async function resolveYLabelsAsync(
  tickValues: readonly number[],
  yScale: YScaleLike,
  axis: AxisLayoutEntry,
  settings: ChartSettings,
  delegate: DotNetDelegate,
): Promise<string[]> {
  try {
    // Resolved for exactly the tick values the rail renders — the monolith
    // resolved for the scale's default ticks and mis-indexed when counts differed.
    return await Promise.all(
      tickValues.map((v, i) => delegate.invokeMethodAsync('executeDelegate', v, i)),
    )
  } catch (e) {
    console.warn('Failed to invoke formatter from Blazor', e)
    return resolveYLabelsSync(tickValues, yScale, axis, { ...settings, yAxisFormatter: null })
  }
}
