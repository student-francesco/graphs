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

/** @deprecated Use AxisSettings. */
export type AxisOptions = AxisSettings

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
}
