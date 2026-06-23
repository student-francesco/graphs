import type {
  ChartHandle,
  AnnotationHandle,
  SnapshotHandle,
  SeriesHandle,
  AxisHandle,
  ZoomHandle,
  TemporalDataPointRaw,
  ChartSettings,
} from '@/lib/types.ts'

/** The object Blazor holds as IJSObjectReference */
export interface LineChartHandle
  extends ChartHandle,
          AnnotationHandle,
          SnapshotHandle,
          SeriesHandle,
          AxisHandle,
          ZoomHandle {
  /** Load initial data — hides skeleton and animates chart in */
  setData(data: TemporalDataPointRaw[]): void
  /** Load multi-series data — each key becomes a named series */
  setData(data: Record<string, TemporalDataPointRaw[]>): void
  /**
   * Smart delta-aware update for live/streaming charts.
   * Computes overlap with existing data; transitions if sufficient overlap,
   * otherwise performs a full replace (equivalent to setData).
   */
  updateData(data: TemporalDataPointRaw[]): void
  /** Live update chart settings and re-render. Changes cascade to all series and axes without per-object overrides. */
  updateSettings(settings: Partial<ChartSettings>): void
  /** Fast path — directly mutates SVG stroke color without full re-render */
  setLineColor(color: string): void
  /** Fast path — directly mutates SVG stroke width without full re-render */
  setLineWeight(weight: number): void
  /** Append a single data point and re-render */
  appendDataPoint(point: TemporalDataPointRaw): void
  /** Append multiple data points and re-render once */
  appendDataPoints(points: TemporalDataPointRaw[]): void
}