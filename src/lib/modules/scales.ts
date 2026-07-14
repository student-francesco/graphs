import * as d3 from 'd3'
import { prepareStep, type ChartModule } from '@/lib/engine/index.ts'
import {
  AxisLayouts,
  DataKind,
  Layout,
  Scales,
  Settings,
  ViewTransform,
  VisibleSeries,
  XDomainValues,
  YDomainValues,
  type AxisLayoutEntry,
  type ScaleBundle,
  type VisibleSeriesEntry,
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
          visible: VisibleSeries,
        },
        provides: Scales,
        equals: (a, b) => a.desc === b.desc,
        run: ({ layout, axisLayouts, settings, xValues, yValues, view, dataKind, visible }): ScaleBundle => {
          const { innerWidth, innerHeight } = layout

          // x is a time scale for temporal data, a linear scale for numeric data.
          // Pre-data fallback — renderers gate on HasData, but the scale must exist.
          const allX = xValues.flat()

          // Settled right edge. With a `maxDataPoints` cap, hold the domain's UPPER
          // bound to the newest x that EVERY series has reached (min of per-series
          // last x), not the single series that appended first. Otherwise a leading
          // append widens the domain while the others still lag, then it narrows
          // when they catch up — the domain "breathes" every tick and the x-axis
          // RESOLUTION (pixels per unit) jitters. Capping the RIGHT edge (and leaving
          // the LEFT edge at the natural minimum) keeps the window a constant width
          // that only translates, and crucially does NOT displace the trailing exit
          // points, which stay anchored to the natural left edge. Only a small lead
          // (≤2 newer distinct x) is held back, so a genuinely longer series keeps
          // its full extent; filling / aligned states are untouched.
          const hiCap = settledUpperBound(allX, visible, settings.maxDataPoints)

          let xAuto: XScale
          if (dataKind === 'numeric') {
            const [n0, n1] = d3.extent(allX as number[])
            const hi = hiCap ?? n1
            const xDomain: [number, number] =
              n0 !== undefined && hi !== undefined ? [n0, hi] : [0, 1]
            if (settings.xScaleType === 'log') {
              const clampedLo = Math.max(xDomain[0], 1e-10)
              const clampedHi = Math.max(xDomain[1], 1e-9)
              if (clampedLo !== xDomain[0] || clampedHi !== xDomain[1]) {
                console.warn('LineChart: x log scale domain clamped to positive values', {
                  lo: xDomain[0],
                  hi: xDomain[1],
                  clampedLo,
                  clampedHi,
                })
              }
              // clamp(true): a data point at/below the domain floor (e.g. x=0) would
              // otherwise take Math.log of a non-positive number → NaN → an invalid
              // path `d` that makes the WHOLE line disappear, not just that point.
              // Clamping happens in domain space before the log transform, so such
              // points land at the left edge instead of poisoning the path.
              xAuto = d3
                .scaleLog()
                .base(10)
                .domain([clampedLo, clampedHi])
                .range([0, innerWidth])
                .clamp(true)
            } else {
              xAuto = d3.scaleLinear().domain(xDomain).range([0, innerWidth])
            }
          } else {
            const [d0, d1] = d3.extent(allX as Date[])
            const hi = hiCap !== undefined ? new Date(hiCap) : d1
            const xDomain: [Date, Date] =
              d0 !== undefined && hi !== undefined ? [d0, hi] : [new Date(0), new Date(86_400_000)]
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
          const xKind = dataKind === 'numeric' ? settings.xScaleType : 'time'
          const descParts: string[] = [
            `x:${xKind}:${+xd[0]!}..${+xd[1]!}/${innerWidth}`,
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

          const xTickCount = settings.xTickCount ?? Math.max(2, Math.floor(innerWidth / 120))
          const xTicks = x.ticks(xTickCount)
          descParts.push(`xt:${xTickCount}`)

          return { x, y, xTicks, yTicks, desc: descParts.join('|') }
        },
      }),
    ],
  }
}

/**
 * The x upper bound to display when a `maxDataPoints` rolling cap is active: the
 * newest x that EVERY series has reached, so a single series appending ahead of the
 * others doesn't widen (then narrow) the domain each tick — which would jitter the
 * x-axis resolution. Returns undefined when there's no cap, only one series, the
 * series are aligned, or a series leads by MORE than 2 distinct x (a genuinely
 * longer series must not be clipped). Leaves the lower bound alone, so the trailing
 * exit points stay anchored to the natural left edge.
 */
function settledUpperBound(
  allX: readonly (number | Date)[],
  visible: ReadonlyMap<string, VisibleSeriesEntry>,
  maxN: number | null,
): number | undefined {
  if (maxN === null || maxN <= 0 || allX.length === 0) return undefined
  let settledMax = Infinity
  let rawMax = -Infinity
  let seriesCount = 0
  for (const s of visible.values()) {
    if (s.raw.length === 0) continue
    const last = +s.raw[s.raw.length - 1]!.x
    if (last < settledMax) settledMax = last
    if (last > rawMax) rawMax = last
    seriesCount++
  }
  if (seriesCount <= 1 || settledMax >= rawMax) return undefined
  const distinct = Array.from(new Set(allX.map(v => +v))).sort((a, b) => a - b)
  const idx = distinct.indexOf(settledMax)
  if (idx < 0 || distinct.length - 1 - idx > 2) return undefined
  return settledMax
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

  // clamp(true) on every scaleLog below: a value at/below the domain floor
  // would otherwise take Math.log of a non-positive number → NaN → an invalid
  // path `d` that makes the WHOLE line disappear, not just that point. Clamping
  // happens in domain space before the log transform, so such points land at
  // the range edge instead of poisoning the path.
  if (range) {
    if (isLog) {
      const lo = Math.max(range[0], 1e-10)
      const hi = Math.max(range[1], 1e-9)
      return d3.scaleLog().base(10).domain([lo, hi]).range([innerHeight, 0]).clamp(true)
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
        .clamp(true)
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
    return d3.scaleLog().base(10).domain([clampedMin, clampedMax]).range([innerHeight, 0]).clamp(true)
  }

  const yPad = (yMax - yMin) * 0.1 || 1
  return d3
    .scaleLinear()
    .domain([yMin - yPad, yMax + yPad])
    .nice()
    .range([innerHeight, 0])
}
