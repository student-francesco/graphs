import { DEFAULT_PIE_SETTINGS } from '@/lib/index.ts'
import type { PieSlice, SliceLabelContent } from '@/lib/index.ts'
import type { PieHarness } from './state.ts'

/** Demo data: leak sources found in a plant survey. */
export const PIE_SAMPLE: readonly PieSlice[] = [
  { label: 'Valves', value: 34 },
  { label: 'Fittings', value: 26 },
  { label: 'Seals', value: 18 },
  { label: 'Welds', value: 12 },
  { label: 'Flanges', value: 7 },
  { label: 'Other', value: 3 },
]

const PALETTES: Record<string, string[]> = {
  pastel: ['#fda4af', '#93c5fd', '#86efac', '#fcd34d', '#c4b5fd', '#f9a8d4', '#67e8f9', '#fdba74'],
  ocean: ['#0c4a6e', '#075985', '#0369a1', '#0284c7', '#0ea5e9', '#38bdf8', '#7dd3fc', '#bae6fd'],
  mono: ['#111827', '#374151', '#4b5563', '#6b7280', '#9ca3af', '#d1d5db'],
}

const fmtSlices = (slices: readonly PieSlice[]): string =>
  `[${slices.map(s => `{ label: "${s.label}", value: ${s.value} }`).join(', ')}]`

/**
 * Pie tab: data lifecycle (sweep-in, morph, add/remove, clear), per-slice colours,
 * palette, slice border, donut ratio, slice text labels, tooltip and theme.
 * Every control logs the equivalent API call.
 */
export function initPieTab(h: PieHarness): { loadSample(): void } {
  const { chart, setLog } = h
  const container = document.getElementById('chart-container')!
  let slices: PieSlice[] = []
  let nextSlice = 1

  const sliceSelect = document.getElementById('pie-slice-select') as HTMLSelectElement
  const syncSliceSelect = (): void => {
    const current = sliceSelect.value
    sliceSelect.innerHTML = ''
    for (const s of slices) sliceSelect.add(new Option(s.label, s.label))
    if (slices.some(s => s.label === current)) sliceSelect.value = current
  }

  const apply = (next: PieSlice[], method: 'setData' | 'updateData'): void => {
    slices = next
    chart[method](slices)
    syncSliceSelect()
    setLog(`${method}(${fmtSlices(slices)})`)
  }

  const loadSample = (): void => apply(PIE_SAMPLE.map(s => ({ ...s })), 'setData')

  // ── Data ──────────────────────────────────────────────────────────────────
  document.getElementById('btn-pie-load')!.addEventListener('click', loadSample)

  document.getElementById('btn-pie-randomize')!.addEventListener('click', () => {
    apply(
      slices.map(s => ({ ...s, value: Math.max(1, Math.round(s.value * (0.4 + Math.random() * 1.2))) })),
      'updateData',
    )
  })

  document.getElementById('btn-pie-add')!.addEventListener('click', () => {
    let label = `Slice ${nextSlice++}`
    while (slices.some(s => s.label === label)) label = `Slice ${nextSlice++}`
    apply([...slices, { label, value: 5 + Math.round(Math.random() * 25) }], 'updateData')
  })

  document.getElementById('btn-pie-remove')!.addEventListener('click', () => {
    if (slices.length === 0) return
    const victim = sliceSelect.value || slices[slices.length - 1]!.label
    apply(slices.filter(s => s.label !== victim), 'updateData')
  })

  document.getElementById('btn-pie-clear')!.addEventListener('click', () => {
    slices = []
    chart.clearData()
    syncSliceSelect()
    setLog('clearData()')
  })

  // ── Colours ───────────────────────────────────────────────────────────────
  const sliceColor = document.getElementById('pie-slice-color') as HTMLInputElement
  sliceColor.addEventListener('input', () => {
    const label = sliceSelect.value
    if (!label) return
    chart.setSliceColor(label, sliceColor.value)
    setLog(`setSliceColor("${label}", "${sliceColor.value}")`)
  })

  document.getElementById('btn-pie-slice-color-reset')!.addEventListener('click', () => {
    const label = sliceSelect.value
    if (!label) return
    chart.setSliceColor(label, null)
    setLog(`setSliceColor("${label}", null)`)
  })

  const palette = document.getElementById('pie-palette') as HTMLSelectElement
  palette.addEventListener('change', () => {
    const pieColors = PALETTES[palette.value]
    if (pieColors) {
      chart.updateSettings({ pieColors })
      setLog(`updateSettings({ pieColors: ${JSON.stringify(pieColors)} })`)
    } else {
      // 'default' — restore the library palette.
      chart.updateSettings({ pieColors: DEFAULT_PIE_SETTINGS.pieColors })
      setLog('updateSettings({ pieColors: DEFAULT_PIE_SETTINGS.pieColors })')
    }
  })

  // ── Slice border + donut ──────────────────────────────────────────────────
  const borderColor = document.getElementById('pie-border-color') as HTMLInputElement
  borderColor.addEventListener('input', () => {
    chart.updateSettings({ sliceBorderColor: borderColor.value })
    setLog(`updateSettings({ sliceBorderColor: "${borderColor.value}" })`)
  })
  document.getElementById('btn-pie-border-auto')!.addEventListener('click', () => {
    chart.updateSettings({ sliceBorderColor: null })
    setLog('updateSettings({ sliceBorderColor: null })  // theme surface')
  })

  const borderWidth = document.getElementById('pie-border-width') as HTMLInputElement
  borderWidth.addEventListener('change', () => {
    const sliceBorderWidth = Math.max(0, parseFloat(borderWidth.value) || 0)
    chart.updateSettings({ sliceBorderWidth })
    setLog(`updateSettings({ sliceBorderWidth: ${sliceBorderWidth} })`)
  })

  const donut = document.getElementById('pie-donut') as HTMLInputElement
  const donutValue = document.getElementById('pie-donut-value')!
  donut.addEventListener('input', () => {
    const innerRadius = parseFloat(donut.value)
    donutValue.textContent = innerRadius.toFixed(2)
    chart.updateSettings({ innerRadius })
    setLog(`updateSettings({ innerRadius: ${innerRadius} })`)
  })

  // ── Labels ────────────────────────────────────────────────────────────────
  const labels = document.getElementById('pie-labels') as HTMLSelectElement
  labels.addEventListener('change', () => {
    const sliceLabels = labels.value as SliceLabelContent
    chart.updateSettings({ sliceLabels })
    setLog(`updateSettings({ sliceLabels: "${sliceLabels}" })`)
  })

  const position = document.getElementById('pie-label-position') as HTMLSelectElement
  position.addEventListener('change', () => {
    const sliceLabelPosition = position.value as 'inside' | 'outside'
    chart.updateSettings({ sliceLabelPosition })
    setLog(`updateSettings({ sliceLabelPosition: "${sliceLabelPosition}" })`)
  })

  const valueFormat = document.getElementById('pie-value-format') as HTMLInputElement
  valueFormat.addEventListener('change', () => {
    const sliceValueFormat = valueFormat.value.trim() || ',.2~f'
    try {
      chart.updateSettings({ sliceValueFormat })
      setLog(`updateSettings({ sliceValueFormat: "${sliceValueFormat}" })`)
    } catch (e) {
      setLog(`Invalid d3-format "${sliceValueFormat}": ${(e as Error).message}`)
    }
  })

  // ── Tooltip + theme ───────────────────────────────────────────────────────
  const tooltip = document.getElementById('pie-tooltip') as HTMLInputElement
  tooltip.addEventListener('change', () => {
    chart.updateSettings({ showTooltip: tooltip.checked })
    setLog(`updateSettings({ showTooltip: ${tooltip.checked} })`)
  })

  const theme = document.getElementById('pie-theme') as HTMLSelectElement
  theme.addEventListener('change', () => {
    const value = theme.value as 'light' | 'dark'
    // The chart draws text in currentColor on a transparent svg — the host page
    // supplies the surface, as a Blazor page would.
    container.style.background = value === 'dark' ? '#1a1815' : ''
    container.style.color = value === 'dark' ? '#e7e5e4' : ''
    chart.updateSettings({ theme: value })
    setLog(`updateSettings({ theme: "${value}" })`)
  })

  return { loadSample }
}
