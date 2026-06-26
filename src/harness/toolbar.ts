import type { RawDataPoint } from '@/lib/index.ts'
import { generateSeries, generateNumericSeries, slideWindow, slideNumericWindow } from './data.ts'
import type { Harness } from './state.ts'

/** Header controls: quick colors, append/auto/update/clear/reload, dots, grid, zoom, PDF. */
export function initToolbar(h: Harness): void {
  const { chart, setLog } = h

  document.getElementById('btn-red')!.addEventListener('click', () => {
    chart.setLineColor('#ef4444')
    setLog('setLineColor("#ef4444")')
  })

  document.getElementById('btn-blue')!.addEventListener('click', () => {
    chart.setLineColor('#4f46e5')
    setLog('setLineColor("#4f46e5")')
  })

  document.getElementById('btn-append')!.addEventListener('click', () => {
    let count = 0
    if (h.chartKind === 'numeric') {
      const step = h.numericXStep()
      h.forEachLiveSeries((id, data) => {
        const last = data[data.length - 1] as unknown as { x: number; y: number }
        if (!last) return
        const point = { x: last.x + step, y: Math.max(1, last.y + (Math.random() - 0.48) * 10) }
        ;(data as unknown as { x: number; y: number }[]).push(point)
        chart.appendSeriesDataPoint(id, point as unknown as RawDataPoint)
        count++
      })
      if (count > 0) setLog(`appendSeriesDataPoint(…) × ${count} series (+${step})`)
    } else {
      const stepMs = h.intervalMs()
      h.forEachLiveSeries((id, data) => {
        const last = data[data.length - 1]
        if (!last) return
        const nextDate = new Date(new Date(last.date).getTime() + stepMs)
        const point: RawDataPoint = {
          date: nextDate.toISOString(),
          value: Math.max(1, parseFloat(last.value.toFixed(2)) + (Math.random() - 0.48) * 10),
        }
        data.push(point)
        chart.appendSeriesDataPoint(id, point)
        count++
      })
      if (count > 0) setLog(`appendSeriesDataPoint(…) × ${count} series (+${h.intervalLabel()})`)
    }
  })

  let autoAppendTimer: ReturnType<typeof setInterval> | null = null
  const btnAutoAppend = document.getElementById('btn-auto-append')!
  btnAutoAppend.addEventListener('click', () => {
    if (autoAppendTimer !== null) {
      clearInterval(autoAppendTimer)
      autoAppendTimer = null
      btnAutoAppend.textContent = 'Auto'
      btnAutoAppend.classList.remove('active')
      setLog('Auto-append stopped.')
    } else {
      autoAppendTimer = setInterval(() => {
        document.getElementById('btn-append')!.click()
      }, 250)
      btnAutoAppend.textContent = 'Stop'
      btnAutoAppend.classList.add('active')
      setLog('Auto-append running every 250 ms…')
    }
  })

  document.getElementById('btn-append-batch')!.addEventListener('click', () => {
    let count = 0
    if (h.chartKind === 'numeric') {
      const step = h.numericXStep()
      h.forEachLiveSeries((id, data) => {
        const last = data[data.length - 1] as unknown as { x: number; y: number }
        if (!last) return
        const batch = generateNumericSeries(5, last.x + step, last.y, step)
        ;(data as unknown as { x: number; y: number }[]).push(...batch)
        chart.appendSeriesDataPoints(id, batch as unknown as RawDataPoint[])
        count++
      })
      if (count > 0) setLog(`appendSeriesDataPoints(…, 5) × ${count} series (+${h.numericXStep()} steps)`)
    } else {
      const stepMs = h.intervalMs()
      h.forEachLiveSeries((id, data) => {
        const last = data[data.length - 1]
        if (!last) return
        const nextDate = new Date(new Date(last.date).getTime() + stepMs)
        const batch = generateSeries(5, nextDate, parseFloat(last.value.toFixed(2)), stepMs)
        data.push(...batch)
        chart.appendSeriesDataPoints(id, batch)
        count++
      })
      if (count > 0) setLog(`appendSeriesDataPoints(…, 5) × ${count} series (+${h.intervalLabel()} steps)`)
    }
  })

  document.getElementById('btn-update')!.addEventListener('click', () => {
    let count = 0
    if (h.chartKind === 'numeric') {
      const step = h.numericXStep()
      for (const [id, data] of h.seriesDataMap.entries()) {
        if (data.length === 0) continue
        const shifted = slideNumericWindow(data as unknown as { x: number; y: number }[], 7, step)
        h.seriesDataMap.set(id, shifted as unknown as RawDataPoint[])
        chart.updateSeriesData(id, shifted as unknown as RawDataPoint[])
        count++
      }
      if (count > 0) setLog(`updateSeriesData(…, window slide 7 × ${step}) × ${count} series`)
    } else {
      const stepMs = h.intervalMs()
      for (const [id, data] of h.seriesDataMap.entries()) {
        if (data.length === 0) continue
        const shifted = slideWindow(data, 7, stepMs)
        h.seriesDataMap.set(id, shifted)
        chart.updateSeriesData(id, shifted)
        count++
      }
      if (count > 0) setLog(`updateSeriesData(…, window slide 7 × ${h.intervalLabel()}) × ${count} series`)
    }
  })

  document.getElementById('btn-clear')!.addEventListener('click', () => {
    // Reset every series, not just default — clearData wipes them all on the chart side.
    for (const id of h.seriesDataMap.keys()) h.seriesDataMap.set(id, [])
    chart.clearData()
    setLog('clearData() — skeleton shown again')
  })

  document.getElementById('btn-reload')!.addEventListener('click', () => {
    const baseStart: Record<string, number> = { default: 100 }
    if (h.chartKind === 'numeric') {
      const numPayload: Record<string, { x: number; y: number }[]> = {}
      for (const id of h.seriesDataMap.keys()) {
        const start = baseStart[id] ?? 50 + Math.random() * 150
        const data = generateNumericSeries(90, 0, start)
        h.seriesDataMap.set(id, data as unknown as RawDataPoint[])
        numPayload[id] = data
      }
      chart.setData(numPayload as unknown as Record<string, RawDataPoint[]>)
      setLog(`setData({ ${Object.keys(numPayload).map(k => `${k}: […]`).join(', ')} })`)
    } else {
      const payload: Record<string, RawDataPoint[]> = {}
      for (const id of h.seriesDataMap.keys()) {
        const start = baseStart[id] ?? 50 + Math.random() * 150
        const data = generateSeries(90, new Date('2024-01-01'), start)
        h.seriesDataMap.set(id, data)
        payload[id] = data
      }
      chart.setData(payload)
      setLog(`setData({ ${Object.keys(payload).map(k => `${k}: […]`).join(', ')} })`)
    }
  })

  let dotsOn = true
  document.getElementById('btn-no-dots')!.addEventListener('click', () => {
    dotsOn = !dotsOn
    chart.updateSettings({ dotRadius: dotsOn ? 4 : 0 })
    setLog(`updateSettings({ dotRadius: ${dotsOn ? 4 : 0} })`)
  })

  let gridOn = true
  document.getElementById('btn-toggle-grid')!.addEventListener('click', () => {
    gridOn = !gridOn
    chart.updateSettings({ showGrid: gridOn })
    setLog(`updateSettings({ showGrid: ${gridOn} })`)
  })

  const gridColorInput = document.getElementById('grid-color') as HTMLInputElement
  gridColorInput.addEventListener('input', () => {
    chart.updateSettings({ gridColor: gridColorInput.value })
    setLog(`updateSettings({ gridColor: "${gridColorInput.value}" })`)
  })

  const dotBorderColorInput = document.getElementById('dot-border-color') as HTMLInputElement
  dotBorderColorInput.addEventListener('input', () => {
    chart.updateSettings({ dotBorderColor: dotBorderColorInput.value })
    setLog(`updateSettings({ dotBorderColor: "${dotBorderColorInput.value}" })`)
  })
  const dotBorderClearBtn = document.getElementById('btn-dot-border-clear') as HTMLButtonElement
  dotBorderClearBtn.addEventListener('click', () => {
    chart.updateSettings({ dotBorderColor: null })
    setLog('updateSettings({ dotBorderColor: null })')
  })

  const zoomModeSelect = document.getElementById('zoom-mode') as HTMLSelectElement
  zoomModeSelect.addEventListener('change', () => {
    const raw = zoomModeSelect.value
    if (raw === 'off') {
      chart.updateSettings({ zoomEnabled: false })
      setLog('updateSettings({ zoomEnabled: false })')
    } else {
      const zoomMode = raw as 'x' | 'y' | 'xy'
      chart.updateSettings({ zoomEnabled: true, zoomMode })
      setLog(`updateSettings({ zoomEnabled: true, zoomMode: "${zoomMode}" })`)
    }
  })

  document.getElementById('btn-reset-zoom')!.addEventListener('click', () => {
    chart.resetZoom()
    setLog('resetZoom()')
  })

  document.getElementById('btn-save-pdf')!.addEventListener('click', () => {
    chart.saveToPdf('chart')
    setLog('saveToPdf("chart")')
  })
}
