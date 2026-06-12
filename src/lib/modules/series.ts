import {
  prepareStep,
  renderStep,
  shallowEquals,
  storeSpec,
  token,
  type ChartModule,
  type ModuleRuntime,
  type StoreHandle,
  type Token,
} from '../engine/index.ts'
import type { CurveType, DataPoint, RawDataPoint, SeriesSettings } from '../types.ts'
import {
  AxesDef,
  HasData,
  SmoothedSeries,
  Settings,
  VisibleSeries,
  XDomainValues,
  YDomainValues,
  type VisibleSeriesEntry,
} from './tokens.ts'

/** Per-series state: parsed data plus sparse display overrides (undefined = cascade). */
export interface SeriesSlice {
  readonly id: string
  points: DataPoint[]
  /** Bumped on every data mutation — the cache key for derived per-series data. */
  dataRev: number
  /** Dropped points kept joined for visual continuity (morph/transition/fade mask). */
  pendingExitPoints: DataPoint[]
  /** Bumped when the series must be reborn (insufficient overlap → drawOn fallback). */
  rebirth: number
  axisId: string
  color: string | undefined
  lineWeight: number | undefined
  dotRadius: number | undefined
  curveType: CurveType | undefined
  smoothing: number | undefined
  decimation: number | undefined
  showLabels: boolean | undefined
  labelFormat: string | null | undefined
  dotBorderColor: string | null | undefined
}

export interface SeriesStoreState {
  readonly series: ReadonlyMap<string, SeriesSlice>
  readonly nextPaletteIndex: number
}

export const SeriesStore: Token<SeriesStoreState> = token('series.store')

export const DEFAULT_AXIS_ID = 'default'

const PALETTE = [
  '#e11d48', '#0891b2', '#16a34a', '#d97706', '#7c3aed', '#db2777', '#0284c7', '#4f46e5',
]

export function parseRaw(raw: RawDataPoint): DataPoint {
  const d = new Date(raw.date)
  if (isNaN(d.getTime())) throw new Error(`LineChart: invalid date "${raw.date}"`)
  return { date: d, value: raw.value }
}

function computeOverlap(a: DataPoint[], b: DataPoint[]): number {
  const setA = new Set(a.map(p => p.date.getTime()))
  let count = 0
  for (const p of b) {
    if (setA.has(p.date.getTime())) count++
  }
  return count
}

function emptySlice(id: string, axisId: string): SeriesSlice {
  return {
    id,
    points: [],
    dataRev: 0,
    pendingExitPoints: [],
    rebirth: 0,
    axisId,
    color: undefined,
    lineWeight: undefined,
    dotRadius: undefined,
    curveType: undefined,
    smoothing: undefined,
    decimation: undefined,
    showLabels: undefined,
    labelFormat: undefined,
    dotBorderColor: undefined,
  }
}

/**
 * Owns the series data store and the whole data-lifecycle API surface. Rendering
 * the series geometry (line/dots/labels) is the job of the geometry modules —
 * this module is pure data + cascade state, which is exactly what a future bar
 * or pie chart would reuse.
 */
export function seriesModule(): ChartModule {
  // Entry identity stays stable while a series is unchanged, so map-level shallow
  // diffs (and every downstream memo) stay quiet.
  const visibleMemo = new Map<string, VisibleSeriesEntry>()
  const prevRebirth = new Map<string, number>()

  return {
    id: 'series',

    stores: [
      storeSpec({
        token: SeriesStore,
        init: (): SeriesStoreState => ({
          series: new Map([['default', emptySlice('default', DEFAULT_AXIS_ID)]]),
          nextPaletteIndex: 0,
        }),
      }),
    ],

    prepare: [
      prepareStep({
        id: 'series.hasData',
        reads: { store: SeriesStore },
        provides: HasData,
        run: ({ store }) =>
          Array.from(store.series.values()).some(s => s.points.length > 0),
      }),
      prepareStep({
        id: 'series.visible',
        reads: { store: SeriesStore, settings: Settings, axes: AxesDef },
        provides: VisibleSeries,
        run: ({ store, settings, axes }): ReadonlyMap<string, VisibleSeriesEntry> => {
          const axisColor = new Map(axes.map(a => [a.id, a.color]))
          const out = new Map<string, VisibleSeriesEntry>()
          for (const slice of store.series.values()) {
            // Stroke/fill: axis colour wins when set, then the series colour,
            // then the chart-wide line colour.
            const entry: VisibleSeriesEntry = {
              id: slice.id,
              raw: slice.points,
              dataRev: slice.dataRev,
              rebirth: slice.rebirth,
              exit: slice.pendingExitPoints,
              resolved: {
                axisId: slice.axisId,
                color: axisColor.get(slice.axisId) ?? slice.color ?? settings.lineColor,
                lineWeight: slice.lineWeight ?? settings.lineWeight,
                dotRadius: slice.dotRadius ?? settings.dotRadius,
                curveType: slice.curveType ?? settings.curveType,
                smoothing: slice.smoothing ?? settings.smoothing,
                decimation: slice.decimation ?? settings.decimation,
                showLabels:
                  slice.showLabels !== undefined ? slice.showLabels : settings.showLabels,
                labelFormat:
                  (slice.labelFormat !== undefined ? slice.labelFormat : settings.labelFormat) ??
                  settings.tooltipValueFormat,
                dotBorderColor:
                  (slice.dotBorderColor !== undefined
                    ? slice.dotBorderColor
                    : settings.dotBorderColor) ??
                  (settings.theme === 'dark' ? '#1a1815' : '#fff'),
              },
            }
            const cached = visibleMemo.get(slice.id)
            if (
              cached &&
              cached.raw === entry.raw &&
              cached.dataRev === entry.dataRev &&
              cached.rebirth === entry.rebirth &&
              cached.exit === entry.exit &&
              shallowEquals(cached.resolved, entry.resolved)
            ) {
              out.set(slice.id, cached)
            } else {
              visibleMemo.set(slice.id, entry)
              out.set(slice.id, entry)
            }
          }
          for (const id of visibleMemo.keys()) {
            if (!out.has(id)) visibleMemo.delete(id)
          }
          return out
        },
      }),
      prepareStep({
        id: 'series.domains',
        reads: { visible: VisibleSeries, smoothed: SmoothedSeries },
        provides: token<{
          dates: readonly Date[]
          yByAxis: ReadonlyArray<{ axisId: string; values: readonly number[] }>
        }>('series.domainValues'),
        contributes: [
          { to: XDomainValues, select: out => out.dates },
          { to: YDomainValues, select: out => out.yByAxis },
        ],
        run: ({ visible, smoothed }) => {
          const dates: Date[] = []
          const byAxis = new Map<string, number[]>()
          for (const s of visible.values()) {
            // The x extent uses RAW dates; the y extent uses SMOOTHED values —
            // smoothing affects the domain, decimation does not.
            for (const p of s.raw) dates.push(p.date)
            const values = byAxis.get(s.resolved.axisId) ?? []
            for (const p of smoothed.get(s.id) ?? []) values.push(p.value)
            byAxis.set(s.resolved.axisId, values)
          }
          return {
            dates,
            yByAxis: Array.from(byAxis, ([axisId, values]) => ({ axisId, values })),
          }
        },
      }),
    ],

    render: [
      renderStep({
        id: 'series.host',
        reads: { visible: VisibleSeries, hasData: HasData },
        layer: { name: 'series', z: 30, host: 'scroll' },
        run: ({ visible, hasData }, ctx) => {
          const data = hasData ? Array.from(visible.values()) : []
          const groups = ctx
            .layer!.selectAll<SVGGElement, VisibleSeriesEntry>('.lc-series')
            .data(data, d => d.id)
          groups.exit().remove()
          const merged = groups
            .enter()
            .append('g')
            .attr('class', 'lc-series')
            .attr('data-id', d => d.id)
            .merge(groups)
          // Rebirth: clear this series' elements so renderers see isNew (drawOn).
          merged.each(function (d) {
            const prev = prevRebirth.get(d.id)
            if (prev !== undefined && prev !== d.rebirth) {
              const g = this as SVGGElement
              for (const el of Array.from(
                g.querySelectorAll('.lc-line,.lc-dot,.lc-dot-exiting'),
              )) {
                el.remove()
              }
            }
            prevRebirth.set(d.id, d.rebirth)
          })
          for (const id of prevRebirth.keys()) {
            if (!visible.has(id)) prevRebirth.delete(id)
          }
        },
      }),
    ],

    mount(rt) {
      const store = rt.store(SeriesStore)
      // Cross-store effects invoked by the axes module — no flushSync here; the
      // calling api method flushes once everything is consistent.
      rt.provideCommand('series.migrateAxis', (removedAxisId: string, fallbackId: string) => {
        const current = store.get()
        const series = new Map(current.series)
        let touched = false
        for (const [id, slice] of series) {
          if (slice.axisId !== removedAxisId) continue
          series.set(id, { ...slice, axisId: fallbackId })
          touched = true
        }
        if (touched) store.set({ series, nextPaletteIndex: current.nextPaletteIndex })
      })
      // In-place trim with no store bump: matches the monolith's silent
      // post-render splice — the shrunken list takes effect on the next
      // data-driven join. Array identity is preserved so memo caches stay valid.
      rt.provideCommand('series.trimExitPoints', (keep: number) => {
        for (const slice of store.get().series.values()) {
          if (slice.pendingExitPoints.length > keep) {
            slice.pendingExitPoints.splice(0, slice.pendingExitPoints.length - keep)
          }
        }
      })
      rt.provideCommand('series.associate', (seriesId: string, axisId: string) => {
        const current = store.get()
        const series = new Map(current.series)
        const state = { nextPaletteIndex: current.nextPaletteIndex }
        const existing = series.get(seriesId)
        if (existing) {
          series.set(seriesId, { ...existing, axisId })
        } else {
          const slice = emptySlice(seriesId, axisId)
          slice.color = PALETTE[state.nextPaletteIndex++ % PALETTE.length]
          series.set(seriesId, slice)
        }
        store.set({ series, nextPaletteIndex: state.nextPaletteIndex })
      })
    },

    api(rt) {
      return buildSeriesApi(rt)
    },

    state(rt) {
      const store = rt.store(SeriesStore)
      return {
        key: 'series',
        capture: () => ({
          series: Array.from(store.get().series.values()).map(s => ({
            id: s.id,
            axisId: s.axisId,
            data: s.points.map(p => ({ date: p.date.toISOString(), value: p.value })),
            color: s.color,
            lineWeight: s.lineWeight,
            dotRadius: s.dotRadius,
            curveType: s.curveType,
            smoothing: s.smoothing,
            decimation: s.decimation,
            showLabels: s.showLabels,
            labelFormat: s.labelFormat,
            dotBorderColor: s.dotBorderColor,
          })),
          nextPaletteIndex: store.get().nextPaletteIndex,
        }),
        restore: value => {
          const raw = value as {
            series?: Array<{
              id: string
              axisId: string
              data: RawDataPoint[]
            } & Partial<SeriesSlice>>
            nextPaletteIndex?: number
          }
          const series = new Map<string, SeriesSlice>()
          for (const s of raw?.series ?? []) {
            const axisId =
              (rt.command('axes.resolveId', s.axisId) as string | undefined) ?? DEFAULT_AXIS_ID
            const slice = emptySlice(s.id, axisId)
            slice.points = s.data.map(parseRaw)
            slice.dataRev = 1
            slice.color = s.color
            slice.lineWeight = s.lineWeight
            slice.dotRadius = s.dotRadius
            slice.curveType = s.curveType
            slice.smoothing = s.smoothing
            slice.decimation = s.decimation
            slice.showLabels = s.showLabels
            slice.labelFormat = s.labelFormat
            slice.dotBorderColor = s.dotBorderColor
            series.set(s.id, slice)
          }
          // Chart invariant: the 'default' series is assumed by setData(array).
          if (!series.has('default')) {
            const fallback =
              (rt.command('axes.resolveId', DEFAULT_AXIS_ID) as string | undefined) ??
              DEFAULT_AXIS_ID
            series.set('default', emptySlice('default', fallback))
          }
          store.set({ series, nextPaletteIndex: raw?.nextPaletteIndex ?? 0 })
        },
      }
    },
  }
}

function buildSeriesApi(rt: ModuleRuntime): Record<string, (...args: never[]) => unknown> {
  const store = rt.store(SeriesStore)
  const settings = rt.store(Settings)

  /** Clone-and-mutate: replaces the Map (and state object) so identity diffs see it. */
  const mutate = (
    fn: (series: Map<string, SeriesSlice>, state: { nextPaletteIndex: number }) => void,
    trigger: Parameters<StoreHandle<SeriesStoreState>['set']>[1],
  ): void => {
    const current = store.get()
    const series = new Map(current.series)
    const state = { nextPaletteIndex: current.nextPaletteIndex }
    fn(series, state)
    store.set({ series, nextPaletteIndex: state.nextPaletteIndex }, trigger)
    rt.flushSync()
  }

  const cloneSlice = (s: SeriesSlice): SeriesSlice => ({ ...s })

  /** Unknown axis ids fall back to the first existing axis (axes-store command). */
  const resolveAxisId = (requested: string): string =>
    (rt.command('axes.resolveId', requested) as string | undefined) ?? DEFAULT_AXIS_ID

  /** Trim to settings.maxDataPoints; returns accumulated exit points. */
  const trimToMaxPoints = (slice: SeriesSlice): DataPoint[] => {
    const max = settings.get().maxDataPoints
    if (max === null || max <= 0 || slice.points.length <= max) return []
    const newExit = slice.points.splice(0, slice.points.length - max)
    return slice.pendingExitPoints.concat(newExit)
  }

  const ensureSlice = (
    series: Map<string, SeriesSlice>,
    state: { nextPaletteIndex: number },
    id: string,
    seriesSettings?: SeriesSettings,
  ): SeriesSlice => {
    const existing = series.get(id)
    if (existing) {
      const clone = cloneSlice(existing)
      series.set(id, clone)
      return clone
    }
    const color =
      seriesSettings?.color ?? PALETTE[state.nextPaletteIndex++ % PALETTE.length]
    const slice = emptySlice(id, resolveAxisId(seriesSettings?.axis ?? DEFAULT_AXIS_ID))
    slice.color = color
    slice.lineWeight = seriesSettings?.lineWeight
    slice.dotRadius = seriesSettings?.dotRadius
    slice.curveType = seriesSettings?.curveType
    slice.smoothing = seriesSettings?.smoothing
    slice.decimation = seriesSettings?.decimation
    slice.showLabels = seriesSettings?.showLabels
    slice.labelFormat = seriesSettings?.labelFormat
    slice.dotBorderColor = seriesSettings?.dotBorderColor
    series.set(id, slice)
    return slice
  }

  const setSeriesDataImpl = (id: string, data: RawDataPoint[]): void => {
    const parsed = data.map(parseRaw)
    mutate((series, state) => {
      const slice = ensureSlice(series, state, id)
      slice.points = parsed
      slice.pendingExitPoints = []
      slice.dataRev++
    }, { kind: 'setData', seriesId: id })
  }

  const updateSeriesDataImpl = (id: string, data: RawDataPoint[]): void => {
    const incoming = data.map(parseRaw)
    const s = settings.get()
    mutate((series, state) => {
      const slice = ensureSlice(series, state, id)
      if (slice.points.length === 0) {
        slice.points = incoming
        slice.dataRev++
        return
      }
      const overlap = computeOverlap(slice.points, incoming)
      const ratio = overlap / Math.max(slice.points.length, incoming.length)
      const sufficient =
        overlap >= s.minOverlapForTransition && ratio >= s.overlapThreshold

      if (sufficient) {
        const incomingSet = new Set(incoming.map(p => p.date.getTime()))
        slice.pendingExitPoints = slice.points.filter(p => !incomingSet.has(p.date.getTime()))
      } else {
        slice.pendingExitPoints = []
        slice.rebirth++ // renderers clear this series' elements → drawOn fallback
      }
      slice.points = incoming
      slice.dataRev++
    }, { kind: 'updateData', seriesId: id })
  }

  const appendSeriesDataPointsImpl = (id: string, points: RawDataPoint[]): void => {
    const parsed = points.map(parseRaw)
    mutate((series, state) => {
      const slice = ensureSlice(series, state, id)
      slice.points = [...slice.points, ...parsed]
      slice.pendingExitPoints = trimToMaxPoints(slice)
      slice.dataRev++
    }, { kind: 'append', seriesId: id })
  }

  return {
    setData: (data: RawDataPoint[] | Record<string, RawDataPoint[]>): void => {
      if (Array.isArray(data)) {
        setSeriesDataImpl('default', data)
      } else {
        for (const [id, points] of Object.entries(data)) {
          setSeriesDataImpl(id, points)
        }
      }
    },

    updateData: (data: RawDataPoint[]): void => updateSeriesDataImpl('default', data),

    appendDataPoint: (point: RawDataPoint): void =>
      appendSeriesDataPointsImpl('default', [point]),

    appendDataPoints: (points: RawDataPoint[]): void =>
      appendSeriesDataPointsImpl('default', points),

    clearData: (): void => {
      rt.command('viewport.reset')
      mutate((series, state) => {
        const def = series.get('default')
        const keep = def ? cloneSlice(def) : emptySlice('default', DEFAULT_AXIS_ID)
        keep.points = []
        keep.pendingExitPoints = []
        keep.dataRev++
        keep.rebirth++
        series.clear()
        series.set('default', keep)
        state.nextPaletteIndex = 0
      }, { kind: 'setData' })
    },

    addSeries: (id: string, seriesSettings?: SeriesSettings): void => {
      const current = store.get()
      if (current.series.has(id)) return
      mutate((series, state) => {
        ensureSlice(series, state, id, seriesSettings)
      }, { kind: 'mutation' })
    },

    removeSeries: (id: string): void => {
      mutate(series => {
        series.delete(id)
      }, { kind: 'mutation' })
    },

    setSeriesData: setSeriesDataImpl,
    updateSeriesData: updateSeriesDataImpl,

    appendSeriesDataPoint: (id: string, point: RawDataPoint): void =>
      appendSeriesDataPointsImpl(id, [point]),

    appendSeriesDataPoints: appendSeriesDataPointsImpl,

    setSeriesColor: (id: string, color: string): void => {
      mutate(series => {
        const slice = series.get(id)
        if (!slice) return
        const clone = cloneSlice(slice)
        clone.color = color
        series.set(id, clone)
      }, { kind: 'mutation' })
    },

    setSeriesWeight: (id: string, weight: number): void => {
      mutate(series => {
        const slice = series.get(id)
        if (!slice) return
        const clone = cloneSlice(slice)
        clone.lineWeight = weight
        series.set(id, clone)
      }, { kind: 'mutation' })
    },

    setLineColor: (color: string): void => {
      settings.update(s => ({ ...s, lineColor: color }))
      rt.flushSync()
    },

    setLineWeight: (weight: number): void => {
      settings.update(s => ({ ...s, lineWeight: weight }))
      rt.flushSync()
    },

    updateSeriesSettings: (id: string, partial: Partial<SeriesSettings>): void => {
      mutate(series => {
        const slice = series.get(id)
        if (!slice) return
        const clone = cloneSlice(slice)
        // 'in' (not !== undefined) so explicit null/false/0 propagate correctly.
        if ('color' in partial) clone.color = partial.color
        if ('lineWeight' in partial) clone.lineWeight = partial.lineWeight
        if ('dotRadius' in partial) clone.dotRadius = partial.dotRadius
        if ('curveType' in partial) clone.curveType = partial.curveType
        if ('smoothing' in partial) clone.smoothing = partial.smoothing
        if ('decimation' in partial) clone.decimation = partial.decimation
        if ('showLabels' in partial) clone.showLabels = partial.showLabels
        if ('labelFormat' in partial) clone.labelFormat = partial.labelFormat
        if ('dotBorderColor' in partial) clone.dotBorderColor = partial.dotBorderColor
        if ('axis' in partial && partial.axis !== undefined) {
          clone.axisId = resolveAxisId(partial.axis)
        }
        series.set(id, clone)
      }, { kind: 'mutation' })
    },
  }
}
