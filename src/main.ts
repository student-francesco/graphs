import { createLineChart as createTemporalLineChart } from './lib/index.ts'
import { createNumericChart as createNumericLineChart } from './lib/charts/numeric-line/numeric-line.ts'
import type { LineChartHandle, RawDataPoint } from './lib/index.ts'
import { generateSeries, generateNumericSeries } from './harness/data.ts'
import { createHarness } from './harness/state.ts'
import { initToolbar } from './harness/toolbar.ts'
import { initLineTab } from './harness/line-tab.ts'
import { initAnimationTab } from './harness/animation-tab.ts'
import { initSeriesTab } from './harness/series-tab.ts'
import { initAxesTab } from './harness/axes-tab.ts'
import { initLabelsTab } from './harness/labels-tab.ts'
import { initAnnotationsTab } from './harness/annotations-tab.ts'
import { initSnapshotTab } from './harness/snapshot-tab.ts'
import { initModulesTab } from './harness/modules-tab.ts'

const params = new URLSearchParams(window.location.search)
const chartKind = params.get('chart') === 'numeric' ? 'numeric' : 'temporal'

const baseSettings = {
  curveType: 'monotoneX' as const,
  lineColor: '#4f46e5',
  dotRadius: 4,
  showTooltip: true,
  animationDuration: 1000,
  appendAnimation: 'transition' as const,
  maxDataPoints: 60,
}

// Mirrors what Blazor does after OnAfterRenderAsync.
const chart: LineChartHandle = chartKind === 'numeric'
  ? createNumericLineChart('chart-container', baseSettings) as unknown as LineChartHandle
  : createTemporalLineChart('chart-container', baseSettings)

const harness = createHarness(chart, 'modules', chartKind)

initToolbar(harness)
initLineTab(harness)
initAnimationTab(harness)
initSeriesTab(harness)
initAxesTab(harness)
initLabelsTab(harness)
const annotationsApi = initAnnotationsTab(harness)
initSnapshotTab(harness, annotationsApi)
initModulesTab(harness)

// Simulate an async API call (Blazor pattern: load data after first render)
setTimeout(() => {
  if (chartKind === 'numeric') {
    const data = generateNumericSeries(100)
    harness.seriesDataMap.set('default', data as unknown as RawDataPoint[])
    ;(chart as unknown as ReturnType<typeof createNumericLineChart>).setData(data)
    harness.setLog('Numeric data loaded (100 points). X axis: sequential integers.')
  } else {
    const data = generateSeries(100)
    harness.seriesDataMap.set('default', data)
    chart.setData(data)
    harness.setLog('Data loaded (100 points). Drag the Decimation slider to reduce rendered points.')
  }
}, 1500)
