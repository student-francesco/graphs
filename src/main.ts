import { createLineChart } from './lib/index.ts'
import type { RawDataPoint, AxisSettings, SeriesSettings, HorizontalAnnotationSettings, VerticalAnnotationSettings } from './lib/index.ts'
import type { AnimationMode, CurveType, EasingType } from './lib/types.ts'

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

/** Generate exponential/power-law data suitable for log-scale demo (values 0.1 → 10 000) */
function generateExpSeries(days: number, startDate = new Date('2024-01-01')): RawDataPoint[] {
  const points: RawDataPoint[] = []
  for (let i = 0; i < days; i++) {
    const date = new Date(startDate)
    date.setDate(startDate.getDate() + i)
    const value = 0.1 * Math.pow(10, (i / (days - 1)) * 5) * (0.8 + Math.random() * 0.4)
    points.push({ date: date.toISOString(), value })
  }
  return points
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
  appendAnimation: 'transition',
  maxDataPoints: 60,
})

const log = document.getElementById('log')!
function setLog(msg: string) { log.textContent = msg }

// Simulate an async API call (Blazor pattern: load data after first render)
let currentData: RawDataPoint[] = []

setTimeout(() => {
  currentData = generateSeries(500)
  seriesDataMap.set('default', currentData)
  chart.setData(currentData)
  setLog('Data loaded (500 points). Drag the Decimation slider to reduce rendered points.')
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

/** Iterate over every series with at least one point and apply `fn` to it. */
function forEachLiveSeries(fn: (id: string, data: RawDataPoint[]) => void): void {
  for (const [id, data] of seriesDataMap.entries()) {
    if (data.length > 0) fn(id, data)
  }
}

document.getElementById('btn-append')!.addEventListener('click', () => {
  let count = 0
  forEachLiveSeries((id, data) => {
    const last = data[data.length - 1]
    if (!last) return
    const nextDate = new Date(last.date)
    nextDate.setDate(nextDate.getDate() + 1)
    const point: RawDataPoint = {
      date: nextDate.toISOString(),
      value: Math.max(1, parseFloat(last.value.toFixed(2)) + (Math.random() - 0.48) * 10),
    }
    data.push(point)
    chart.appendSeriesDataPoint(id, point)
    count++
  })
  if (count > 0) setLog(`appendSeriesDataPoint(…) × ${count} series`)
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
  forEachLiveSeries((id, data) => {
    const last = data[data.length - 1]
    if (!last) return
    const nextDate = new Date(last.date)
    nextDate.setDate(nextDate.getDate() + 1)
    const batch = generateSeries(5, nextDate, parseFloat(last.value.toFixed(2)))
    data.push(...batch)
    chart.appendSeriesDataPoints(id, batch)
    count++
  })
  if (count > 0) setLog(`appendSeriesDataPoints(…, 5) × ${count} series`)
})

document.getElementById('btn-update')!.addEventListener('click', () => {
  let count = 0
  for (const [id, data] of seriesDataMap.entries()) {
    if (data.length === 0) continue
    const shifted = slideWindow(data, 7)
    seriesDataMap.set(id, shifted)
    if (id === 'default') currentData = shifted
    chart.updateSeriesData(id, shifted)
    count++
  }
  if (count > 0) setLog(`updateSeriesData(…, window +7d) × ${count} series`)
})

document.getElementById('btn-clear')!.addEventListener('click', () => {
  currentData = []
  // Reset every series, not just default — clearData wipes them all on the chart side.
  for (const id of seriesDataMap.keys()) seriesDataMap.set(id, [])
  chart.clearData()
  setLog('clearData() — skeleton shown again')
})

document.getElementById('btn-reload')!.addEventListener('click', () => {
  const payload: Record<string, RawDataPoint[]> = {}
  // Use the start value already associated with each series so reload feels stable per axis.
  const baseStart: Record<string, number> = { default: 100 }
  for (const id of seriesDataMap.keys()) {
    const start = baseStart[id] ?? 50 + Math.random() * 150
    const data = generateSeries(90, new Date('2024-01-01'), start)
    seriesDataMap.set(id, data)
    payload[id] = data
    if (id === 'default') currentData = data
  }
  chart.setData(payload)
  setLog(`setData({ ${Object.keys(payload).map(k => `${k}: […]`).join(', ')} })`)
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

// ---------------------------------------------------------------------------
// Animation settings
// ---------------------------------------------------------------------------

const curveTypeSelect = document.getElementById('curve-type') as HTMLSelectElement
curveTypeSelect.addEventListener('change', () => {
  const curveType = curveTypeSelect.value as CurveType
  chart.updateSettings({ curveType })
  setLog(`updateSettings({ curveType: "${curveType}" })`)
})

const animDurationInput = document.getElementById('anim-duration') as HTMLInputElement
const animSetDataSelect = document.getElementById('anim-set-data') as HTMLSelectElement
const animUpdateDataSelect = document.getElementById('anim-update-data') as HTMLSelectElement
const animAppendSelect = document.getElementById('anim-append') as HTMLSelectElement
const animEasingSelect = document.getElementById('anim-easing') as HTMLSelectElement

function syncAnimationSettings() {
  const duration = Math.max(0, parseInt(animDurationInput.value, 10) || 0)
  const setDataAnimation = animSetDataSelect.value as AnimationMode
  const updateDataAnimation = animUpdateDataSelect.value as AnimationMode
  const appendAnimation = animAppendSelect.value as AnimationMode
  const easingType = animEasingSelect.value as EasingType
  chart.updateSettings({ animationDuration: duration, setDataAnimation, updateDataAnimation, appendAnimation, easingType })
  setLog(`updateSettings({ animationDuration: ${duration}, setDataAnimation: "${setDataAnimation}", updateDataAnimation: "${updateDataAnimation}", appendAnimation: "${appendAnimation}", easingType: "${easingType}" })`)
}

const maxDataPointsInput = document.getElementById('max-data-points') as HTMLInputElement
maxDataPointsInput.addEventListener('change', () => {
  const raw = maxDataPointsInput.value.trim()
  const maxDataPoints = raw === '' ? null : Math.max(1, parseInt(raw, 10) || 1)
  chart.updateSettings({ maxDataPoints })
  setLog(`updateSettings({ maxDataPoints: ${maxDataPoints ?? 'null'} })`)
})

animDurationInput.addEventListener('change', syncAnimationSettings)
animSetDataSelect.addEventListener('change', syncAnimationSettings)
animUpdateDataSelect.addEventListener('change', syncAnimationSettings)
animAppendSelect.addEventListener('change', syncAnimationSettings)
animEasingSelect.addEventListener('change', syncAnimationSettings)

// ---------------------------------------------------------------------------
// Multi-series controls
// ---------------------------------------------------------------------------

const seriesSelect   = document.getElementById('series-select')    as HTMLSelectElement
const seriesColor    = document.getElementById('series-color')      as HTMLInputElement
const seriesWeight   = document.getElementById('series-weight')     as HTMLInputElement
const btnAddSeries   = document.getElementById('btn-add-series')!
const btnRemoveSeries = document.getElementById('btn-remove-series')!
const btnSeriesLoad  = document.getElementById('btn-series-load')!
const btnSeriesAppend = document.getElementById('btn-series-append')!
const btnSeriesAutoAppend = document.getElementById('btn-series-auto-append')!
const btnLoadMulti   = document.getElementById('btn-load-multi')!

// Per-series data store for append operations
const seriesDataMap = new Map<string, RawDataPoint[]>([['default', currentData]])

// Palette matching the one used by the library for visual consistency
const PALETTE = ['#e11d48','#0891b2','#16a34a','#d97706','#7c3aed','#db2777','#0284c7','#4f46e5']
let paletteIndex = 0
let seriesCounter = 1

function activeSeriesId(): string { return seriesSelect.value }

function addSeriesOption(id: string): void {
  const opt = document.createElement('option')
  opt.value = id
  opt.textContent = id
  seriesSelect.appendChild(opt)
  seriesSelect.value = id
  syncSeriesControls()
}

function syncSeriesControls(): void {
  const id = activeSeriesId()
  btnRemoveSeries.toggleAttribute('disabled', id === 'default')
  // Reflect current color swatch from palette (best-effort — we track it ourselves)
  const stored = seriesColorMap.get(id)
  if (stored) seriesColor.value = stored
}

const seriesColorMap = new Map<string, string>([['default', '#4f46e5']])

seriesSelect.addEventListener('change', syncSeriesControls)

seriesColor.addEventListener('input', () => {
  const id = activeSeriesId()
  seriesColorMap.set(id, seriesColor.value)
  chart.setSeriesColor(id, seriesColor.value)
  setLog(`setSeriesColor("${id}", "${seriesColor.value}")`)
})

seriesWeight.addEventListener('change', () => {
  const id = activeSeriesId()
  const w = Math.max(0.5, parseFloat(seriesWeight.value) || 2)
  chart.setSeriesWeight(id, w)
  setLog(`setSeriesWeight("${id}", ${w})`)
})

btnAddSeries.addEventListener('click', () => {
  const id = `s${++seriesCounter}`
  const color = PALETTE[paletteIndex++ % PALETTE.length]
  seriesColorMap.set(id, color)
  chart.addSeries(id, { color })
  addSeriesOption(id)
  setLog(`addSeries("${id}", { color: "${color}" })`)
})

btnRemoveSeries.addEventListener('click', () => {
  const id = activeSeriesId()
  if (id === 'default') return
  chart.removeSeries(id)
  seriesDataMap.delete(id)
  seriesColorMap.delete(id)
  seriesSelect.querySelector(`option[value="${id}"]`)?.remove()
  seriesSelect.value = 'default'
  syncSeriesControls()
  setLog(`removeSeries("${id}")`)
})

btnSeriesLoad.addEventListener('click', () => {
  const id = activeSeriesId()
  const data = generateSeries(90)
  seriesDataMap.set(id, data)
  chart.setSeriesData(id, data)
  setLog(`setSeriesData("${id}", […90 points])`)
})

btnSeriesAppend.addEventListener('click', () => {
  const id = activeSeriesId()
  const data = seriesDataMap.get(id) ?? []
  const last = data[data.length - 1]
  if (!last) { setLog(`No data on series "${id}" — load data first`); return }
  const nextDate = new Date(last.date)
  nextDate.setDate(nextDate.getDate() + 1)
  const point: RawDataPoint = {
    date: nextDate.toISOString(),
    value: Math.max(1, parseFloat(last.value.toFixed(2)) + (Math.random() - 0.48) * 10),
  }
  data.push(point)
  chart.appendSeriesDataPoint(id, point)
  setLog(`appendSeriesDataPoint("${id}", { date: "${point.date}", value: ${point.value.toFixed(2)} })`)
})

let seriesAutoTimer: ReturnType<typeof setInterval> | null = null
btnSeriesAutoAppend.addEventListener('click', () => {
  if (seriesAutoTimer !== null) {
    clearInterval(seriesAutoTimer)
    seriesAutoTimer = null
    btnSeriesAutoAppend.textContent = 'Auto'
    btnSeriesAutoAppend.classList.remove('active')
    setLog('Series auto-append stopped.')
  } else {
    seriesAutoTimer = setInterval(() => btnSeriesAppend.click(), 250)
    btnSeriesAutoAppend.textContent = 'Stop'
    btnSeriesAutoAppend.classList.add('active')
    setLog(`Series auto-append running on "${activeSeriesId()}" every 250 ms…`)
  }
})

btnLoadMulti.addEventListener('click', () => {
  const a = generateSeries(90, new Date('2024-01-01'), 100)
  const b = generateSeries(90, new Date('2024-01-01'), 60)
  const c = generateSeries(90, new Date('2024-01-01'), 160)
  seriesDataMap.set('default', a)
  seriesDataMap.set('b', b)
  seriesDataMap.set('c', c)

  // Ensure series b and c exist in the select
  for (const id of ['b', 'c']) {
    if (!seriesSelect.querySelector(`option[value="${id}"]`)) {
      const color = PALETTE[paletteIndex++ % PALETTE.length]
      seriesColorMap.set(id, color)
      addSeriesOption(id)
    }
  }

  chart.setData({ default: a, b, c })
  setLog('setData({ default: […], b: […], c: […] })')
})

// ---------------------------------------------------------------------------
// Multi-axis controls
// ---------------------------------------------------------------------------

const axisSelect       = document.getElementById('axis-select')      as HTMLSelectElement
const axisName         = document.getElementById('axis-name')        as HTMLInputElement
const axisColor        = document.getElementById('axis-color')       as HTMLInputElement
const axisUseRange     = document.getElementById('axis-use-range')   as HTMLInputElement
const axisRangeMin     = document.getElementById('axis-range-min')   as HTMLInputElement
const axisRangeMax     = document.getElementById('axis-range-max')   as HTMLInputElement
const axisUseLimits    = document.getElementById('axis-use-limits')  as HTMLInputElement
const axisLimitsMin    = document.getElementById('axis-limits-min')  as HTMLInputElement
const axisLimitsMax    = document.getElementById('axis-limits-max')  as HTMLInputElement
const btnCreateAxis    = document.getElementById('btn-create-axis')!
const btnRemoveAxis    = document.getElementById('btn-remove-axis')!
const btnAssociate     = document.getElementById('btn-associate-series')!

interface AxisRecord {
  name: string
  color: string
  range?: [number, number]
  limits?: [number, number]
}

const axisRecords = new Map<string, AxisRecord>([
  ['default', { name: 'default', color: '#4f46e5' }],
])

function activeAxisId(): string { return axisSelect.value }

function syncAxisInputs(): void {
  const rec = axisRecords.get(activeAxisId())
  if (!rec) return
  axisName.value = rec.name
  axisColor.value = rec.color
  axisUseRange.checked = rec.range !== undefined
  axisRangeMin.value = rec.range ? String(rec.range[0]) : ''
  axisRangeMax.value = rec.range ? String(rec.range[1]) : ''
  axisUseLimits.checked = rec.limits !== undefined
  axisLimitsMin.value = rec.limits ? String(rec.limits[0]) : ''
  axisLimitsMax.value = rec.limits ? String(rec.limits[1]) : ''
}

axisSelect.addEventListener('change', syncAxisInputs)

function readAxisInputsAsOptions(): AxisSettings {
  const opts: AxisSettings = {
    name: axisName.value.trim() || activeAxisId(),
    color: axisColor.value,
  }
  if (axisUseRange.checked) {
    const lo = parseFloat(axisRangeMin.value)
    const hi = parseFloat(axisRangeMax.value)
    if (!isNaN(lo) && !isNaN(hi)) opts.range = [lo, hi]
  }
  if (axisUseLimits.checked) {
    const lo = parseFloat(axisLimitsMin.value)
    const hi = parseFloat(axisLimitsMax.value)
    if (!isNaN(lo) && !isNaN(hi)) opts.limits = [lo, hi]
  }
  return opts
}

btnCreateAxis.addEventListener('click', () => {
  const id = activeAxisId()
  const opts = readAxisInputsAsOptions()
  chart.createAxis(id, opts)
  axisRecords.set(id, {
    name: opts.name ?? id,
    color: opts.color ?? '#4f46e5',
    ...(opts.range ? { range: opts.range } : {}),
    ...(opts.limits ? { limits: opts.limits } : {}),
  })
  setLog(`createAxis("${id}", ${JSON.stringify(opts)})`)
})

btnRemoveAxis.addEventListener('click', () => {
  const id = activeAxisId()
  if (axisSelect.options.length <= 1) {
    setLog(`removeAxis("${id}") — no-op (last remaining axis)`)
    return
  }
  chart.removeAxis(id)
  axisRecords.delete(id)
  axisSelect.querySelector(`option[value="${id}"]`)?.remove()
  axisSelect.value = axisSelect.options[0]?.value ?? ''
  syncAxisInputs()
  setLog(`removeAxis("${id}")`)
})

btnAssociate.addEventListener('click', () => {
  const seriesId = activeSeriesId()
  const axisId = activeAxisId()
  chart.associateSeries(seriesId, axisId)
  setLog(`associateSeries("${seriesId}", "${axisId}")`)
})

// Provide a quick way to create a new axis: typing a fresh name into the Name
// input and clicking Create / Update will register it under that id.
axisName.addEventListener('change', () => {
  const newId = axisName.value.trim()
  if (!newId || axisSelect.querySelector(`option[value="${newId}"]`)) return
  const opt = document.createElement('option')
  opt.value = newId
  opt.textContent = newId
  axisSelect.appendChild(opt)
  axisSelect.value = newId
  axisRecords.set(newId, { name: newId, color: axisColor.value })
  setLog(`(axis id queued — click Create / Update to register "${newId}")`)
})

syncAxisInputs()

// ---------------------------------------------------------------------------
// Labels controls
// ---------------------------------------------------------------------------

const chartTitleInput = document.getElementById('chart-title') as HTMLInputElement
const xLabelInput     = document.getElementById('x-label')     as HTMLInputElement
const yLabelInput     = document.getElementById('y-label')     as HTMLInputElement

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

// ---------------------------------------------------------------------------
// Y-scale type toggle
// ---------------------------------------------------------------------------

let yScaleType: 'linear' | 'log' = 'linear'
const btnYScaleToggle = document.getElementById('btn-y-scale-toggle')!

btnYScaleToggle.addEventListener('click', () => {
  yScaleType = yScaleType === 'linear' ? 'log' : 'linear'
  btnYScaleToggle.textContent = `Y scale: ${yScaleType}`
  chart.updateSettings({ yScaleType })
  setLog(`updateSettings({ yScaleType: "${yScaleType}" })`)
})

document.getElementById('btn-load-exp')!.addEventListener('click', () => {
  const data = generateExpSeries(60)
  seriesDataMap.set('default', data)
  currentData = data
  chart.setData(data)
  setLog('setData(exponential data — good for log scale)')
})

// ---------------------------------------------------------------------------
// Smoothing controls
// ---------------------------------------------------------------------------

const smoothingSlider = document.getElementById('smoothing-window') as HTMLInputElement
const smoothingDisplay = document.getElementById('smoothing-display')!

smoothingSlider.addEventListener('input', () => {
  const smoothing = parseInt(smoothingSlider.value, 10)
  smoothingDisplay.textContent = smoothing === 0 ? 'off' : String(smoothing)
  chart.updateSettings({ smoothing })
  setLog(`updateSettings({ smoothing: ${smoothing} })`)
})

// ---------------------------------------------------------------------------
// Pan / zoom — all handled by d3 inside the library; harness only resets it.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// PDF export
// ---------------------------------------------------------------------------

document.getElementById('btn-save-pdf')!.addEventListener('click', () => {
  chart.saveToPdf('chart')
  setLog('saveToPdf("chart")')
})

// ---------------------------------------------------------------------------
// Decimation controls
// ---------------------------------------------------------------------------

const decimationSlider = document.getElementById('decimation-threshold') as HTMLInputElement
const decimationDisplay = document.getElementById('decimation-display')!

decimationSlider.addEventListener('input', () => {
  const decimation = parseInt(decimationSlider.value, 10)
  decimationDisplay.textContent = decimation === 0 ? 'off' : String(decimation)
  chart.updateSettings({ decimation })
  setLog(`updateSettings({ decimation: ${decimation} })`)
})

// ---------------------------------------------------------------------------
// updateSeriesSettings
// ---------------------------------------------------------------------------

const seriesDotRadiusInput  = document.getElementById('series-dot-radius')  as HTMLInputElement
const seriesCurveSelect     = document.getElementById('series-curve')        as HTMLSelectElement
const seriesSmoothingInput  = document.getElementById('series-smoothing')    as HTMLInputElement
const seriesDecimationInput = document.getElementById('series-decimation')   as HTMLInputElement
const seriesShowLabels      = document.getElementById('series-show-labels')  as HTMLInputElement
const seriesDotBorderInput  = document.getElementById('series-dot-border')   as HTMLInputElement

document.getElementById('btn-update-series-settings')!.addEventListener('click', () => {
  const id = activeSeriesId()
  const settings: Partial<SeriesSettings> = {}
  const dotRadiusVal = seriesDotRadiusInput.value
  if (dotRadiusVal !== '') settings.dotRadius = parseFloat(dotRadiusVal)
  const curveVal = seriesCurveSelect.value
  if (curveVal !== '') settings.curveType = curveVal as CurveType
  const smoothingVal = seriesSmoothingInput.value
  if (smoothingVal !== '') settings.smoothing = parseInt(smoothingVal, 10)
  const decimationVal = seriesDecimationInput.value
  if (decimationVal !== '') settings.decimation = parseInt(decimationVal, 10)
  settings.showLabels = seriesShowLabels.checked
  chart.updateSeriesSettings(id, settings)
  setLog(`updateSeriesSettings("${id}", ${JSON.stringify(settings)})`)
})

document.getElementById('btn-series-dot-border-clear')!.addEventListener('click', () => {
  const id = activeSeriesId()
  chart.updateSeriesSettings(id, { dotBorderColor: null })
  setLog(`updateSeriesSettings("${id}", { dotBorderColor: null })`)
})

seriesDotBorderInput.addEventListener('input', () => {
  const id = activeSeriesId()
  chart.updateSeriesSettings(id, { dotBorderColor: seriesDotBorderInput.value })
  setLog(`updateSeriesSettings("${id}", { dotBorderColor: "${seriesDotBorderInput.value}" })`)
})

document.getElementById('btn-reset-series-settings')!.addEventListener('click', () => {
  const id = activeSeriesId()
  chart.updateSeriesSettings(id, {
    dotRadius: undefined, curveType: undefined, smoothing: undefined,
    decimation: undefined, showLabels: undefined, dotBorderColor: undefined,
  })
  setLog(`updateSeriesSettings("${id}", { all: undefined }) — reset to chart defaults`)
})

// ---------------------------------------------------------------------------
// updateAxisSettings
// ---------------------------------------------------------------------------

const axisScaleTypeSelect      = document.getElementById('axis-scale-type')         as HTMLSelectElement
const axisShowGridCb           = document.getElementById('axis-show-grid')           as HTMLInputElement
const axisGridColorInput       = document.getElementById('axis-grid-color')          as HTMLInputElement
const axisGridOpacitySlider    = document.getElementById('axis-grid-opacity')        as HTMLInputElement
const axisGridOpacityDisplay   = document.getElementById('axis-grid-opacity-display')!

axisGridOpacitySlider.addEventListener('input', () => {
  axisGridOpacityDisplay.textContent = parseFloat(axisGridOpacitySlider.value).toFixed(2)
})

document.getElementById('btn-update-axis-settings')!.addEventListener('click', () => {
  const id = activeAxisId()
  const settings: Partial<AxisSettings> = {
    showGrid: axisShowGridCb.checked,
    gridColor: axisGridColorInput.value,
    gridOpacity: parseFloat(axisGridOpacitySlider.value),
  }
  const scaleVal = axisScaleTypeSelect.value
  if (scaleVal !== '') settings.scaleType = scaleVal as 'linear' | 'log'
  chart.updateAxisSettings(id, settings)
  setLog(`updateAxisSettings("${id}", ${JSON.stringify(settings)})`)
})

document.getElementById('btn-reset-axis-settings')!.addEventListener('click', () => {
  const id = activeAxisId()
  chart.updateAxisSettings(id, {
    scaleType: undefined, showGrid: undefined, gridColor: undefined, gridOpacity: undefined,
  })
  setLog(`updateAxisSettings("${id}", { all: undefined }) — reset to chart defaults`)
})

// ---------------------------------------------------------------------------
// Annotation controls
// ---------------------------------------------------------------------------

const annoName      = document.getElementById('anno-name')      as HTMLInputElement
const annoType      = document.getElementById('anno-type')      as HTMLSelectElement
const annoYInput    = document.getElementById('anno-y')          as HTMLInputElement
const annoXInput    = document.getElementById('anno-x')          as HTMLInputElement
const annoAxis      = document.getElementById('anno-axis')      as HTMLSelectElement
const annoLabel     = document.getElementById('anno-label')      as HTMLInputElement
const annoColor     = document.getElementById('anno-color')      as HTMLInputElement
const annoThickness = document.getElementById('anno-thickness')  as HTMLInputElement
const annoDashed    = document.getElementById('anno-dashed')     as HTMLInputElement
let annoCounter = 1

function syncAnnoTypeVisibility(): void {
  const isHorizontal = annoType.value === 'horizontal'
  ;(annoYInput.parentElement as HTMLElement).style.display = isHorizontal ? '' : 'none'
  ;(annoXInput.parentElement as HTMLElement).style.display = isHorizontal ? 'none' : ''
  ;(annoAxis.parentElement as HTMLElement).style.display   = isHorizontal ? '' : 'none'
}

function syncAnnoAxisOptions(): void {
  const current = annoAxis.value
  annoAxis.innerHTML = ''
  for (const id of axisRecords.keys()) {
    const opt = document.createElement('option')
    opt.value = id
    opt.textContent = id
    annoAxis.appendChild(opt)
  }
  if (axisRecords.has(current)) annoAxis.value = current
}

annoType.addEventListener('change', syncAnnoTypeVisibility)
// Refresh the axis dropdown after any axis-tab action that could have added/removed axes.
for (const btnId of ['btn-create-axis', 'btn-remove-axis']) {
  document.getElementById(btnId)!.addEventListener('click', () => setTimeout(syncAnnoAxisOptions, 0))
}
syncAnnoTypeVisibility()
syncAnnoAxisOptions()

document.getElementById('btn-anno-add')!.addEventListener('click', () => {
  const name = annoName.value.trim() || `anno-${annoCounter}`
  const label = annoLabel.value
  if (annoType.value === 'horizontal') {
    const y = parseFloat(annoYInput.value)
    if (isNaN(y)) { setLog('Annotation: Y value required for horizontal'); return }
    const settings: HorizontalAnnotationSettings = {
      axis: annoAxis.value,
      color: annoColor.value,
      thickness: parseFloat(annoThickness.value) || 1.5,
      dashed: annoDashed.checked,
    }
    chart.setHorizontalLine(name, y, label, settings)
    setLog(`setHorizontalLine("${name}", ${y}, "${label}", ${JSON.stringify(settings)})`)
  } else {
    const x = annoXInput.value.trim()
    if (!x) { setLog('Annotation: X (ISO date) required for vertical'); return }
    const settings: VerticalAnnotationSettings = {
      color: annoColor.value,
      thickness: parseFloat(annoThickness.value) || 1.5,
      dashed: annoDashed.checked,
    }
    chart.setVerticalLine(name, x, label, settings)
    setLog(`setVerticalLine("${name}", "${x}", "${label}", ${JSON.stringify(settings)})`)
  }
  annoCounter++
  annoName.value = `anno-${annoCounter}`
})

document.getElementById('btn-anno-remove')!.addEventListener('click', () => {
  const name = annoName.value.trim()
  if (!name) return
  chart.removeAnnotation(name)
  setLog(`removeAnnotation("${name}")`)
})

document.getElementById('btn-anno-clear')!.addEventListener('click', () => {
  chart.clearAnnotations()
  setLog('clearAnnotations()')
})

// ── Snapshot tab ───────────────────────────────────────────────────────────
const snapshotJson = document.getElementById('snapshot-json') as HTMLTextAreaElement

document.getElementById('btn-snapshot-capture')!.addEventListener('click', () => {
  const snap = chart.getSnapshot()
  snapshotJson.value = JSON.stringify(snap, null, 2)
  setLog(`getSnapshot() — ${snap.series.length} series, ${snap.axes.length} axes, ${snap.annotations.length} annotations`)
})

document.getElementById('btn-snapshot-restore')!.addEventListener('click', () => {
  const raw = snapshotJson.value.trim()
  if (!raw) { setLog('Snapshot: textarea is empty — click Capture first or paste JSON'); return }
  try {
    const snap = JSON.parse(raw)
    chart.restoreSnapshot(snap)
    syncAnnoAxisOptions()
    setLog(`restoreSnapshot(…) — ${snap.series?.length ?? 0} series, ${snap.axes?.length ?? 0} axes, ${snap.annotations?.length ?? 0} annotations`)
  } catch (e) {
    setLog(`Snapshot: ${(e as Error).message}`)
  }
})

document.getElementById('btn-snapshot-wipe')!.addEventListener('click', () => {
  chart.clearAnnotations()
  chart.clearData()
  setLog('Wiped chart — clearAnnotations() + clearData(). Click Restore to rebuild.')
})
