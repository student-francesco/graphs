import type { CurveType } from '@/lib/types.ts'
import { generateExpSeries } from './data.ts'
import type { Harness } from './state.ts'

/** Line tab: curve, smoothing, decimation, y-scale type, tick counts, exp data loader. */
export function initLineTab(h: Harness): void {
  const { chart, setLog } = h

  const curveTypeSelect = document.getElementById('curve-type') as HTMLSelectElement
  curveTypeSelect.addEventListener('change', () => {
    const curveType = curveTypeSelect.value as CurveType
    chart.updateSettings({ curveType })
    setLog(`updateSettings({ curveType: "${curveType}" })`)
  })

  const smoothingSlider = document.getElementById('smoothing-window') as HTMLInputElement
  const smoothingDisplay = document.getElementById('smoothing-display')!
  smoothingSlider.addEventListener('input', () => {
    const smoothing = parseInt(smoothingSlider.value, 10)
    smoothingDisplay.textContent = smoothing === 0 ? 'off' : String(smoothing)
    chart.updateSettings({ smoothing })
    setLog(`updateSettings({ smoothing: ${smoothing} })`)
  })

  const decimationSlider = document.getElementById('decimation-threshold') as HTMLInputElement
  const decimationDisplay = document.getElementById('decimation-display')!
  decimationSlider.addEventListener('input', () => {
    const decimation = parseInt(decimationSlider.value, 10)
    decimationDisplay.textContent = decimation === 0 ? 'off' : String(decimation)
    chart.updateSettings({ decimation })
    setLog(`updateSettings({ decimation: ${decimation} })`)
  })

  let yScaleType: 'linear' | 'log' = 'linear'
  const btnYScaleToggle = document.getElementById('btn-y-scale-toggle')!
  btnYScaleToggle.addEventListener('click', () => {
    yScaleType = yScaleType === 'linear' ? 'log' : 'linear'
    btnYScaleToggle.textContent = `Y scale: ${yScaleType}`
    chart.updateSettings({ yScaleType })
    setLog(`updateSettings({ yScaleType: "${yScaleType}" })`)
  })

  const btnLoadExp = document.getElementById('btn-load-exp')!
  if (h.chartKind === 'numeric') {
    btnLoadExp.setAttribute('disabled', '')
    btnLoadExp.title = 'Not available in numeric mode'
  } else {
    btnLoadExp.addEventListener('click', () => {
      const data = generateExpSeries(60)
      h.seriesDataMap.set('default', data)
      chart.setData(data)
      setLog('setData(exponential data — good for log scale)')
    })
  }

  const yTickCountInput = document.getElementById('y-tick-count') as HTMLInputElement
  yTickCountInput.addEventListener('change', () => {
    const yTickCount = yTickCountInput.value === '' ? null : parseInt(yTickCountInput.value, 10)
    chart.updateSettings({ yTickCount })
    setLog(`updateSettings({ yTickCount: ${yTickCount} })`)
  })

  const xTickCountInput = document.getElementById('x-tick-count') as HTMLInputElement
  xTickCountInput.addEventListener('change', () => {
    const xTickCount = xTickCountInput.value === '' ? null : parseInt(xTickCountInput.value, 10)
    chart.updateSettings({ xTickCount })
    setLog(`updateSettings({ xTickCount: ${xTickCount} })`)
  })

  const xAxisBlurEnabledCb = document.getElementById('x-axis-blur-enabled') as HTMLInputElement
  xAxisBlurEnabledCb.addEventListener('change', () => {
    const xAxisBlurEnabled = xAxisBlurEnabledCb.checked
    chart.updateSettings({ xAxisBlurEnabled })
    setLog(`updateSettings({ xAxisBlurEnabled: ${xAxisBlurEnabled} })`)
  })

  const xAxisBlurStrengthSlider = document.getElementById('x-axis-blur-strength') as HTMLInputElement
  const xAxisBlurStrengthDisplay = document.getElementById('x-axis-blur-strength-display')!
  xAxisBlurStrengthSlider.addEventListener('input', () => {
    const xAxisBlurStrength = parseFloat(xAxisBlurStrengthSlider.value)
    xAxisBlurStrengthDisplay.textContent = String(xAxisBlurStrength)
    chart.updateSettings({ xAxisBlurStrength })
    setLog(`updateSettings({ xAxisBlurStrength: ${xAxisBlurStrength} })`)
  })
}
