import { afterEach, describe, expect, it } from 'vitest'
import { createLineChart } from '@/lib/index.ts'
import type { ChartSettings, LineChartHandle } from '@/lib/index.ts'
import { genSeries } from './helpers.ts'

/** v2 (module engine) — static geometry slice: series, scales, axes, grid. */

let v2Counter = 100
const cleanups: Array<() => void> = []

function mountV2(settings?: Partial<ChartSettings>): {
  chart: LineChartHandle
  container: HTMLElement
  $: (sel: string) => Element | null
  $all: (sel: string) => Element[]
} {
  const container = document.createElement('div')
  container.id = `v2-geom-${++v2Counter}`
  document.body.appendChild(container)
  const chart = createLineChart(container.id, { animationDuration: 0, ...settings })
  cleanups.push(() => {
    try {
      chart.destroy()
    } catch {
      // destroyed by the test
    }
    container.remove()
  })
  return {
    chart,
    container,
    $: sel => container.querySelector(sel),
    $all: sel => Array.from(container.querySelectorAll(sel)),
  }
}

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
  document.body.innerHTML = ''
})

describe('v2 setData structure', () => {
  it('renders series group, line, dots, ticks, grid, baseline, y rail', () => {
    const { chart, $all, $ } = mountV2()
    chart.setData(genSeries(10))

    expect($all('.lc-series')).toHaveLength(1)
    expect($('.lc-series')!.getAttribute('data-id')).toBe('default')

    const line = $('.lc-line') as SVGPathElement
    expect(line.getAttribute('fill')).toBe('none')
    expect(line.getAttribute('stroke')).toBe('#4f46e5')
    expect(line.getAttribute('stroke-width')).toBe('2')
    expect(line.getAttribute('d')).toBeTruthy()

    expect($all('.lc-dot')).toHaveLength(10)
    expect($all('.lc-x-tick').length).toBeGreaterThan(0)
    expect($('.lc-grid-y')).not.toBeNull()
    expect($('.lc-grid-x')).not.toBeNull()
    expect($('.lc-x-axis-line')).not.toBeNull()
    expect($all('.lc-y-axis')).toHaveLength(1)
  })

  it('dots carry theme border and resolved fill; dotRadius 0 removes dots', () => {
    const { chart, $all } = mountV2()
    chart.setData(genSeries(3))
    for (const dot of $all('.lc-dot')) {
      expect(dot.getAttribute('fill')).toBe('#4f46e5')
      expect(dot.getAttribute('stroke')).toBe('#fff')
      expect(dot.getAttribute('r')).toBe('4')
    }
    chart.updateSettings({ dotRadius: 0 })
    expect($all('.lc-dot')).toHaveLength(0)
    chart.updateSettings({ theme: 'dark', dotRadius: 4 })
    for (const dot of $all('.lc-dot')) {
      expect(dot.getAttribute('stroke')).toBe('#1a1815')
    }
  })

  it('clearData wipes series content and returns to the skeleton', () => {
    const { chart, $all, $ } = mountV2()
    chart.setData(genSeries(5))
    chart.clearData()
    expect($all('.lc-series')).toHaveLength(0)
    expect($all('.lc-x-tick')).toHaveLength(0)
    expect($all('.lc-y-axis')).toHaveLength(0)
    expect($('.lc-grid-y')).toBeNull()
    expect($('.lc-skeleton')).not.toBeNull()

    chart.setData(genSeries(3))
    expect($all('.lc-dot')).toHaveLength(3)
    expect($('.lc-skeleton')).toBeNull()
  })

  it('value labels render when enabled, formatted via the cascade', () => {
    const { chart, $all } = mountV2({ showLabels: true })
    chart.setData(genSeries(4))
    const labels = $all('.lc-label')
    expect(labels).toHaveLength(4)
    expect(labels[0]!.textContent).toMatch(/^\d+\.\d{2}$/)
  })

  it('curveType change rewrites the path; smoothing changes geometry', () => {
    const { chart, $ } = mountV2()
    chart.setData(genSeries(12))
    const d0 = ($('.lc-line') as SVGPathElement).getAttribute('d')
    chart.updateSettings({ curveType: 'step' })
    const d1 = ($('.lc-line') as SVGPathElement).getAttribute('d')
    expect(d1).not.toBe(d0)
    chart.updateSettings({ smoothing: 4 })
    const d2 = ($('.lc-line') as SVGPathElement).getAttribute('d')
    expect(d2).not.toBe(d1)
  })

  it('decimation caps the dot count', () => {
    const { chart, $all } = mountV2()
    chart.setData(genSeries(40))
    chart.updateSettings({ decimation: 10 })
    expect($all('.lc-dot')).toHaveLength(10)
  })

  it('grid toggles off per chart and per axis', () => {
    const { chart, $ } = mountV2()
    chart.setData(genSeries(5))
    expect($('.lc-grid-y')).not.toBeNull()
    chart.updateSettings({ showGrid: false })
    expect($('.lc-grid-y')).toBeNull()
    chart.updateSettings({ showGrid: true })
    chart.updateAxisSettings('default', { showGrid: false })
    expect($('.lc-grid-y')).toBeNull()
  })
})

describe('v2 updateData branches', () => {
  it('sufficient overlap keeps the path element; dropped points stay joined as exit dots', () => {
    const { chart, $, $all } = mountV2()
    chart.setData(genSeries(10))
    const pathBefore = $('.lc-line')
    chart.updateData(genSeries(10, { start: '2024-01-03T00:00:00.000Z' }))
    expect($('.lc-line')).toBe(pathBefore)
    expect($all('.lc-dot')).toHaveLength(12)
    expect($all('.lc-dot-exiting')).toHaveLength(0)
  })

  it('insufficient overlap rebuilds the line element (rebirth)', () => {
    const { chart, $ } = mountV2()
    chart.setData(genSeries(10))
    const pathBefore = $('.lc-line')
    chart.updateData(genSeries(10, { start: '2025-06-01T00:00:00.000Z' }))
    const pathAfter = $('.lc-line')
    expect(pathAfter).not.toBeNull()
    expect(pathAfter).not.toBe(pathBefore)
  })

  it('maxDataPoints trims from the front; trimmed points linger as exit dots', () => {
    const { chart, $all } = mountV2({ maxDataPoints: 5 })
    chart.setData(genSeries(5))
    chart.appendDataPoints(genSeries(3, { start: '2024-02-01T00:00:00.000Z' }))
    expect($all('.lc-dot')).toHaveLength(8)
  })
})

describe('v2 multi-series + cascade', () => {
  it('palette colors assign in order; explicit colors skip the cursor', () => {
    const { chart, container } = mountV2()
    chart.setData(genSeries(3))
    chart.addSeries('s1')
    chart.setSeriesData('s1', genSeries(3))
    chart.addSeries('explicit', { color: '#123456' })
    chart.setSeriesData('explicit', genSeries(3))
    chart.addSeries('s2')
    chart.setSeriesData('s2', genSeries(3))

    const stroke = (id: string): string | null =>
      container.querySelector(`.lc-series[data-id="${id}"] .lc-line`)!.getAttribute('stroke')
    expect(stroke('s1')).toBe('#e11d48')
    expect(stroke('explicit')).toBe('#123456')
    expect(stroke('s2')).toBe('#0891b2')
  })

  it('per-series overrides beat chart-wide; undefined resets to the cascade', () => {
    const { chart, container } = mountV2()
    chart.setData(genSeries(3))
    chart.updateSeriesSettings('default', { dotRadius: 9 })
    expect(container.querySelector('.lc-dot')!.getAttribute('r')).toBe('9')
    chart.updateSettings({ dotRadius: 2 })
    expect(container.querySelector('.lc-dot')!.getAttribute('r')).toBe('9')
    chart.updateSeriesSettings('default', { dotRadius: undefined })
    expect(container.querySelector('.lc-dot')!.getAttribute('r')).toBe('2')
  })

  it('fast paths repaint cascade-following series only', () => {
    const { chart, container } = mountV2()
    chart.setData(genSeries(3))
    chart.addSeries('fixed', { color: '#000000' })
    chart.setSeriesData('fixed', genSeries(3))

    chart.setLineColor('#ff0000')
    expect(
      container.querySelector('.lc-series[data-id="default"] .lc-line')!.getAttribute('stroke'),
    ).toBe('#ff0000')
    expect(
      container.querySelector('.lc-series[data-id="fixed"] .lc-line')!.getAttribute('stroke'),
    ).toBe('#000000')

    chart.setSeriesColor('default', '#00ff00')
    chart.setLineColor('#0000ff')
    expect(
      container.querySelector('.lc-series[data-id="default"] .lc-line')!.getAttribute('stroke'),
    ).toBe('#00ff00')
  })

  it('removeSeries removes the DOM group', () => {
    const { chart, $all } = mountV2()
    chart.setData(genSeries(3))
    chart.addSeries('gone')
    chart.setSeriesData('gone', genSeries(3))
    expect($all('.lc-series')).toHaveLength(2)
    chart.removeSeries('gone')
    expect($all('.lc-series')).toHaveLength(1)
  })
})

describe('v2 multi-axis', () => {
  it('second axis renders right; third+ stack left; removeAxis migrates series', () => {
    const { chart, $all } = mountV2()
    chart.setData(genSeries(5))
    chart.createAxis('a2')
    expect($all('.lc-y-axis')).toHaveLength(2)
    expect($all('.lc-y-axis-name').length).toBeGreaterThan(0)
    chart.createAxis('a3')
    expect($all('.lc-y-axis')).toHaveLength(3)

    chart.associateSeries('default', 'a3')
    chart.removeAxis('a3')
    expect($all('.lc-y-axis')).toHaveLength(2)
    expect($all('.lc-series[data-id="default"] .lc-line')).toHaveLength(1)

    chart.removeAxis('a2')
    chart.removeAxis('default') // last axis is irremovable
    expect($all('.lc-y-axis')).toHaveLength(1)
  })

  it('axis color paints the bound series stroke and tick lettering', () => {
    const { chart, container } = mountV2()
    chart.setData(genSeries(5))
    chart.createAxis('colored', { color: '#ff00aa' })
    chart.associateSeries('default', 'colored')
    expect(container.querySelector('.lc-line')!.getAttribute('stroke')).toBe('#ff00aa')
    const tickText = container.querySelector('.lc-y-axis[data-axis-id="colored"] .tick text')
    expect(tickText!.getAttribute('fill')).toBe('#ff00aa')
  })

  it('axis range pins the domain; log scale renders positive geometry', () => {
    const { chart, container } = mountV2()
    chart.setData(genSeries(5))
    const before = container.querySelector('.lc-line')!.getAttribute('d')
    chart.updateAxisSettings('default', { range: [0, 1000] })
    expect(container.querySelector('.lc-line')!.getAttribute('d')).not.toBe(before)

    const log = mountV2({ yScaleType: 'log' })
    log.chart.setData(
      Array.from({ length: 6 }, (_, i) => ({
        date: new Date(Date.UTC(2024, 0, 1 + i)).toISOString(),
        value: 10 ** (i + 1),
      })),
    )
    expect(log.container.querySelector('.lc-line')!.getAttribute('d')).toBeTruthy()
  })
})

describe('v2 Blazor formatters (fixed behavior)', () => {
  it('renders delegate-resolved labels on x ticks (monolith bug fixed)', async () => {
    const calls: unknown[][] = []
    const delegate = {
      invokeMethodAsync: (...args: unknown[]) => {
        calls.push(args)
        return Promise.resolve(`L${args[2] as number}`)
      },
    }
    const { chart, $all } = mountV2({
      xAxisFormatter: delegate as unknown as ChartSettings['xAxisFormatter'],
    })
    chart.setData(genSeries(10))
    // async prepare → the pass settles on microtasks
    await new Promise(resolve => setTimeout(resolve, 0))

    const texts = $all('.lc-x-tick text').map(t => t.textContent)
    expect(texts.length).toBeGreaterThan(0)
    texts.forEach((t, i) => expect(t).toBe(`L${i}`))
    expect(calls[0]![0]).toBe('executeDelegate')
  })

  it('y tick labels correspond to the rendered tick values (monolith bug fixed)', async () => {
    const delegate = {
      invokeMethodAsync: (_m: string, value: number) => Promise.resolve(`V=${value}`),
    }
    const { chart, container } = mountV2({
      yAxisFormatter: delegate as unknown as ChartSettings['yAxisFormatter'],
    })
    chart.setData(genSeries(10))
    await new Promise(resolve => setTimeout(resolve, 0))

    const ticks = Array.from(container.querySelectorAll('.lc-y-axis .tick'))
    expect(ticks.length).toBeGreaterThan(0)
    for (const tick of ticks) {
      const datum = (tick as SVGGElement & { __data__?: number }).__data__
      expect(tick.querySelector('text')!.textContent).toBe(`V=${datum}`)
    }
  })

  it('falls back with a warning when interop rejects', async () => {
    const warnings: unknown[] = []
    const origWarn = console.warn
    console.warn = (...args: unknown[]) => void warnings.push(args)
    try {
      const delegate = {
        invokeMethodAsync: () => Promise.reject(new Error('interop down')),
      }
      const { chart, $all } = mountV2({
        xAxisFormatter: delegate as unknown as ChartSettings['xAxisFormatter'],
      })
      chart.setData(genSeries(10))
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(warnings.some(w => (w as string[])[0] === 'Failed to invoke formatter from Blazor')).toBe(true)
      const texts = $all('.lc-x-tick text').map(t => t.textContent)
      expect(texts.length).toBeGreaterThan(0)
      for (const t of texts) expect(t).not.toBe('')
    } finally {
      console.warn = origWarn
    }
  })
})
