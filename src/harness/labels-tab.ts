import type { Harness } from './state.ts'

/** Labels tab: chart title, x label, y label. */
export function initLabelsTab(h: Harness): void {
  const { chart, setLog } = h

  const chartTitleInput = document.getElementById('chart-title') as HTMLInputElement
  const xLabelInput = document.getElementById('x-label') as HTMLInputElement
  const yLabelInput = document.getElementById('y-label') as HTMLInputElement

  chartTitleInput.addEventListener('input', () => {
    const title = chartTitleInput.value.trim() || null
    chart.updateSettings({ title })
    setLog(`updateSettings({ title: ${title ? `"${title}"` : 'null'} })`)
  })

  xLabelInput.addEventListener('input', () => {
    const xLabel = xLabelInput.value.trim() || null
    chart.updateSettings({ xLabel })
    setLog(`updateSettings({ xLabel: ${xLabel ? `"${xLabel}"` : 'null'} })`)
  })

  yLabelInput.addEventListener('input', () => {
    const yLabel = yLabelInput.value.trim() || null
    chart.updateSettings({ yLabel })
    setLog(`updateSettings({ yLabel: ${yLabel ? `"${yLabel}"` : 'null'} })`)
  })
}
