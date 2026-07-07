export type EasingType =
  | 'easeLinear'
  | 'easeQuadIn'    | 'easeQuadOut'    | 'easeQuadInOut'
  | 'easeCubicIn'   | 'easeCubicOut'   | 'easeCubicInOut'
  | 'easeSinIn'     | 'easeSinOut'     | 'easeSinInOut'
  | 'easeExpIn'     | 'easeExpOut'     | 'easeExpInOut'
  | 'easeCircleIn'  | 'easeCircleOut'  | 'easeCircleInOut'
  | 'easeBackIn'    | 'easeBackOut'    | 'easeBackInOut'
  | 'easeBounceIn'  | 'easeBounceOut'  | 'easeBounceInOut'
  | 'easeElasticIn' | 'easeElasticOut' | 'easeElasticInOut'

export type AnimationMode =
  | 'none'        // instant — no transition
  | 'drawOn'      // stroke-dasharray draw-from-left
  | 'transition'  // container scroll — slides lc-scroll-container as a unit; falls back to drawOn if path is brand new
  | 'morph'       // smooth D3 path morph + per-dot transitions

export type CurveType =
  | 'linear'
  | 'monotoneX'
  | 'monotoneY'
  | 'natural'
  | 'basis'
  | 'cardinal'
  | 'catmullRom'
  | 'step'
  | 'stepBefore'
  | 'stepAfter'

/** What Blazor sends over JS interop — C# DateTime serializes to ISO 8601 string */
export interface TemporalDataPointRaw {
  date: string | Date
  value: number
}

/** Internal representation after date parsing */
export interface TemporalDataPoint {
  date: Date
  value: number
}

/** Number (X,Y) values */
export interface NumericDataPoint {
  x: number
  y: number
}

/** Internal representation of data; polymorphic */
export interface InternalDataPoint {
  x: Date | number
  y: number
}

export const DataPointKind = {
  Temporal: 'temporal',
  Numeric: 'numeric',
} as const

/** The value side of DataPointKind — 'temporal' | 'numeric'. */
export type DataPointKindValue = (typeof DataPointKind)[keyof typeof DataPointKind]

export interface DataKindAdapter<Raw> {
  kind: DataPointKindValue
  parse(raw: Raw): InternalDataPoint
  dump(point: InternalDataPoint): Raw
}

export interface ChartMargins {
  top: number
  right: number
  bottom: number
  left: number
}

/** Per-series appearance overrides. Undefined fields cascade to the chart-wide ChartSettings defaults. */
export interface SeriesSettings {
  /** Per-series line/dot colour override. Undefined falls back to the axis colour or ChartSettings.lineColor. */
  color?: string
  lineWeight?: number
  dotRadius?: number
  curveType?: CurveType
  /** Id of the y-axis this series is plotted against; defaults to 'default'. Unknown ids fall back to a random axis. */
  axis?: string
  /** Per-series moving average window size override; undefined falls back to ChartSettings.smoothing. */
  smoothing?: number
  /** Per-series LTTB decimation target override; undefined falls back to ChartSettings.decimation. */
  decimation?: number
  /** Show value labels next to each data point; undefined falls back to ChartSettings.showLabels. */
  showLabels?: boolean
  /** d3-format specifier for label values; null uses tooltipValueFormat; undefined cascades to ChartSettings.labelFormat. */
  labelFormat?: string | null
  /** Border colour of marker dots; null = auto from theme; undefined cascades to ChartSettings.dotBorderColor. */
  dotBorderColor?: string | null
}

/** Per y-axis configuration. Undefined fields cascade to the chart-wide ChartSettings defaults. */
export interface AxisSettings {
  /** Label shown above the rail when the chart has 2+ axes. Defaults to the axis id. */
  name?: string
  /** When set, paints the axis chrome AND overrides the line/dot colour of every series associated with this axis. */
  color?: string
  /** Hard-set domain [min, max]; if present the axis displays exactly this range and ignores `limits`. */
  range?: [number, number]
  /** Soft bounds — the auto-computed extent is clamped so the axis cannot extend below limits[0] nor above limits[1]. */
  limits?: [number, number]
  /** Scale type for this axis; undefined cascades to ChartSettings.yScaleType. */
  scaleType?: 'linear' | 'log'
  /** Show grid lines for this axis; undefined cascades to ChartSettings.showGrid. */
  showGrid?: boolean
  /** Grid line colour for this axis; undefined cascades to ChartSettings.gridColor. */
  gridColor?: string
  /** Grid line opacity for this axis; undefined cascades to ChartSettings.gridOpacity. */
  gridOpacity?: number
  /**
   * Hint for the number of y-axis tick marks. Passed directly to D3's axis.ticks().
   * undefined cascades to ChartSettings.yTickCount.
   */
  yTickCount?: number | null
}

/** Common visual styling for annotation lines. Unset fields fall back to chart-wide annotation defaults. */
export interface AnnotationStyle {
  /** Stroke colour. */
  color?: string
  /** Stroke width in pixels. */
  thickness?: number
  /** Dashed stroke (true → '6 4', false → solid). */
  dashed?: boolean
}

/** Settings for a horizontal annotation. Extends AnnotationStyle with the y-axis binding. */
export interface HorizontalAnnotationSettings extends AnnotationStyle {
  /** Id of the y-axis this annotation is pinned to. Unknown ids fall back to the first axis. Removing the bound axis removes the annotation. */
  axis?: string
}

/** Settings for a vertical annotation — purely visual; the line position is set by its timestamp. */
export type VerticalAnnotationSettings = AnnotationStyle

/**
 * Chart-wide settings. Extends SeriesSettings and AxisSettings so that every per-series and
 * per-axis property has a global default here. Per-series/axis overrides set via
 * updateSeriesSettings / updateAxisSettings take precedence over these values at render time.
 *
 * Note: `color` is inherited from both SeriesSettings and AxisSettings as an optional field.
 * At chart scope it is inert — use `lineColor` as the authoritative chart-wide line colour default.
 */
export interface ChartSettings extends SeriesSettings, AxisSettings {
  // ── Re-declared as required from SeriesSettings (chart-wide defaults) ──────
  curveType: CurveType
  lineWeight: number
  dotRadius: number
  smoothing: number
  decimation: number
  showLabels: boolean
  labelFormat: string | null
  dotBorderColor: string | null

  // ── Re-declared as required from AxisSettings (chart-wide defaults) ────────
  showGrid: boolean
  gridColor: string
  gridOpacity: number
  /**
   * Hint for the number of y-axis tick marks. Passed to D3's axis.ticks().
   * null (default) auto-computes from the available chart height (≈ innerHeight / 40),
   * which avoids label overlap on small charts. Set an explicit number to override.
   */
  yTickCount: number | null

  // ── Chart-scope defaults not inherited from the bases ─────────────────────
  /** Chart-wide default series colour. SeriesSettings.color is the per-series override. */
  lineColor: string
  /** Chart-wide y-axis scale type default. AxisSettings.scaleType is the per-axis override. */
  yScaleType: 'linear' | 'log'

  // ── Tooltip ────────────────────────────────────────────────────────────────
  showTooltip: boolean
  tooltipDateFormat: string
  tooltipValueFormat: string

  // ── Animation ──────────────────────────────────────────────────────────────
  animationDuration: number
  easingType: EasingType
  setDataAnimation: AnimationMode
  updateDataAnimation: AnimationMode
  appendAnimation: AnimationMode

  // ── Layout ─────────────────────────────────────────────────────────────────
  margins: ChartMargins
  xAxisFormatter: ((value: Date, index: number) => string) | null
  yAxisFormatter: ((value: number, index: number) => string) | null
  /**
   * Hint for the number of x-axis tick marks. Passed to D3's axis.ticks().
   * null (default) auto-computes from the available chart width (≈ innerWidth / 80),
   * which avoids label overlap on small charts. Set an explicit number to override.
   */
  xTickCount: number | null
  ariaLabel: string

  // ── X-axis line blur ───────────────────────────────────────────────────────
  /** Blurs the portion of each series' line beneath the x-axis baseline, so it
   *  reads as a soft haze instead of overlapping the crisp tick marks/labels. */
  xAxisBlurEnabled: boolean
  /** feGaussianBlur stdDeviation (px) applied within that band. */
  xAxisBlurStrength: number

  // ── updateData delta thresholds ────────────────────────────────────────────
  minOverlapForTransition: number
  overlapThreshold: number
  maxDataPoints: number | null

  // ── Theme + labels ─────────────────────────────────────────────────────────
  theme: 'light' | 'dark'
  title: string | null
  xLabel: string | null
  yLabel: string | null

  // ── Pan / zoom ─────────────────────────────────────────────────────────────
  /** Master switch for pan + zoom interactions (wheel zoom, drag pan, pinch zoom, dblclick zoom). */
  zoomEnabled: boolean
  /** Which axes the user can pan / zoom: 'x' (time only — default), 'y', or 'xy' (both). */
  zoomMode: 'x' | 'y' | 'xy'
  /** Minimum / maximum scale factor for zoom; 1 means cannot zoom out below the natural extent. */
  zoomScaleExtent: [number, number]
}

/**
 * ChartSettings minus the two function-valued fields, which cannot survive a JSON round-trip.
 * Formatters are silently dropped on snapshot; on restore they retain whatever the host
 * configured at construction.
 */
export type SerializableChartSettings = Omit<ChartSettings, 'xAxisFormatter' | 'yAxisFormatter'>

export interface AxisSnapshot {
  id: string
  name: string
  color: string | null
  range: [number, number] | null
  limits: [number, number] | null
  scaleType: 'linear' | 'log' | undefined
  showGrid: boolean | undefined
  gridColor: string | undefined
  gridOpacity: number | undefined
  yTickCount: number | null | undefined
}

export interface SeriesSnapshot {
  id: string
  axisId: string
  /** ISO 8601 strings — same shape Blazor sends across JS interop. */
  data: TemporalDataPointRaw[]
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

export type AnnotationSnapshot =
  | {
      type: 'horizontal'
      id: string
      label: string
      color: string
      thickness: number
      dashed: boolean
      y: number
      axisId: string
    }
  | {
      type: 'vertical'
      id: string
      label: string
      color: string
      thickness: number
      dashed: boolean
      /** ISO 8601 timestamp. */
      x: string
    }

export interface ZoomSnapshot {
  /** Flattened d3.ZoomTransform — { k, x, y } only. */
  transform: { k: number; x: number; y: number }
  /** Brush-set x-domain override; ISO date pair or null. */
  xDomainOverride: [string, string] | null
  /** Brush-set per-axis y-domain overrides. */
  yDomainOverrides: Array<{ axisId: string; range: [number, number] }>
}

/** The series module's snapshot slice: every series plus the palette cursor. */
export interface SeriesModuleSnapshot {
  series: SeriesSnapshot[]
  /** Palette cursor — preserves colour continuity for series added after restore. */
  nextPaletteIndex: number
}

/**
 * Complete chart state in a JSON-safe shape — format version 2 (breaking change
 * in 0.3.0; version-1 snapshots are rejected). Captured by `getSnapshot()` and
 * consumed by `restoreSnapshot()`. Designed for Blazor JS interop — no Date
 * instances, no functions.
 *
 * Each entry under `modules` is captured and restored by the module that owns
 * that state; charts composed from different module sets carry exactly their
 * own slices. `xAxisFormatter` / `yAxisFormatter` are dropped from `settings`.
 */
export interface ChartSnapshot {
  version: 2
  modules: {
    settings: SerializableChartSettings
    axes: AxisSnapshot[]
    series: SeriesModuleSnapshot
    annotations: AnnotationSnapshot[]
    zoom: ZoomSnapshot
  } & Record<string, unknown>
}

// --- General chart-agnostic API ---
export interface ChartHandle {
  /** Remove the chart from the DOM and clean up all resources */
  destroy(): void
  /** Export the current chart as a PDF and trigger a browser download */
  saveToPdf(filename?: string): Promise<void>
  /** Clear all data and return to skeleton state */
  clearData(): void
}

// --- Annotation API ---
export interface AnnotationHandle {
  /**
   * Create a horizontal line across the chart, pinned to a y-axis.
   * `y` is in the bound axis's value space and the axis treats it like a data point to ensure it remains within the ranges. `settings.axis` selects the axis (defaults to the first axis).
   * Removing the bound y-axis also removes this annotation.
   * Replaces any existing annotation with the same name.
   */
  setHorizontalLine(name: string, y: number, label: string, settings?: HorizontalAnnotationSettings): void
  /**
   * Create a vertical line at the given timestamp.
   * `x` is an ISO 8601 date string (same format Blazor sends for `TemporalDataPointRaw.date`); it is parsed to a Date internally.
   * Vertical annotations are not tied to any y-axis and survive y-axis removal.
   * Replaces any existing annotation with the same name.
   */
  setVerticalLine(name: string, x: string, label: string, settings?: VerticalAnnotationSettings): void

  /**
   * Remove an existing annotation.
   * No-op if the annotation does not exist.
   */
  removeAnnotation(name: string): void
  /** Remove all annotations from the chart. */
  clearAnnotations(): void
}

// --- Snapshot API ---
export interface SnapshotHandle {
  /**
   * Capture the chart's full mutable state as a JSON-safe snapshot (format
   * version 2: per-module slices). Includes settings (minus the two function
   * formatters), every axis, every series with its data as ISO 8601 strings,
   * every annotation, the pan/zoom transform with any brush-set domain
   * overrides, and the palette cursor.
   */
  getSnapshot(): ChartSnapshot
  /**
   * Replace the chart's state with the snapshot, slice by slice, then run a
   * single re-render. Pre-version-2 snapshots are rejected with an error.
   * `xAxisFormatter` / `yAxisFormatter` are not touched — whatever the host set
   * at construction stays in place.
   */
  restoreSnapshot(snapshot: ChartSnapshot): void
}

// --- Multi-series API ---
export interface SeriesHandle {
  /** Add a named series; no-op if id already exists */
  addSeries(id: string, settings?: SeriesSettings): void
  /** Remove a named series and re-render; 'default' cannot be removed */
  removeSeries(id: string): void
  /** Replace the data for a named series; auto-creates the series if absent */
  setSeriesData(id: string, data: TemporalDataPointRaw[]): void
  /** Delta-aware update for a named series, mirrors updateData */
  updateSeriesData(id: string, data: TemporalDataPointRaw[]): void
  /** Append a single point to a named series */
  appendSeriesDataPoint(id: string, point: TemporalDataPointRaw): void
  /** Append multiple points to a named series */
  appendSeriesDataPoints(id: string, points: TemporalDataPointRaw[]): void
  /** Fast path — mutates stroke color for a named series */
  setSeriesColor(id: string, color: string): void
  /** Fast path — mutates stroke width for a named series */
  setSeriesWeight(id: string, weight: number): void
  /** Sparse-merge settings into a specific series and re-render. Use undefined values to reset a field to the chart-wide default. */
  updateSeriesSettings(id: string, settings: Partial<SeriesSettings>): void
}

// --- Multi-axis API ---
export interface AxisHandle {
  /** Create or update a named y-axis. Sparse — only provided fields are written. */
  createAxis(name: string, options?: AxisSettings): void
  /**
   * Remove a y-axis. Series previously bound to it migrate to the first remaining axis.
   * No-op when removing the last remaining axis — the chart always keeps at least one.
   */
  removeAxis(name: string): void
  /** Bind a series to an axis. Auto-creates the series if absent. Unknown axis ids are ignored with a warning. */
  associateSeries(seriesName: string, axisName: string): void
  /** Sparse-merge settings into a specific axis and re-render. Use undefined values to reset a field to the chart-wide default. */
  updateAxisSettings(id: string, settings: Partial<AxisSettings>): void
}

// --- Zoom API ---
export interface ZoomHandle {
  /** Reset any pan / zoom transform back to identity (animated). No-op when already at identity. */
  resetZoom(): void
}