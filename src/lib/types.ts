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

export interface ChartSettings {
  // Line appearance
  curveType: CurveType
  lineWeight: number
  lineColor: string
  dotRadius: number           // 0 = no dots

  // Grid
  showGrid: boolean
  gridColor: string
  gridOpacity: number         // 0–1

  // Tooltip
  showTooltip: boolean
  tooltipDateFormat: string   // d3-time-format specifier, e.g. '%b %d, %Y'
  tooltipValueFormat: string  // d3-format specifier, e.g. '.2f'

  // Animation
  animationDuration: number   // ms; 0 = no animation
  easingType: EasingType

  // Layout
  margins: ChartMargins

  // Axis formatters (null = d3 defaults)
  xAxisFormatter: ((value: Date, index: number) => string) | null
  yAxisFormatter: ((value: number, index: number) => string) | null

  // Accessibility
  ariaLabel: string

  // updateData delta thresholds
  minOverlapForTransition: number  // minimum absolute overlap count (default 2)
  overlapThreshold: number         // minimum overlap ratio 0–1 (default 0.3)

  // Per-operation animation mode
  setDataAnimation: AnimationMode      // default 'drawOn'
  updateDataAnimation: AnimationMode   // default 'morph'
  appendAnimation: AnimationMode       // default 'none'; appendDataPoints inherits this

  // Rolling window — null means unlimited
  maxDataPoints: number | null

  /** Show value labels next to each data point */
  showLabels: boolean
  /** d3-format specifier for label values; null falls back to tooltipValueFormat */
  labelFormat: string | null

  /** Visual theme. Drives dot stroke, tooltip palette, and skeleton shimmer. */
  theme: 'light' | 'dark'

  /**
   * Border colour of marker dots. Set this to match the chart's background colour
   * so the stroke blends in and "hides" the line beneath each dot.
   * null = auto-derived from `theme` (#fff for light, #1a1815 for dark).
   */
  dotBorderColor: string | null

  /** Chart title rendered centred above the plot area. null = hidden. */
  title: string | null
  /** Label for the x-axis, rendered centred below the axis ticks. null = hidden. */
  xLabel: string | null
  /** Label for the default y-axis, rendered rotated along the left margin. null = hidden. */
  yLabel: string | null

  /** Moving average window size; 0 = disabled. Applied view-side — raw data is unchanged. */
  smoothing: number

  /** Scale type for the primary (default) y-axis. Per-axis overrides take precedence. */
  yScaleType: 'linear' | 'log'
}

/** Per-series appearance overrides */
export interface SeriesSettings {
  color?: string
  lineWeight?: number
  dotRadius?: number
  curveType?: CurveType
  /** Id of the y-axis this series is plotted against; defaults to 'default'. Unknown ids fall back to a random axis. */
  axis?: string
  /** Per-series moving average window size override; undefined falls back to ChartSettings.smoothing. */
  smoothing?: number
}

/** Per y-axis configuration */
export interface AxisOptions {
  /** Label shown above the rail when the chart has 2+ axes. Defaults to the axis id. */
  name?: string
  /** When set, paints the axis chrome AND overrides the line/dot colour of every series associated with this axis. */
  color?: string
  /** Hard-set domain [min, max]; if present the axis displays exactly this range and ignores `limits`. */
  range?: [number, number]
  /** Soft bounds — the auto-computed extent is clamped so the axis cannot extend below limits[0] nor above limits[1]. */
  limits?: [number, number]
  /** Scale type for this axis. Defaults to 'linear'. */
  scaleType?: 'linear' | 'log'
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
  /** Live update chart settings and re-render */
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

  // --- Multi-axis API ---
  /** Create or update a named y-axis. Sparse — only provided fields are written. */
  createAxis(name: string, options?: AxisOptions): void
  /**
   * Remove a y-axis. Series previously bound to it migrate to the first remaining axis.
   * No-op when removing the last remaining axis — the chart always keeps at least one.
   */
  removeAxis(name: string): void
  /** Bind a series to an axis. Auto-creates the series if absent. Unknown axis ids are ignored with a warning. */
  associateSeries(seriesName: string, axisName: string): void
}
