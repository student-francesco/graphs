export type {
  DataPoint,
  RawDataPoint,
  ChartSettings,
  ChartMargins,
  CurveType,
  LineChartHandle,
} from './types.ts'
export { DEFAULT_SETTINGS } from './defaults.ts'
export { LineChart } from './LineChart.ts'

import { LineChart } from './LineChart.ts'
import type { ChartSettings, LineChartHandle } from './types.ts'

/**
 * Factory function for Blazor JS interop.
 *
 * Blazor usage:
 *   var module = await JS.InvokeAsync<IJSObjectReference>("import", "./graphs.es.js");
 *   var chart  = await module.InvokeAsync<IJSObjectReference>("createLineChart", divId, settings);
 *   await chart.InvokeVoidAsync("setData", data);
 *
 * Returns an object with own-property bound methods for unambiguous IJSObjectReference compatibility.
 */
export function createLineChart(
  divId: string,
  settings?: Partial<ChartSettings>,
): LineChartHandle {
  const chart = new LineChart(divId, settings)
  return {
    setData: chart.setData.bind(chart),
    updateData: chart.updateData.bind(chart),
    updateSettings: chart.updateSettings.bind(chart),
    setLineColor: chart.setLineColor.bind(chart),
    setLineWeight: chart.setLineWeight.bind(chart),
    appendDataPoint: chart.appendDataPoint.bind(chart),
    appendDataPoints: chart.appendDataPoints.bind(chart),
    clearData: chart.clearData.bind(chart),
    destroy: chart.destroy.bind(chart),
  }
}
