import { createLineChart as createTemporalLineChart, createPieChart } from './lib/index.ts'
import { createNumericChart as createNumericLineChart } from './lib/charts/numeric-line/numeric-line.ts'
import type { ChartSnapshot, LineChartHandle, PieChartSnapshot, RawDataPoint } from './lib/index.ts'
import { generateSeries, generateNumericSeries } from './harness/data.ts'
import { createHarness, createPieHarness, type ChartKind } from './harness/state.ts'
import { initSavePdfButton, initToolbar } from './harness/toolbar.ts'
import { initLineTab } from './harness/line-tab.ts'
import { initAnimationTab } from './harness/animation-tab.ts'
import { initSeriesTab } from './harness/series-tab.ts'
import { initAxesTab } from './harness/axes-tab.ts'
import { initLabelsTab } from './harness/labels-tab.ts'
import { initAnnotationsTab } from './harness/annotations-tab.ts'
import { initSnapshotTab } from './harness/snapshot-tab.ts'
import { initModulesTab } from './harness/modules-tab.ts'
import { initExportTab } from './harness/export-tab.ts'
import { initPieTab } from './harness/pie-tab.ts'

const params = new URLSearchParams(window.location.search)
const chartParam = params.get('chart')
const chartKind: ChartKind = chartParam === 'numeric' || chartParam === 'pie' ? chartParam : 'temporal'

if (chartKind === 'pie') startPieHarness()
else startLineHarness(chartKind)

function startLineHarness(kind: 'temporal' | 'numeric'): void {
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
  const chart: LineChartHandle = kind === 'numeric'
    ? createNumericLineChart('chart-container', baseSettings) as unknown as LineChartHandle
    : createTemporalLineChart('chart-container', baseSettings)

  const harness = createHarness(chart, 'modules', kind)

  initToolbar(harness)
  initLineTab(harness)
  initAnimationTab(harness)
  initSeriesTab(harness)
  initAxesTab(harness)
  initLabelsTab(harness)
  const annotationsApi = initAnnotationsTab(harness)
  initExportTab(harness)
  initSnapshotTab(harness, {
    summarize: s => {
      const m = (s as ChartSnapshot).modules
      return `${m?.series?.series?.length ?? 0} series, ${m?.axes?.length ?? 0} axes, ` +
        `${m?.annotations?.length ?? 0} annotations`
    },
    afterRestore: () => annotationsApi.syncAnnoAxisOptions(),
    wipe: () => {
      chart.clearAnnotations()
      chart.clearData()
      return 'Wiped chart — clearAnnotations() + clearData(). Click Restore to rebuild.'
    },
  })
  initModulesTab(harness)

  // Simulate an async API call (Blazor pattern: load data after first render)
  setTimeout(() => {
    if (kind === 'numeric') {
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
}

function startPieHarness(): void {
  showPieChrome()

  const chart = createPieChart('chart-container', { animationDuration: 1000 })
  const harness = createPieHarness(chart)

  initSavePdfButton(harness)
  const pie = initPieTab(harness)
  initAnimationTab(harness)
  initLabelsTab(harness)
  initExportTab(harness)
  initSnapshotTab(harness, {
    summarize: s => `${(s as PieChartSnapshot).modules?.pie?.slices?.length ?? 0} slices`,
    wipe: () => {
      chart.clearData()
      return 'Wiped chart — clearData(). Click Restore to rebuild.'
    },
  })
  initModulesTab(harness)

  // Same Blazor pattern: the radial skeleton shows until data arrives.
  setTimeout(() => {
    pie.loadSample()
  }, 1500)
}

/** Pie mode: swap the line-only header row and tabs for the Pie tab. */
function showPieChrome(): void {
  document.title = 'PieChart Dev Harness'
  document.querySelector('.harness-header h1')!.textContent = 'PieChart Dev Harness'
  ;(document.querySelector('.controls-row') as HTMLElement).style.display = 'none'
  for (const tab of ['line', 'series', 'axes', 'annotations']) {
    ;(document.querySelector(`.tab-btn[data-tab="${tab}"]`) as HTMLElement).style.display = 'none'
  }
  document.querySelectorAll('.tab-btn, .tab-panel').forEach(el => el.classList.remove('active'))
  const pieBtn = document.querySelector('.tab-btn[data-tab="pie"]') as HTMLElement
  pieBtn.style.display = ''
  pieBtn.classList.add('active')
  document.getElementById('tab-pie')!.classList.add('active')
  // Axis titles and the line-only animation controls mean nothing on a pie.
  for (const id of ['x-label', 'y-label', 'pdf-x-label', 'pdf-y-label', 'anim-append']) {
    ;(document.getElementById(id)!.closest('.control-group') as HTMLElement).style.display = 'none'
  }
}
