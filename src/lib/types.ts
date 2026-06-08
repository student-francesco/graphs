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
export interface RawDataPoint {
  date: string
  value: number
}

/** Internal representation after date parsing */
export interface DataPoint {
  date: Date
  value: number
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
  ariaLabel: string

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
}

export interface SeriesSnapshot {
  id: string
  axisId: string
  /** ISO 8601 strings — same shape Blazor sends across JS interop. */
  data: RawDataPoint[]
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

/**
 * Complete chart state in a JSON-safe shape. Captured by `getSnapshot()` and consumed by
 * `restoreSnapshot()`. Designed for Blazor JS interop — no Date instances, no functions.
 *
 * `xAxisFormatter` and `yAxisFormatter` are silently dropped from `settings`.
 */
export interface ChartSnapshot {
  settings: SerializableChartSettings
  axes: AxisSnapshot[]
  series: SeriesSnapshot[]
  annotations: AnnotationSnapshot[]
  zoom: ZoomSnapshot
  /** Palette cursor — preserves colour continuity for series added after restore. */
  nextPaletteIndex: number
}

/** The object Blazor holds as IJSObjectReference */
export interface LineChartHandle {
  /** Load initial data — hides skeleton and animates chart in */
  setData(data: RawDataPoint[]): void
  /** Load multi-series data — each key becomes a named series */
  setData(data: Record<string, RawDataPoint[]>): void
  /**
   * Smart delta-aware update for live/streaming charts.
   * Computes overlap with existing data; transitions if sufficient overlap,
   * otherwise performs a full replace (equivalent to setData).
   */
  updateData(data: RawDataPoint[]): void
  /** Live update chart settings and re-render. Changes cascade to all series and axes without per-object overrides. */
  updateSettings(settings: Partial<ChartSettings>): void
  /** Fast path — directly mutates SVG stroke color without full re-render */
  setLineColor(color: string): void
  /** Fast path — directly mutates SVG stroke width without full re-render */
  setLineWeight(weight: number): void
  /** Append a single data point and re-render */
  appendDataPoint(point: RawDataPoint): void
  /** Append multiple data points and re-render once */
  appendDataPoints(points: RawDataPoint[]): void
  /** Clear all data and return to skeleton state */
  clearData(): void
  /** Export the current chart as a PDF and trigger a browser download */
  saveToPdf(filename?: string): Promise<void>
  /** Reset any pan / zoom transform back to identity (animated). No-op when already at identity. */
  resetZoom(): void
  /** Remove the chart from the DOM and clean up all resources */
  destroy(): void

  // --- Multi-series API ---
  /** Add a named series; no-op if id already exists */
  addSeries(id: string, settings?: SeriesSettings): void
  /** Remove a named series and re-render; 'default' cannot be removed */
  removeSeries(id: string): void
  /** Replace the data for a named series; auto-creates the series if absent */
  setSeriesData(id: string, data: RawDataPoint[]): void
  /** Delta-aware update for a named series, mirrors updateData */
  updateSeriesData(id: string, data: RawDataPoint[]): void
  /** Append a single point to a named series */
  appendSeriesDataPoint(id: string, point: RawDataPoint): void
  /** Append multiple points to a named series */
  appendSeriesDataPoints(id: string, points: RawDataPoint[]): void
  /** Fast path — mutates stroke color for a named series */
  setSeriesColor(id: string, color: string): void
  /** Fast path — mutates stroke width for a named series */
  setSeriesWeight(id: string, weight: number): void
  /** Sparse-merge settings into a specific series and re-render. Use undefined values to reset a field to the chart-wide default. */
  updateSeriesSettings(id: string, settings: Partial<SeriesSettings>): void

  // --- Multi-axis API ---
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

  // --- Annotation API ---
  /**
   * Create a horizontal line across the chart, pinned to a y-axis.
   * `y` is in the bound axis's value space and the axis treats it like a data point to ensure it remains within the ranges. `settings.axis` selects the axis (defaults to the first axis).
   * Removing the bound y-axis also removes this annotation.
   * Replaces any existing annotation with the same name.
   */
  setHorizontalLine(name: string, y: number, label: string, settings?: HorizontalAnnotationSettings): void
  /**
   * Create a vertical line at the given timestamp.
   * `x` is an ISO 8601 date string (same format Blazor sends for `RawDataPoint.date`); it is parsed to a Date internally.
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

  // --- Snapshot API ---
  /**
   * Capture the chart's full mutable state as a JSON-safe snapshot.
   * Includes settings (minus the two function formatters), every axis, every series with
   * its data as ISO 8601 strings, every annotation, the current pan/zoom transform with
   * any brush-set domain overrides, and the palette cursor.
   */
  getSnapshot(): ChartSnapshot
  /**
   * Replace the chart's state with the snapshot. Existing series, axes, annotations and
   * zoom state are torn down first, then everything is rebuilt and a single re-render runs.
   * `xAxisFormatter` / `yAxisFormatter` are not touched — whatever the host set at
   * construction stays in place.
   */
  restoreSnapshot(snapshot: ChartSnapshot): void
}
