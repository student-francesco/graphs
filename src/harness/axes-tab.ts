import type { AxisSettings } from '@/lib/index.ts'
import type { Harness } from './state.ts'

/** Axes tab: create/remove/associate axes, updateAxisSettings. */
export function initAxesTab(h: Harness): void {
  const { chart, setLog } = h

  const axisSelect = document.getElementById('axis-select') as HTMLSelectElement
  const axisName = document.getElementById('axis-name') as HTMLInputElement
  const axisUnit = document.getElementById('axis-unit') as HTMLInputElement
  const axisColor = document.getElementById('axis-color') as HTMLInputElement
  const axisUseRange = document.getElementById('axis-use-range') as HTMLInputElement
  const axisRangeMin = document.getElementById('axis-range-min') as HTMLInputElement
  const axisRangeMax = document.getElementById('axis-range-max') as HTMLInputElement
  const axisUseLimits = document.getElementById('axis-use-limits') as HTMLInputElement
  const axisLimitsMin = document.getElementById('axis-limits-min') as HTMLInputElement
  const axisLimitsMax = document.getElementById('axis-limits-max') as HTMLInputElement
  const btnCreateAxis = document.getElementById('btn-create-axis')!
  const btnRemoveAxis = document.getElementById('btn-remove-axis')!
  const btnAssociate = document.getElementById('btn-associate-series')!

  function syncAxisInputs(): void {
    const rec = h.axisRecords.get(h.activeAxisId())
    if (!rec) return
    axisName.value = rec.name
    axisUnit.value = rec.unitLabel ?? ''
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
      name: axisName.value.trim() || h.activeAxisId(),
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
    const id = h.activeAxisId()
    const opts = readAxisInputsAsOptions()
    chart.createAxis(id, opts)
    h.axisRecords.set(id, {
      name: opts.name ?? id,
      color: opts.color ?? '#4f46e5',
      ...(opts.range ? { range: opts.range } : {}),
      ...(opts.limits ? { limits: opts.limits } : {}),
    })
    setLog(`createAxis("${id}", ${JSON.stringify(opts)})`)
  })

  btnRemoveAxis.addEventListener('click', () => {
    const id = h.activeAxisId()
    if (axisSelect.options.length <= 1) {
      setLog(`removeAxis("${id}") — no-op (last remaining axis)`)
      return
    }
    chart.removeAxis(id)
    h.axisRecords.delete(id)
    axisSelect.querySelector(`option[value="${id}"]`)?.remove()
    axisSelect.value = axisSelect.options[0]?.value ?? ''
    syncAxisInputs()
    setLog(`removeAxis("${id}")`)
  })

  btnAssociate.addEventListener('click', () => {
    const seriesId = h.activeSeriesId()
    const axisId = h.activeAxisId()
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
    h.axisRecords.set(newId, { name: newId, color: axisColor.value })
    setLog(`(axis id queued — click Create / Update to register "${newId}")`)
  })

  axisUnit.addEventListener('change', () => {
    const id = h.activeAxisId()
    chart.updateAxisSettings(id, { unitLabel: axisUnit.value })
    setLog(`updateAxisSettings("${id}", { unitLabel: "${axisUnit.value}" })`)
  })

  syncAxisInputs()

  // ---- updateAxisSettings ----

  const axisScaleTypeSelect = document.getElementById('axis-scale-type') as HTMLSelectElement
  const axisShowGridCb = document.getElementById('axis-show-grid') as HTMLInputElement
  const axisGridColorInput = document.getElementById('axis-grid-color') as HTMLInputElement
  const axisGridOpacitySlider = document.getElementById('axis-grid-opacity') as HTMLInputElement
  const axisGridOpacityDisplay = document.getElementById('axis-grid-opacity-display')!

  axisGridOpacitySlider.addEventListener('input', () => {
    axisGridOpacityDisplay.textContent = parseFloat(axisGridOpacitySlider.value).toFixed(2)
  })

  document.getElementById('btn-update-axis-settings')!.addEventListener('click', () => {
    const id = h.activeAxisId()
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
    const id = h.activeAxisId()
    chart.updateAxisSettings(id, {
      scaleType: undefined,
      showGrid: undefined,
      gridColor: undefined,
      gridOpacity: undefined,
    })
    setLog(`updateAxisSettings("${id}", { all: undefined }) — reset to chart defaults`)
  })
}
