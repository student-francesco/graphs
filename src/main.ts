import { createLineChart } from './lib/index.ts'
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

// Mirrors what Blazor does after OnAfterRenderAsync.
const chart = createLineChart('chart-container', {
  curveType: 'monotoneX',
  lineColor: '#4f46e5',
  dotRadius: 4,
  showTooltip: true,
  animationDuration: 1000,
  appendAnimation: 'transition',
  maxDataPoints: 60,
})

const harness = createHarness(chart, 'modules')

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
