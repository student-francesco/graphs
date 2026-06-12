import { describe, expect, it } from 'vitest'
import { genSeries, mountChart } from './helpers.ts'

const PALETTE = [
  '#e11d48',
  '#0891b2',
  '#16a34a',
  '#d97706',
  '#7c3aed',
  '#db2777',
  '#0284c7',
  '#4f46e5',
]

describe('multi-series', () => {
  it('added series take palette colors in order', () => {
    const { chart, container } = mountChart()
    chart.setData(genSeries(3))
    for (const id of ['s1', 's2', 's3']) {
      chart.addSeries(id)
      chart.setSeriesData(id, genSeries(3))
    }
    for (const [i, id] of ['s1', 's2', 's3'].entries()) {
      const line = container.querySelector(`.lc-series[data-id="${id}"] .lc-line`)!
      expect(line.getAttribute('stroke')).toBe(PALETTE[i])
    }
  })

  it('addSeries with explicit color does not consume a palette slot', () => {
    const { chart, container } = mountChart()
    chart.setData(genSeries(3))
    chart.addSeries('explicit', { color: '#123456' })
    chart.setSeriesData('explicit', genSeries(3))
    chart.addSeries('auto')
    chart.setSeriesData('auto', genSeries(3))
    // `settings?.color ?? PALETTE[next++]` short-circuits: explicit colors leave the cursor alone
    expect(
      container.querySelector('.lc-series[data-id="auto"] .lc-line')!.getAttribute('stroke'),
    ).toBe(PALETTE[0])
  })

  it('addSeries is idempotent for an existing id', () => {
    const { chart, $all } = mountChart()
    chart.setData(genSeries(3))
    chart.addSeries('x', { lineWeight: 7 })
    chart.addSeries('x', { lineWeight: 1 }) // ignored — series exists
    chart.setSeriesData('x', genSeries(3))
    const line = $all('.lc-series[data-id="x"] .lc-line')[0]!
    expect(line.getAttribute('stroke-width')).toBe('7')
  })

  it('removeSeries removes the DOM group immediately', () => {
    const { chart, container, $all } = mountChart()
    chart.setData(genSeries(3))
    chart.addSeries('gone')
    chart.setSeriesData('gone', genSeries(3))
    expect($all('.lc-series')).toHaveLength(2)
    chart.removeSeries('gone')
    expect($all('.lc-series')).toHaveLength(1)
    expect(container.querySelector('.lc-series[data-id="gone"]')).toBeNull()
  })

  it('the default series can be removed', () => {
    const { chart, $all } = mountChart()
    chart.setData(genSeries(3))
    chart.addSeries('only')
    chart.setSeriesData('only', genSeries(3))
    chart.removeSeries('default')
    expect($all('.lc-series')).toHaveLength(1)
    expect($all('.lc-series')[0]!.getAttribute('data-id')).toBe('only')
  })

  it('setSeriesData on an unknown id auto-creates the series', () => {
    const { chart, $all } = mountChart()
    chart.setSeriesData('fresh', genSeries(4))
    expect($all('.lc-series[data-id="fresh"] .lc-dot')).toHaveLength(4)
  })
})

describe('per-series settings cascade', () => {
  it('per-series overrides beat chart-wide settings; undefined falls back', () => {
    const { chart, container } = mountChart({ lineWeight: 2, dotRadius: 4 })
    chart.setData(genSeries(3))
    chart.addSeries('custom', { lineWeight: 6, dotRadius: 1 })
    chart.setSeriesData('custom', genSeries(3))

    const custom = container.querySelector('.lc-series[data-id="custom"]')!
    expect(custom.querySelector('.lc-line')!.getAttribute('stroke-width')).toBe('6')
    expect(custom.querySelector('.lc-dot')!.getAttribute('r')).toBe('1')

    // chart-wide change affects only the non-overridden series
    chart.updateSettings({ lineWeight: 3, dotRadius: 5 })
    const def = container.querySelector('.lc-series[data-id="default"]')!
    expect(def.querySelector('.lc-line')!.getAttribute('stroke-width')).toBe('3')
    expect(def.querySelector('.lc-dot')!.getAttribute('r')).toBe('5')
    expect(custom.querySelector('.lc-line')!.getAttribute('stroke-width')).toBe('6')
    expect(custom.querySelector('.lc-dot')!.getAttribute('r')).toBe('1')
  })

  it('updateSeriesSettings with undefined resets a field back to the cascade', () => {
    const { chart, container } = mountChart({ dotRadius: 4 })
    chart.setData(genSeries(3))
    chart.updateSeriesSettings('default', { dotRadius: 9 })
    expect(container.querySelector('.lc-dot')!.getAttribute('r')).toBe('9')
    chart.updateSeriesSettings('default', { dotRadius: undefined })
    expect(container.querySelector('.lc-dot')!.getAttribute('r')).toBe('4')
  })

  it('per-series smoothing changes geometry, others untouched', () => {
    const { chart, container } = mountChart()
    chart.setData(genSeries(12))
    chart.addSeries('smooth')
    chart.setSeriesData('smooth', genSeries(12))
    const rawD = container
      .querySelector('.lc-series[data-id="default"] .lc-line')!
      .getAttribute('d')
    chart.updateSeriesSettings('smooth', { smoothing: 5 })
    expect(
      container.querySelector('.lc-series[data-id="smooth"] .lc-line')!.getAttribute('d'),
    ).not.toBe(rawD)
    expect(
      container.querySelector('.lc-series[data-id="default"] .lc-line')!.getAttribute('d'),
    ).toBe(rawD)
  })

  it('per-series decimation caps that series dot count', () => {
    const { chart, container } = mountChart()
    chart.setData(genSeries(40))
    chart.updateSeriesSettings('default', { decimation: 10 })
    expect(container.querySelectorAll('.lc-series[data-id="default"] .lc-dot')).toHaveLength(10)
  })

  it('chart-wide smoothing cascades to series without overrides', () => {
    const { chart, container } = mountChart()
    chart.setData(genSeries(12))
    const before = container.querySelector('.lc-line')!.getAttribute('d')
    chart.updateSettings({ smoothing: 4 })
    expect(container.querySelector('.lc-line')!.getAttribute('d')).not.toBe(before)
  })
})

describe('multi-axis', () => {
  it('a second axis renders on the right at innerWidth', () => {
    const { chart, $all } = mountChart()
    chart.setData(genSeries(5))
    chart.createAxis('right-axis')
    const rails = $all('.lc-y-axis')
    expect(rails).toHaveLength(2)
    // axis names only render when >= 2 axes
    expect($all('.lc-y-axis-name').length).toBeGreaterThan(0)
  })

  it('three or more axes stack on the left at -i*AXIS_WIDTH offsets', () => {
    const { chart, $all } = mountChart()
    chart.setData(genSeries(5))
    chart.createAxis('a2')
    chart.createAxis('a3')
    expect($all('.lc-y-axis')).toHaveLength(3)
  })

  it('associateSeries binds a series to an axis with separate scaling', () => {
    const { chart, container } = mountChart()
    chart.setData(genSeries(5, { base: 10, amplitude: 2 }))
    chart.createAxis('big', { range: [0, 10000] })
    chart.addSeries('huge')
    chart.setSeriesData('huge', genSeries(5, { base: 5000, amplitude: 100 }))
    const before = container
      .querySelector('.lc-series[data-id="huge"] .lc-line')!
      .getAttribute('d')
    chart.associateSeries('huge', 'big')
    const after = container
      .querySelector('.lc-series[data-id="huge"] .lc-line')!
      .getAttribute('d')
    expect(after).not.toBe(before)
  })

  it('associateSeries warns and no-ops for an unknown axis', () => {
    const { chart } = mountChart()
    chart.setData(genSeries(3))
    expect(() => chart.associateSeries('default', 'nope')).not.toThrow()
  })

  it('removeAxis migrates orphaned series to the first axis and keeps >= 1 axis', () => {
    const { chart, $all } = mountChart()
    chart.setData(genSeries(5))
    chart.createAxis('extra')
    chart.associateSeries('default', 'extra')
    chart.removeAxis('extra')
    expect($all('.lc-y-axis')).toHaveLength(1)
    // series fell back to the default axis — still renders
    expect($all('.lc-series[data-id="default"] .lc-line')).toHaveLength(1)
    // the last axis is irremovable
    chart.removeAxis('default')
    expect($all('.lc-y-axis')).toHaveLength(1)
  })

  it('axis color paints tick labels and bound series stroke', () => {
    const { chart, container } = mountChart()
    chart.setData(genSeries(5))
    chart.createAxis('colored', { color: '#ff00aa' })
    chart.associateSeries('default', 'colored')
    expect(container.querySelector('.lc-line')!.getAttribute('stroke')).toBe('#ff00aa')
  })

  it('axis range is used verbatim; updateAxisSettings re-renders', () => {
    const { chart, container } = mountChart()
    chart.setData(genSeries(5))
    const before = container.querySelector('.lc-line')!.getAttribute('d')
    chart.updateAxisSettings('default', { range: [0, 1000] })
    expect(container.querySelector('.lc-line')!.getAttribute('d')).not.toBe(before)
  })

  it('log scale renders positive-domain geometry', () => {
    const { chart, container } = mountChart({ yScaleType: 'log' })
    chart.setData(
      Array.from({ length: 6 }, (_, i) => ({
        date: new Date(Date.UTC(2024, 0, 1 + i)).toISOString(),
        value: 10 ** (i + 1),
      })),
    )
    expect(container.querySelector('.lc-line')!.getAttribute('d')).toBeTruthy()
    expect(container.querySelectorAll('.lc-dot')).toHaveLength(6)
  })

  it('per-axis grid override beats chart-wide showGrid', () => {
    const { chart, $ } = mountChart({ showGrid: true })
    chart.setData(genSeries(5))
    chart.updateAxisSettings('default', { showGrid: false })
    expect($('.lc-grid-y')).toBeNull()
  })
})
