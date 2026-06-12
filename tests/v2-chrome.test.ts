import { afterEach, describe, expect, it } from 'vitest'
import { createLineChartV2 } from '../src/lib/charts/line.ts'
import type { ChartSettings, LineChartHandle } from '../src/lib/index.ts'
import { genSeries } from './helpers.ts'

/**
 * v2 (module engine) — chrome slice. These tests target the v2 implementation
 * directly while it grows alongside the monolith; the shared characterization
 * suite flips over wholesale at parity.
 */

let v2Counter = 0
const cleanups: Array<() => void> = []

function mountV2(settings?: Partial<ChartSettings>): {
  chart: LineChartHandle
  container: HTMLElement
  $: (sel: string) => Element | null
  $all: (sel: string) => Element[]
  svg: () => SVGSVGElement
} {
  const container = document.createElement('div')
  container.id = `v2-chart-${++v2Counter}`
  document.body.appendChild(container)
  const chart = createLineChartV2(container.id, { animationDuration: 0, ...settings })
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
    svg: () => container.querySelector('svg') as SVGSVGElement,
  }
}

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
  document.body.innerHTML = ''
})

describe('v2 scaffold', () => {
  it('creates the same structural DOM as the monolith', () => {
    const { container, svg, $ } = mountV2()
    expect(container.querySelectorAll('svg')).toHaveLength(2)
    expect($('.lc-inner')).not.toBeNull()
    expect($('.lc-axis-overlay')).not.toBeNull()
    expect(svg().getAttribute('role')).toBe('img')
    expect(svg().getAttribute('aria-label')).toBe('Line chart')
    expect(svg().dataset.theme).toBe('light')
    const chartArea = $('.lc-chart-area')!
    expect(chartArea.getAttribute('clip-path')).toMatch(/^url\(#lc-clip-/)
    expect(chartArea.getAttribute('mask')).toMatch(/^url\(#lc-fade-mask-/)
    expect(chartArea.querySelector('.lc-scroll-container')).not.toBeNull()
    const blurDivs = Array.from(container.children).filter(c => c.tagName === 'DIV')
    expect(blurDivs).toHaveLength(1)
  })

  it('throws for an unknown container id', () => {
    expect(() => createLineChartV2('v2-no-such-element')).toThrow(/no element with id/)
  })

  it('reports its registered modules', () => {
    const { chart } = mountV2()
    const modular = chart as unknown as { getRegisteredModules(): string[] }
    expect(modular.getRegisteredModules()).toEqual([
      'context',
      'settings',
      'series',
      'skeleton',
      'labels',
    ])
  })

  it('destroy removes all chart DOM and guards the api', () => {
    const { chart, container } = mountV2()
    chart.destroy()
    expect(container.querySelectorAll('svg')).toHaveLength(0)
    expect(Array.from(container.children).filter(c => c.tagName === 'DIV')).toHaveLength(0)
    expect(() => chart.updateSettings({ theme: 'dark' })).toThrow(/destroyed/)
    expect(() => chart.destroy()).not.toThrow()
  })
})

describe('v2 skeleton lifecycle', () => {
  it('shows the skeleton before data, dismisses it on setData, restores it on clearData', () => {
    const { chart, $ } = mountV2()
    expect($('.lc-skeleton')).not.toBeNull()

    chart.setData(genSeries(5))
    expect($('.lc-skeleton')).toBeNull()

    chart.clearData()
    expect($('.lc-skeleton')).not.toBeNull()
  })

  it('any data ingress dismisses the skeleton', () => {
    const { chart, $ } = mountV2()
    chart.setSeriesData('fresh', genSeries(3))
    expect($('.lc-skeleton')).toBeNull()
  })
})

describe('v2 theme + chrome labels', () => {
  it('theme updates the svg dataset synchronously', () => {
    const { chart, svg } = mountV2({ theme: 'dark' })
    expect(svg().dataset.theme).toBe('dark')
    chart.updateSettings({ theme: 'light' })
    expect(svg().dataset.theme).toBe('light')
  })

  it('title/x/y labels render with reserved margins and clear again', () => {
    const { chart, $ } = mountV2()
    chart.updateSettings({ title: 'V2 Chart', xLabel: 'Time', yLabel: 'Value' })

    expect($('.lc-title')!.textContent).toBe('V2 Chart')
    expect($('.lc-x-label')!.textContent).toBe('Time')
    expect($('.lc-y-label')!.textContent).toBe('Value')

    // title space reservation moves the inner group down by TITLE_SPACE
    const inner = $('.lc-inner')!
    expect(inner.getAttribute('transform')).toBe('translate(78,42)') // 60+18 yLabel, 20+22 title

    chart.updateSettings({ title: null, xLabel: null, yLabel: null })
    expect($('.lc-title')).toBeNull()
    expect($('.lc-x-label')).toBeNull()
    expect($('.lc-y-label')).toBeNull()
    expect(inner.getAttribute('transform')).toBe('translate(60,20)')
  })

  it('title renders with no data (skeleton state)', () => {
    const { $ } = mountV2({ title: 'Early' })
    expect($('.lc-title')!.textContent).toBe('Early')
    expect($('.lc-skeleton')).not.toBeNull()
  })

  it('resize re-renders the frame chrome with updated viewBoxes', async () => {
    const { chart, container, svg } = mountV2()
    chart.setData(genSeries(3))
    const { triggerResize } = await import('./setup.ts')
    triggerResize(container, 900, 450)
    expect(svg().getAttribute('viewBox')).toBe('0 0 900 450')
    expect(container.querySelectorAll('svg')[1]!.getAttribute('viewBox')).toBe('0 0 900 450')
  })
})

describe('v2 series data layer', () => {
  it('updateSettings and data API are wired end to end', () => {
    const { chart } = mountV2()
    expect(() => {
      chart.setData(genSeries(5))
      chart.updateData(genSeries(5, { start: '2024-01-02T00:00:00.000Z' }))
      chart.appendDataPoint({ date: '2024-03-01T00:00:00.000Z', value: 1 })
      chart.appendDataPoints(genSeries(2, { start: '2024-04-01T00:00:00.000Z' }))
      chart.addSeries('s2', { color: '#123456' })
      chart.setSeriesData('s2', genSeries(3))
      chart.updateSeriesSettings('s2', { lineWeight: 4 })
      chart.removeSeries('s2')
      chart.setLineColor('#ff0000')
      chart.setLineWeight(3)
      chart.clearData()
    }).not.toThrow()
  })

  it('rejects invalid dates loudly', () => {
    const { chart } = mountV2()
    expect(() => chart.setData([{ date: 'garbage', value: 1 }])).toThrow(/invalid date/)
  })
})
