import * as d3 from 'd3'
import { prepareStep, type ChartModule } from '../engine/index.ts'
import {
  AxisLayouts,
  Layout,
  Scales,
  Settings,
  XDomainValues,
  YDomainValues,
  type AxisLayoutEntry,
  type ScaleBundle,
  type YScale,
} from './tokens.ts'

/**
 * Builds the time x-scale and per-axis y-scales from contributed domain values
 * (series data, annotation levels) and resolves the tick arrays every consumer
 * (grid, axis chrome, Blazor label resolution) shares. Domain overrides and
 * rescale transforms (brush/zoom) plug in when the zoom module lands.
 *
 * The output's identity is its plain-value descriptor — scale instances are
 * closures, so a custom equals keeps downstream steps cached when domains,
 * ranges, and tick counts are value-identical (e.g. pure restyle passes).
 */
export function scalesModule(): ChartModule {
  return {
    id: 'scales',
    defaults: { yScaleType: 'linear', xTickCount: null, yTickCount: null },

    prepare: [
      prepareStep({
        id: 'scales.build',
        reads: {
          layout: Layout,
          axisLayouts: AxisLayouts,
          settings: Settings,
          xValues: XDomainValues,
          yValues: YDomainValues,
        },
        provides: Scales,
        equals: (a, b) => a.desc === b.desc,
        run: ({ layout, axisLayouts, settings, xValues, yValues }): ScaleBundle => {
          const { innerWidth, innerHeight } = layout

          const allDates = xValues.flat()
          const [d0, d1] = d3.extent(allDates)
          // Pre-data fallback — renderers gate on HasData, but the scale must exist.
          const xDomain: [Date, Date] =
            d0 !== undefined && d1 !== undefined ? [d0, d1] : [new Date(0), new Date(86_400_000)]
          const x = d3.scaleTime().domain(xDomain).range([0, innerWidth])

          const valuesByAxis = new Map<string, number[]>()
          for (const contribution of yValues) {
            for (const { axisId, values } of contribution) {
              const list = valuesByAxis.get(axisId) ?? []
              list.push(...values)
              valuesByAxis.set(axisId, list)
            }
          }

          const y = new Map<string, YScale>()
          const yTicks = new Map<string, readonly number[]>()
          const descParts: string[] = [
            `x:${xDomain[0].getTime()}..${xDomain[1].getTime()}/${innerWidth}`,
          ]

          for (const axis of axisLayouts) {
            const scale = buildAxisYScale(axis, valuesByAxis.get(axis.id) ?? [], innerHeight)
            const count = axis.yTickCount ?? Math.max(2, Math.floor(innerHeight / 40))
            y.set(axis.id, scale)
            yTicks.set(axis.id, scale.ticks(count))
            const [lo, hi] = scale.domain()
            descParts.push(`${axis.id}:${axis.scaleType}:${lo}..${hi}/${innerHeight}@${count}`)
          }

          const xTickCount = settings.xTickCount ?? Math.max(2, Math.floor(innerWidth / 80))
          const xTicks = x.ticks(xTickCount)
          descParts.push(`xt:${xTickCount}`)

          return { x, y, xTicks, yTicks, desc: descParts.join('|') }
        },
      }),
    ],
  }
}

/**
 * Domain selection (ported verbatim from the monolith):
 *   1. range present → used verbatim (no padding, no .nice()).
 *   2. limits present → auto extent clamped to limits, then padded + nice.
 *   3. neither → auto extent, padded + nice.
 * Axes with no associated data fall back to [0, 1] (linear) / [0.1, 10] (log).
 */
function buildAxisYScale(
  axis: AxisLayoutEntry,
  values: readonly number[],
  innerHeight: number,
): YScale {
  const isLog = axis.scaleType === 'log'
  const range = axis.range
  const limits = axis.limits

  if (range) {
    if (isLog) {
      const lo = Math.max(range[0], 1e-10)
      const hi = Math.max(range[1], 1e-9)
      return d3.scaleLog().base(10).domain([lo, hi]).range([innerHeight, 0])
    }
    return d3.scaleLinear().domain([range[0], range[1]]).range([innerHeight, 0])
  }

  if (values.length === 0) {
    const [lo, hi] = limits ?? (isLog ? [0.1, 10] : [0, 1])
    if (isLog) {
      return d3
        .scaleLog()
        .base(10)
        .domain([Math.max(lo, 1e-10), Math.max(hi, 1e-9)])
        .range([innerHeight, 0])
    }
    return d3.scaleLinear().domain([lo, hi]).nice().range([innerHeight, 0])
  }

  let yMin = d3.min(values) ?? 0
  let yMax = d3.max(values) ?? 0
  if (limits) {
    yMin = Math.max(yMin, limits[0])
    yMax = Math.min(yMax, limits[1])
    if (yMax < yMin) [yMin, yMax] = [limits[0], limits[1]]
  }

  if (isLog) {
    const clampedMin = Math.max(yMin, 1e-10)
    const clampedMax = Math.max(yMax, 1e-9)
    if (clampedMin !== yMin || clampedMax !== yMax) {
      console.warn('LineChart: log scale domain clamped to positive values', {
        yMin,
        yMax,
        clampedMin,
        clampedMax,
      })
    }
    return d3.scaleLog().base(10).domain([clampedMin, clampedMax]).range([innerHeight, 0])
  }

  const yPad = (yMax - yMin) * 0.1 || 1
  return d3
    .scaleLinear()
    .domain([yMin - yPad, yMax + yPad])
    .nice()
    .range([innerHeight, 0])
}
