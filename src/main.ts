import { createLineChart } from './lib/index.ts'
import type { RawDataPoint } from './lib/index.ts'

// ---------------------------------------------------------------------------
// Demo data helpers
// ---------------------------------------------------------------------------

function generateSeries(days: number, startDate = new Date('2024-01-01'), startValue = 100): RawDataPoint[] {
  const points: RawDataPoint[] = []
  let value = startValue
  for (let i = 0; i < days; i++) {
    const date = new Date(startDate)
    date.setDate(startDate.getDate() + i)
    value += (Math.random() - 0.48) * 10
    points.push({ date: date.toISOString(), value: Math.max(1, value) })
  }
  return points
}

/** Slide the window forward by `steps` days, keeping the window size constant */
function slideWindow(data: RawDataPoint[], steps: number): RawDataPoint[] {
  const sliced = data.slice(steps)
  const lastDate = new Date(sliced[sliced.length - 1]!.date)
  const tail = generateSeries(steps, new Date(lastDate.getTime() + 86_400_000))
  return [...sliced, ...tail]
}

// ---------------------------------------------------------------------------
// Create chart — this mirrors what Blazor does after OnAfterRenderAsync
// ---------------------------------------------------------------------------

const chart = createLineChart('chart-container', {
  curveType: 'monotoneX',
  lineColor: '#4f46e5',
  dotRadius: 4,
  showTooltip: true,
  animationDuration: 1000,
})

const log = document.getElementById('log')!
function setLog(msg: string) { log.textContent = msg }

// Simulate an async API call (Blazor pattern: load data after first render)
let currentData: RawDataPoint[] = []

setTimeout(() => {
  currentData = generateSeries(90)
  chart.setData(currentData)
  setLog('Data loaded. Try the buttons above.')
}, 1500)

// ---------------------------------------------------------------------------
// Button wiring — simulates Blazor component method calls
// ---------------------------------------------------------------------------

document.getElementById('btn-red')!.addEventListener('click', () => {
  chart.setLineColor('#ef4444')
  setLog('setLineColor("#ef4444")')
})

document.getElementById('btn-blue')!.addEventListener('click', () => {
  chart.setLineColor('#4f46e5')
  setLog('setLineColor("#4f46e5")')
})

document.getElementById('btn-append')!.addEventListener('click', () => {
  const last = currentData[currentData.length - 1]
  if (last === undefined) return
  const nextDate = new Date(last.date)
  nextDate.setDate(nextDate.getDate() + 1)
  const point: RawDataPoint = { date: nextDate.toISOString(), value: Math.max(1, parseFloat(last.value.toFixed(2)) + (Math.random() - 0.48) * 10) }
  currentData.push(point)
  chart.appendDataPoint(point)
  setLog(`appendDataPoint({ date: "${point.date}", value: ${point.value.toFixed(2)} })`)
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
  const last = currentData[currentData.length - 1]
  if (last === undefined) return
  const nextDate = new Date(last.date)
  nextDate.setDate(nextDate.getDate() + 1)
  const batch = generateSeries(5, nextDate, parseFloat(last.value.toFixed(2)))
  currentData.push(...batch)
  chart.appendDataPoints(batch)
  setLog(`appendDataPoints([…${batch.length} points])`)
})

document.getElementById('btn-update')!.addEventListener('click', () => {
  // Simulate a live polling window: drop first 7 days, add 7 new ones
  currentData = slideWindow(currentData, 7)
  chart.updateData(currentData)
  setLog(`updateData([…${currentData.length} points, window shifted +7 days])`)
})

document.getElementById('btn-clear')!.addEventListener('click', () => {
  currentData = []
  chart.clearData()
  setLog('clearData() — skeleton shown again')
})

document.getElementById('btn-reload')!.addEventListener('click', () => {
  currentData = generateSeries(90)
  chart.setData(currentData)
  setLog('setData([…new 90-day series])')
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

// ---------------------------------------------------------------------------
// Animation settings
// ---------------------------------------------------------------------------

const animDurationInput = document.getElementById('anim-duration') as HTMLInputElement
const animSetDataSelect = document.getElementById('anim-set-data') as HTMLSelectElement
const animUpdateDataSelect = document.getElementById('anim-update-data') as HTMLSelectElement
const animAppendSelect = document.getElementById('anim-append') as HTMLSelectElement

import type { AnimationMode } from './lib/types.ts'

function syncAnimationSettings() {
  const duration = Math.max(0, parseInt(animDurationInput.value, 10) || 0)
  const setDataAnimation = animSetDataSelect.value as AnimationMode
  const updateDataAnimation = animUpdateDataSelect.value as AnimationMode
  const appendAnimation = animAppendSelect.value as AnimationMode
  chart.updateSettings({ animationDuration: duration, setDataAnimation, updateDataAnimation, appendAnimation })
  setLog(`updateSettings({ animationDuration: ${duration}, setDataAnimation: "${setDataAnimation}", updateDataAnimation: "${updateDataAnimation}", appendAnimation: "${appendAnimation}" })`)
}

const maxDataPointsInput = document.getElementById('max-data-points') as HTMLInputElement
maxDataPointsInput.addEventListener('change', () => {
  const raw = maxDataPointsInput.value.trim()
  const maxDataPoints = raw === '' ? null : Math.max(1, parseInt(raw, 10) || 1)
  chart.updateSettings({ maxDataPoints })
  setLog(`updateSettings({ maxDataPoints: ${maxDataPoints ?? 'null'} })`)
})

const edgeFadeWidthInput = document.getElementById('edge-fade-width') as HTMLInputElement
edgeFadeWidthInput.addEventListener('change', () => {
  const edgeFadeWidth = Math.max(0, parseInt(edgeFadeWidthInput.value, 10) || 0)
  chart.updateSettings({ edgeFadeWidth })
  setLog(`updateSettings({ edgeFadeWidth: ${edgeFadeWidth} })`)
})

animDurationInput.addEventListener('change', syncAnimationSettings)
animSetDataSelect.addEventListener('change', syncAnimationSettings)
animUpdateDataSelect.addEventListener('change', syncAnimationSettings)
animAppendSelect.addEventListener('change', syncAnimationSettings)
