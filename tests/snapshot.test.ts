import { describe, expect, it } from 'vitest'
import { genSeries, mountChart } from './helpers.ts'

/** Full-feature scenario used for the golden snapshot and the round-trip invariant. */
function buildScenario() {
  const mounted = mountChart({ title: 'Scenario', theme: 'dark', smoothing: 2 })
  const { chart } = mounted
  chart.setData(genSeries(6))
  chart.createAxis('pressure', { color: '#0891b2', limits: [0, 200], scaleType: 'log' })
  chart.addSeries('p1', { lineWeight: 3, dotRadius: 2 })
  chart.setSeriesData('p1', genSeries(6, { base: 80, amplitude: 30 }))
  chart.associateSeries('p1', 'pressure')
  chart.addSeries('p2')
  chart.setSeriesData('p2', genSeries(4, { base: 20 }))
  chart.setHorizontalLine('upper', 95, 'Upper bound', { color: '#dc2626', dashed: false })
  chart.setVerticalLine('marker', '2024-01-03T00:00:00.000Z', 'Marker')
  return mounted
}

describe('getSnapshot', () => {
  it('captures the full scenario shape (golden)', () => {
    const { chart } = buildScenario()
    expect(chart.getSnapshot()).toMatchSnapshot()
  })

  it('strips function-valued formatters from settings', () => {
    const { chart } = mountChart({ xAxisFormatter: () => 'tick' })
    chart.setData(genSeries(3))
    const snap = chart.getSnapshot()
    expect('xAxisFormatter' in snap.settings).toBe(false)
    expect('yAxisFormatter' in snap.settings).toBe(false)
  })

  it('serializes dates as ISO strings', () => {
    const { chart } = mountChart()
    chart.setData(genSeries(2))
    const snap = chart.getSnapshot()
    expect(snap.series[0]!.data[0]!.date).toBe('2024-01-01T00:00:00.000Z')
  })
})

describe('restoreSnapshot', () => {
  it('round-trips: restore(getSnapshot()) yields a deep-equal snapshot', () => {
    const { chart } = buildScenario()
    const snap = chart.getSnapshot()
    chart.restoreSnapshot(JSON.parse(JSON.stringify(snap)))
    expect(chart.getSnapshot()).toEqual(JSON.parse(JSON.stringify(snap)))
  })

  it('rebuilds the DOM to match the restored state', () => {
    const source = buildScenario()
    const snap = source.chart.getSnapshot()

    const target = mountChart()
    target.chart.restoreSnapshot(JSON.parse(JSON.stringify(snap)))

    expect(target.$all('.lc-series')).toHaveLength(3)
    expect(target.$all('.lc-y-axis')).toHaveLength(2)
    expect(target.$all('.lc-annotation')).toHaveLength(2)
    expect(target.svg().dataset.theme).toBe('dark')
    expect(target.$('.lc-title')!.textContent).toBe('Scenario')
  })

  it('restores into the skeleton state when the snapshot has no data', () => {
    const empty = mountChart()
    const snap = empty.chart.getSnapshot()

    const target = mountChart()
    target.chart.setData(genSeries(5))
    expect(target.$('.lc-skeleton')).toBeNull()

    target.chart.restoreSnapshot(JSON.parse(JSON.stringify(snap)))
    expect(target.$('.lc-skeleton')).not.toBeNull()
    expect(target.$all('.lc-series')).toHaveLength(0)
  })

  it('restores zoom transform state', () => {
    const { chart, svg } = mountChart()
    chart.setData(genSeries(20))
    svg().dispatchEvent(
      new WheelEvent('wheel', { deltaY: -120, clientX: 300, clientY: 150, bubbles: true }),
    )
    const snap = chart.getSnapshot()
    expect(snap.zoom.transform.k).toBeGreaterThan(1)

    const target = mountChart()
    target.chart.restoreSnapshot(JSON.parse(JSON.stringify(snap)))
    expect(target.chart.getSnapshot().zoom.transform.k).toBeCloseTo(snap.zoom.transform.k)
  })

  it('drops snapshot series bound to axes missing from the snapshot onto the first axis', () => {
    const { chart } = mountChart()
    chart.setData(genSeries(3))
    const snap = JSON.parse(JSON.stringify(chart.getSnapshot())) as ReturnType<
      typeof chart.getSnapshot
    >
    snap.series[0]!.axisId = 'ghost-axis'
    expect(() => chart.restoreSnapshot(snap)).not.toThrow()
    expect(chart.getSnapshot().series[0]!.axisId).toBe('default')
  })
})
