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

  // Edge fade — px from each edge where content fades to transparent; 0 = disabled
  edgeFadeWidth: number
}

/** Per-series appearance overrides */
export interface SeriesSettings {
  color?: string
  lineWeight?: number
  dotRadius?: number
  curveType?: CurveType
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
}
