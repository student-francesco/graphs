import { createLineChart } from './lib/index.ts'
import type { LineChartHandle } from './lib/index.ts'
import { generateSeries } from './harness/data.ts'
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

// ---------------------------------------------------------------------------
// Implementation toggle: ?impl=v2 serves the module-engine chart while it is
// built out alongside the monolith (strangler migration). The monolith stays
// the default until full parity.
// ---------------------------------------------------------------------------

const useV2 = new URLSearchParams(window.location.search).get('impl') === 'v2'

const CHART_SETTINGS = {
  curveType: 'monotoneX',
  lineColor: '#4f46e5',
  dotRadius: 4,
  showTooltip: true,
  animationDuration: 1000,
  appendAnimation: 'transition',
  maxDataPoints: 60,
} as const

let chart: LineChartHandle
let impl: 'monolith' | 'modules' = 'monolith'

if (useV2) {
  try {
    const { createLineChartV2 } = await import('./lib/charts/line.ts')
    chart = createLineChartV2('chart-container', CHART_SETTINGS)
    impl = 'modules'
  } catch (e) {
    console.warn('v2 engine not available yet — falling back to the monolith', e)
    chart = createLineChart('chart-container', CHART_SETTINGS)
  }
} else {
  chart = createLineChart('chart-container', CHART_SETTINGS)
}

const harness = createHarness(chart, impl)

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
  const data = generateSeries(500)
  harness.seriesDataMap.set('default', data)
  chart.setData(data)
  harness.setLog('Data loaded (500 points). Drag the Decimation slider to reduce rendered points.')
}, 1500)
