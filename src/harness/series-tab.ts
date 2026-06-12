import type { CurveType, RawDataPoint, SeriesSettings } from '../lib/index.ts'
import { generateSeries } from './data.ts'
import { PALETTE, type Harness } from './state.ts'

/** Series tab: add/remove/load/append per series, fast paths, updateSeriesSettings. */
export function initSeriesTab(h: Harness): void {
  const { chart, setLog } = h

  const seriesSelect = document.getElementById('series-select') as HTMLSelectElement
  const seriesColor = document.getElementById('series-color') as HTMLInputElement
  const seriesWeight = document.getElementById('series-weight') as HTMLInputElement
  const btnAddSeries = document.getElementById('btn-add-series')!
  const btnRemoveSeries = document.getElementById('btn-remove-series')!
  const btnSeriesLoad = document.getElementById('btn-series-load')!
  const btnSeriesAppend = document.getElementById('btn-series-append')!
  const btnSeriesAutoAppend = document.getElementById('btn-series-auto-append')!
  const btnLoadMulti = document.getElementById('btn-load-multi')!

  let paletteIndex = 0
  let seriesCounter = 1

  function addSeriesOption(id: string): void {
    const opt = document.createElement('option')
    opt.value = id
    opt.textContent = id
    seriesSelect.appendChild(opt)
    seriesSelect.value = id
    syncSeriesControls()
  }

  function syncSeriesControls(): void {
    const id = h.activeSeriesId()
    btnRemoveSeries.toggleAttribute('disabled', id === 'default')
    // Reflect current color swatch from palette (best-effort — we track it ourselves)
    const stored = h.seriesColorMap.get(id)
    if (stored) seriesColor.value = stored
  }

  seriesSelect.addEventListener('change', syncSeriesControls)

  seriesColor.addEventListener('input', () => {
    const id = h.activeSeriesId()
    h.seriesColorMap.set(id, seriesColor.value)
    chart.setSeriesColor(id, seriesColor.value)
    setLog(`setSeriesColor("${id}", "${seriesColor.value}")`)
  })

  seriesWeight.addEventListener('change', () => {
    const id = h.activeSeriesId()
    const w = Math.max(0.5, parseFloat(seriesWeight.value) || 2)
    chart.setSeriesWeight(id, w)
    setLog(`setSeriesWeight("${id}", ${w})`)
  })

  btnAddSeries.addEventListener('click', () => {
    const id = `s${++seriesCounter}`
    const color = PALETTE[paletteIndex++ % PALETTE.length]!
    h.seriesColorMap.set(id, color)
    chart.addSeries(id, { color })
    addSeriesOption(id)
    setLog(`addSeries("${id}", { color: "${color}" })`)
  })

  btnRemoveSeries.addEventListener('click', () => {
    const id = h.activeSeriesId()
    if (id === 'default') return
    chart.removeSeries(id)
    h.seriesDataMap.delete(id)
    h.seriesColorMap.delete(id)
    seriesSelect.querySelector(`option[value="${id}"]`)?.remove()
    seriesSelect.value = 'default'
    syncSeriesControls()
    setLog(`removeSeries("${id}")`)
  })

  btnSeriesLoad.addEventListener('click', () => {
    const id = h.activeSeriesId()
    const data = generateSeries(90)
    h.seriesDataMap.set(id, data)
    chart.setSeriesData(id, data)
    setLog(`setSeriesData("${id}", […90 points])`)
  })

  btnSeriesAppend.addEventListener('click', () => {
    const id = h.activeSeriesId()
    const data = h.seriesDataMap.get(id) ?? []
    const last = data[data.length - 1]
    if (!last) {
      setLog(`No data on series "${id}" — load data first`)
      return
    }
    const nextDate = new Date(last.date)
    nextDate.setDate(nextDate.getDate() + 1)
    const point: RawDataPoint = {
      date: nextDate.toISOString(),
      value: Math.max(1, parseFloat(last.value.toFixed(2)) + (Math.random() - 0.48) * 10),
    }
    data.push(point)
    chart.appendSeriesDataPoint(id, point)
    setLog(
      `appendSeriesDataPoint("${id}", { date: "${point.date}", value: ${point.value.toFixed(2)} })`,
    )
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
      seriesAutoTimer = setInterval(() => (btnSeriesAppend as HTMLButtonElement).click(), 250)
      btnSeriesAutoAppend.textContent = 'Stop'
      btnSeriesAutoAppend.classList.add('active')
      setLog(`Series auto-append running on "${h.activeSeriesId()}" every 250 ms…`)
    }
  })

  btnLoadMulti.addEventListener('click', () => {
    const a = generateSeries(90, new Date('2024-01-01'), 100)
    const b = generateSeries(90, new Date('2024-01-01'), 60)
    const c = generateSeries(90, new Date('2024-01-01'), 160)
    h.seriesDataMap.set('default', a)
    h.seriesDataMap.set('b', b)
    h.seriesDataMap.set('c', c)

    // Ensure series b and c exist in the select
    for (const id of ['b', 'c']) {
      if (!seriesSelect.querySelector(`option[value="${id}"]`)) {
        const color = PALETTE[paletteIndex++ % PALETTE.length]!
        h.seriesColorMap.set(id, color)
        addSeriesOption(id)
      }
    }

    chart.setData({ default: a, b, c })
    setLog('setData({ default: […], b: […], c: […] })')
  })

  // ---- updateSeriesSettings ----

  const seriesDotRadiusInput = document.getElementById('series-dot-radius') as HTMLInputElement
  const seriesCurveSelect = document.getElementById('series-curve') as HTMLSelectElement
  const seriesSmoothingInput = document.getElementById('series-smoothing') as HTMLInputElement
  const seriesDecimationInput = document.getElementById('series-decimation') as HTMLInputElement
  const seriesShowLabels = document.getElementById('series-show-labels') as HTMLInputElement
  const seriesDotBorderInput = document.getElementById('series-dot-border') as HTMLInputElement

  document.getElementById('btn-update-series-settings')!.addEventListener('click', () => {
    const id = h.activeSeriesId()
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
    const id = h.activeSeriesId()
    chart.updateSeriesSettings(id, { dotBorderColor: null })
    setLog(`updateSeriesSettings("${id}", { dotBorderColor: null })`)
  })

  seriesDotBorderInput.addEventListener('input', () => {
    const id = h.activeSeriesId()
    chart.updateSeriesSettings(id, { dotBorderColor: seriesDotBorderInput.value })
    setLog(`updateSeriesSettings("${id}", { dotBorderColor: "${seriesDotBorderInput.value}" })`)
  })

  document.getElementById('btn-reset-series-settings')!.addEventListener('click', () => {
    const id = h.activeSeriesId()
    chart.updateSeriesSettings(id, {
      dotRadius: undefined,
      curveType: undefined,
      smoothing: undefined,
      decimation: undefined,
      showLabels: undefined,
      dotBorderColor: undefined,
    })
    setLog(`updateSeriesSettings("${id}", { all: undefined }) — reset to chart defaults`)
  })
}
