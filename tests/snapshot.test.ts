import { describe, expect, it } from 'vitest'
import { genSeries, mountChart, seriesSlices, snapshotModules } from './helpers.ts'

/**
 * Snapshot format v2 (BREAKING vs 0.2.x, per plan — no v1 reader):
 * { version: 2, modules: { settings, axes, series, annotations, zoom } }.
 * Each module captures and restores its own slice.
 */

interface SnapshotV2 {
  version: 2
  modules: Record<string, unknown>
}

function getSnapshot(chart: ReturnType<typeof mountChart>['chart']): SnapshotV2 {
  return (chart as unknown as { getSnapshot(): SnapshotV2 }).getSnapshot()
}

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

describe('getSnapshot (v2)', () => {
  it('captures the full scenario shape (golden)', () => {
    const { chart } = buildScenario()
    expect(getSnapshot(chart)).toMatchSnapshot()
  })

  it('is versioned with per-module slices', () => {
    const { chart } = buildScenario()
    const snap = getSnapshot(chart)
    expect(snap.version).toBe(2)
    expect(Object.keys(snap.modules).sort()).toEqual([
      'annotations',
      'axes',
      'series',
      'settings',
      'zoom',
    ])
  })

  it('strips function-valued formatters from the settings slice', () => {
    const { chart } = mountChart({ xAxisFormatter: () => 'tick' })
    chart.setData(genSeries(3))
    const settings = snapshotModules(chart)['settings'] as Record<string, unknown>
    expect('xAxisFormatter' in settings).toBe(false)
    expect('yAxisFormatter' in settings).toBe(false)
  })

  it('serializes dates as ISO strings', () => {
    const { chart } = mountChart()
    chart.setData(genSeries(2))
    expect(seriesSlices(chart)[0]!.data[0]!.date).toBe('2024-01-01T00:00:00.000Z')
  })
})

describe('restoreSnapshot (v2)', () => {
  it('round-trips: restore(getSnapshot()) yields a deep-equal snapshot', () => {
    const { chart } = buildScenario()
    const snap = getSnapshot(chart)
    chart.restoreSnapshot(JSON.parse(JSON.stringify(snap)))
    expect(JSON.parse(JSON.stringify(getSnapshot(chart)))).toEqual(
      JSON.parse(JSON.stringify(snap)),
    )
  })

  it('rebuilds the DOM to match the restored state', () => {
    const source = buildScenario()
    const snap = getSnapshot(source.chart)

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
    const snap = getSnapshot(empty.chart)

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
    const snap = getSnapshot(chart)
    const zoom = snap.modules['zoom'] as { transform: { k: number } }
    expect(zoom.transform.k).toBeGreaterThan(1)

    const target = mountChart()
    target.chart.restoreSnapshot(JSON.parse(JSON.stringify(snap)))
    const restored = snapshotModules(target.chart)['zoom'] as { transform: { k: number } }
    expect(restored.transform.k).toBeCloseTo(zoom.transform.k)
  })

  it('drops snapshot series bound to missing axes onto the first axis', () => {
    const { chart } = mountChart()
    chart.setData(genSeries(3))
    const snap = JSON.parse(JSON.stringify(getSnapshot(chart))) as SnapshotV2
    const series = snap.modules['series'] as { series: Array<{ axisId: string }> }
    series.series[0]!.axisId = 'ghost-axis'
    expect(() => chart.restoreSnapshot(snap as never)).not.toThrow()
    expect(seriesSlices(chart)[0]!.axisId).toBe('default')
  })

  it('rejects pre-v2 snapshots with a clear error', () => {
    const { chart } = mountChart()
    expect(() =>
      chart.restoreSnapshot({ settings: {}, axes: [], series: [] } as never),
    ).toThrow(/version/)
  })
})
