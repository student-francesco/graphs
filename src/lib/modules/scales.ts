import * as d3 from 'd3'
import { prepareStep, type ChartModule } from '@/lib/engine/index.ts'
import {
  AxisLayouts,
  DataKind,
  Layout,
  Scales,
  Settings,
  ViewTransform,
  XDomainValues,
  YDomainValues,
  type AxisLayoutEntry,
  type ScaleBundle,
  type XScale,
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
        description: 'Build the x and per-axis y scales from the domains, layout and zoom/brush view transform.',
        reads: {
          layout: Layout,
          axisLayouts: AxisLayouts,
          settings: Settings,
          xValues: XDomainValues,
          yValues: YDomainValues,
          view: ViewTransform,
          dataKind: DataKind,
        },
        provides: Scales,
        equals: (a, b) => a.desc === b.desc,
        run: ({ layout, axisLayouts, settings, xValues, yValues, view, dataKind }): ScaleBundle => {
          const { innerWidth, innerHeight } = layout

          // x is a time scale for temporal data, a linear scale for numeric data.
          // Pre-data fallback — renderers gate on HasData, but the scale must exist.
          const allX = xValues.flat()
          let xAuto: XScale
          if (dataKind === 'numeric') {
            const [n0, n1] = d3.extent(allX as number[])
            const xDomain: [number, number] =
              n0 !== undefined && n1 !== undefined ? [n0, n1] : [0, 1]
            xAuto = d3.scaleLinear().domain(xDomain).range([0, innerWidth])
          } else {
            const [d0, d1] = d3.extent(allX as Date[])
            const xDomain: [Date, Date] =
              d0 !== undefined && d1 !== undefined ? [d0, d1] : [new Date(0), new Date(86_400_000)]
            xAuto = d3.scaleTime().domain(xDomain).range([0, innerWidth])
          }

          // Layer 1: brush-set domain overrides replace the auto-computed extent.
          // Date is a NumberValue, so the override domain feeds either scale kind.
          const xBase: XScale =
            view.xDomainOverride !== null
              ? (xAuto.copy().domain(view.xDomainOverride) as XScale)
              : xAuto

          // Layer 2: the d3.zoom transform stacks on top via rescale. Once any
          // override exists, pan/zoom unlocks on BOTH axes regardless of zoomMode
          // so the user can drag the focused view around freely.
          const hasOverride = view.xDomainOverride !== null || view.yDomainOverrides.size > 0
          const zoomsX = hasOverride || settings.zoomMode === 'x' || settings.zoomMode === 'xy'
          const zoomsY = hasOverride || settings.zoomMode === 'y' || settings.zoomMode === 'xy'
          const transform = d3.zoomIdentity.translate(view.x, view.y).scale(view.k)
          const transformed = transform.k !== 1 || transform.x !== 0 || transform.y !== 0
          const x = zoomsX && transformed ? transform.rescaleX(xBase) : xBase

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
          const xd = x.domain()
          const descParts: string[] = [
            `x:${+xd[0]!}..${+xd[1]!}/${innerWidth}`,
          ]

          for (const axis of axisLayouts) {
            const auto = buildAxisYScale(axis, valuesByAxis.get(axis.id) ?? [], innerHeight)
            const override = view.yDomainOverrides.get(axis.id)
            const base =
              override !== undefined
                ? (auto.copy().domain(override as [number, number]) as YScale)
                : auto
            // rescaleY returns type-preserving copies (log stays log).
            const scale = zoomsY && transformed ? (transform.rescaleY(base) as YScale) : base
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
