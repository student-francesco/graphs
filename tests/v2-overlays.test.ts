import { afterEach, describe, expect, it } from 'vitest'
import { createLineChartV2 } from '../src/lib/charts/line.ts'
import type { ChartSnapshotV2 } from '../src/lib/modules/snapshot.ts'
import type { ChartSettings, LineChartHandle } from '../src/lib/index.ts'
import { genSeries } from './helpers.ts'

/** v2 (module engine) — overlays + state: annotations, tooltip, snapshot. */

let v2Counter = 200
const cleanups: Array<() => void> = []

function mountV2(settings?: Partial<ChartSettings>): {
  chart: LineChartHandle
  container: HTMLElement
  $: (sel: string) => Element | null
  $all: (sel: string) => Element[]
  svg: () => SVGSVGElement
} {
  const container = document.createElement('div')
  container.id = `v2-ovl-${++v2Counter}`
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

function getSnapshotV2(chart: LineChartHandle): ChartSnapshotV2 {
  return (chart as unknown as { getSnapshot(): ChartSnapshotV2 }).getSnapshot()
}

describe('v2 annotations', () => {
  it('horizontal line spans the inner width with default styling', () => {
    const { chart, $ } = mountV2()
    chart.setData(genSeries(5, { base: 50, amplitude: 10 }))
    chart.setHorizontalLine('limit', 55, 'Upper limit')

    const group = $('.lc-annotation')!
    expect(group.getAttribute('data-id')).toBe('limit')
    const line = group.querySelector('line')!
    expect(line.getAttribute('x1')).toBe('0')
    expect(Number(line.getAttribute('x2'))).toBeGreaterThan(0)
    expect(line.getAttribute('y1')).toBe(line.getAttribute('y2'))
    expect(line.getAttribute('stroke')).toBe('#6366f1')
    expect(line.getAttribute('stroke-width')).toBe('1.5')
    expect(line.getAttribute('stroke-dasharray')).toBe('6 4')
    expect(group.querySelector('title')!.textContent).toBe('Upper limit')
  })

  it('vertical line spans the inner height; invalid dates throw', () => {
    const { chart, $ } = mountV2()
    chart.setData(genSeries(5))
    chart.setVerticalLine('event', '2024-01-03T00:00:00.000Z', 'Event')
    const line = $('.lc-annotation line')!
    expect(line.getAttribute('x1')).toBe(line.getAttribute('x2'))
    expect(line.getAttribute('y1')).toBe('0')
    expect(() => chart.setVerticalLine('bad', 'nope', 'X')).toThrow(/invalid date/)
  })

  it('annotations live in the chart area, outside the scroll container', () => {
    const { chart, $ } = mountV2()
    chart.setData(genSeries(5))
    chart.setHorizontalLine('h', 50, 'H')
    const layer = $('.lc-annotations')!
    expect(layer.closest('.lc-chart-area')).not.toBeNull()
    expect(layer.closest('.lc-scroll-container')).toBeNull()
  })

  it('a horizontal annotation widens its axis auto-extent', () => {
    const { chart, container } = mountV2()
    chart.setData(genSeries(5, { base: 50, amplitude: 5 }))
    const before = container.querySelector('.lc-line')!.getAttribute('d')
    chart.setHorizontalLine('far', 500, 'Way above')
    expect(container.querySelector('.lc-line')!.getAttribute('d')).not.toBe(before)
  })

  it('replace by name, remove, clear; axis removal cascades horizontals only', () => {
    const { chart, $all, $ } = mountV2()
    chart.setData(genSeries(5))
    chart.setHorizontalLine('x', 40, 'First')
    chart.setHorizontalLine('x', 60, 'Second')
    expect($all('.lc-annotation')).toHaveLength(1)
    expect($('.lc-annotation title')!.textContent).toBe('Second')

    chart.createAxis('temp')
    chart.setHorizontalLine('bound', 10, 'On temp', { axis: 'temp' })
    chart.setVerticalLine('free', '2024-01-02T00:00:00.000Z', 'Free')
    expect($all('.lc-annotation')).toHaveLength(3)

    chart.removeAxis('temp')
    const ids = $all('.lc-annotation').map(a => a.getAttribute('data-id'))
    expect(ids).toContain('x')
    expect(ids).toContain('free')
    expect(ids).not.toContain('bound')

    chart.removeAnnotation('x')
    chart.clearAnnotations()
    expect($all('.lc-annotation')).toHaveLength(0)
  })

  it('annotations created before data render once data arrives', () => {
    const { chart, $all } = mountV2()
    chart.setHorizontalLine('early', 42, 'Early bird')
    expect($all('.lc-annotation')).toHaveLength(0)
    chart.setData(genSeries(5))
    expect($all('.lc-annotation')).toHaveLength(1)
  })
})

describe('v2 tooltip', () => {
  const tooltipEl = (): HTMLElement | null => document.body.querySelector('[role="tooltip"]')

  it('one hover zone per raw point; tooltip div appears with data', () => {
    const { chart, $all } = mountV2()
    expect(tooltipEl()).toBeNull()
    chart.setData(genSeries(7))
    expect($all('.lc-hover-zone')).toHaveLength(7)
    expect(tooltipEl()).not.toBeNull()
  })

  it('mouseenter shows formatted content; series name only when multi-series', () => {
    const { chart, $all } = mountV2()
    chart.setData([{ date: '2024-03-15T00:00:00.000Z', value: 12.3456 }])
    const zone = $all('.lc-hover-zone')[0]!
    zone.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, clientX: 50, clientY: 50 }))
    const tip = tooltipEl()!
    expect(tip.style.opacity).toBe('1')
    expect(tip.innerHTML).toContain('Mar 15, 2024')
    expect(tip.innerHTML).toContain('12.35')
    expect(tip.innerHTML).not.toContain('default')
    zone.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }))
    expect(tip.style.opacity).toBe('0')
  })

  it('showTooltip:false removes zones and the div; theme change rebuilds it', () => {
    const { chart, $all } = mountV2()
    chart.setData(genSeries(3))
    const lightBg = tooltipEl()!.style.background
    chart.updateSettings({ theme: 'dark' })
    expect(tooltipEl()!.style.background).not.toBe(lightBg)
    chart.updateSettings({ showTooltip: false })
    expect(tooltipEl()).toBeNull()
    expect($all('.lc-hover-zone')).toHaveLength(0)
  })

  it('hit radius covers the largest dot, minimum 8', () => {
    const { chart, $all } = mountV2({ dotRadius: 12 })
    chart.setData(genSeries(3))
    for (const z of $all('.lc-hover-zone')) expect(z.getAttribute('r')).toBe('12')
  })
})

describe('v2 snapshot (version 2)', () => {
  function buildScenario() {
    const mounted = mountV2({ title: 'Scenario', theme: 'dark', smoothing: 2 })
    const { chart } = mounted
    chart.setData(genSeries(6))
    chart.createAxis('pressure', { color: '#0891b2', limits: [0, 200], scaleType: 'log' })
    chart.addSeries('p1', { lineWeight: 3, dotRadius: 2 })
    chart.setSeriesData('p1', genSeries(6, { base: 80, amplitude: 30 }))
    chart.associateSeries('p1', 'pressure')
    chart.setHorizontalLine('upper', 95, 'Upper bound', { color: '#dc2626', dashed: false })
    chart.setVerticalLine('marker', '2024-01-03T00:00:00.000Z', 'Marker')
    return mounted
  }

  it('captures versioned per-module slices', () => {
    const { chart } = buildScenario()
    const snap = getSnapshotV2(chart)
    expect(snap.version).toBe(2)
    expect(Object.keys(snap.modules).sort()).toEqual([
      'annotations',
      'axes',
      'series',
      'settings',
    ])
    const settings = snap.modules['settings'] as Record<string, unknown>
    expect('xAxisFormatter' in settings).toBe(false)
    expect(settings['title']).toBe('Scenario')
  })

  it('round-trips: restore(getSnapshot()) yields a deep-equal snapshot', () => {
    const { chart } = buildScenario()
    const snap = JSON.parse(JSON.stringify(getSnapshotV2(chart))) as ChartSnapshotV2
    chart.restoreSnapshot(snap as never)
    expect(JSON.parse(JSON.stringify(getSnapshotV2(chart)))).toEqual(snap)
  })

  it('rebuilds the DOM from a snapshot in a fresh chart', () => {
    const source = buildScenario()
    const snap = JSON.parse(JSON.stringify(getSnapshotV2(source.chart))) as ChartSnapshotV2

    const target = mountV2()
    target.chart.restoreSnapshot(snap as never)

    expect(target.$all('.lc-series')).toHaveLength(2)
    expect(target.$all('.lc-y-axis')).toHaveLength(2)
    expect(target.$all('.lc-annotation')).toHaveLength(2)
    expect(target.svg().dataset.theme).toBe('dark')
    expect(target.$('.lc-title')!.textContent).toBe('Scenario')
  })

  it('restores into the skeleton state when the snapshot has no data', () => {
    const empty = mountV2()
    const snap = JSON.parse(JSON.stringify(getSnapshotV2(empty.chart))) as ChartSnapshotV2

    const target = mountV2()
    target.chart.setData(genSeries(5))
    expect(target.$('.lc-skeleton')).toBeNull()
    target.chart.restoreSnapshot(snap as never)
    expect(target.$('.lc-skeleton')).not.toBeNull()
    expect(target.$all('.lc-series')).toHaveLength(0)
  })

  it('rejects non-v2 snapshots loudly', () => {
    const { chart } = mountV2()
    expect(() => chart.restoreSnapshot({ settings: {} } as never)).toThrow(/version/)
  })

  it('snapshot series bound to missing axes fall back to the first axis', () => {
    const { chart } = mountV2()
    chart.setData(genSeries(3))
    const snap = JSON.parse(JSON.stringify(getSnapshotV2(chart))) as ChartSnapshotV2
    const series = snap.modules['series'] as { series: Array<{ axisId: string }> }
    series.series[0]!.axisId = 'ghost'
    expect(() => chart.restoreSnapshot(snap as never)).not.toThrow()
    const restored = getSnapshotV2(chart).modules['series'] as { series: Array<{ axisId: string }> }
    expect(restored.series[0]!.axisId).toBe('default')
  })
})
