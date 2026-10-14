import type {
  ChartHandle,
  PieChartSettings,
  PieDataSnapshot,
  PieSlice,
  SerializablePieChartSettings,
} from '@/lib/types.ts'

/**
 * Pie chart state in a JSON-safe shape — snapshot format version 2, carrying the
 * pie's two slices: settings and the pie data (slices, colour overrides, palette).
 */
export interface PieChartSnapshot {
  version: 2
  modules: {
    settings: SerializablePieChartSettings
    pie: PieDataSnapshot
  } & Record<string, unknown>
}

/** The object Blazor holds as IJSObjectReference for a pie chart. */
export interface PieChartHandle extends ChartHandle {
  /**
   * Replace all slices — hides the skeleton and animates the pie in
   * (setDataAnimation; 'drawOn' sweeps the slices out from 12 o'clock).
   * Labels are the slice identity and must be unique; negative or non-finite
   * values are drawn as 0 with a console warning.
   */
  setData(slices: PieSlice[]): void
  /**
   * Replace all slices, animating from the current pie (updateDataAnimation;
   * 'morph' interpolates every arc — slices are matched by label, new ones grow
   * from zero width, removed ones collapse and fade).
   */
  updateData(slices: PieSlice[]): void
  /**
   * Override one slice's colour (by label). `null` resets it to its palette colour.
   * A `color` given in the slice data still takes precedence.
   */
  setSliceColor(label: string, color: string | null): void
  /** Live update chart settings and re-render. */
  updateSettings(settings: Partial<PieChartSettings>): void
  /** Capture the chart's full state (settings + slices + colour assignments). */
  getSnapshot(): PieChartSnapshot
  /** Replace the chart's state with the snapshot, then re-render once. */
  restoreSnapshot(snapshot: PieChartSnapshot): void
}
