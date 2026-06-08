export type {
  DataPoint,
  RawDataPoint,
  ChartSettings,
  ChartMargins,
  CurveType,
  AnimationMode,
  SeriesSettings,
  AxisSettings,
  AnnotationStyle,
  HorizontalAnnotationSettings,
  VerticalAnnotationSettings,
  LineChartHandle,
  ChartSnapshot,
  SerializableChartSettings,
  AxisSnapshot,
  SeriesSnapshot,
  AnnotationSnapshot,
  ZoomSnapshot,
} from './types.ts'
export { DEFAULT_SETTINGS } from './defaults.ts'
export { LineChart } from './LineChart.ts'
export { lttb, movingAverage } from './transforms.ts'

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
    saveToPdf: chart.saveToPdf.bind(chart),
    resetZoom: chart.resetZoom.bind(chart),
    destroy: chart.destroy.bind(chart),
    addSeries: chart.addSeries.bind(chart),
    removeSeries: chart.removeSeries.bind(chart),
    setSeriesData: chart.setSeriesData.bind(chart),
    updateSeriesData: chart.updateSeriesData.bind(chart),
    appendSeriesDataPoint: chart.appendSeriesDataPoint.bind(chart),
    appendSeriesDataPoints: chart.appendSeriesDataPoints.bind(chart),
    setSeriesColor: chart.setSeriesColor.bind(chart),
    setSeriesWeight: chart.setSeriesWeight.bind(chart),
    updateSeriesSettings: chart.updateSeriesSettings.bind(chart),
    createAxis: chart.createAxis.bind(chart),
    removeAxis: chart.removeAxis.bind(chart),
    associateSeries: chart.associateSeries.bind(chart),
    updateAxisSettings: chart.updateAxisSettings.bind(chart),
    setHorizontalLine: chart.setHorizontalLine.bind(chart),
    setVerticalLine: chart.setVerticalLine.bind(chart),
    removeAnnotation: chart.removeAnnotation.bind(chart),
    clearAnnotations: chart.clearAnnotations.bind(chart),
    getSnapshot: chart.getSnapshot.bind(chart),
    restoreSnapshot: chart.restoreSnapshot.bind(chart),
  }
}
