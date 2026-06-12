import { describe, expect, it } from 'vitest'
import { genSeries, mountChart, settleTransitions } from './helpers.ts'

describe('updateData overlap branches', () => {
  it('sufficient overlap keeps the existing path element (morph branch)', () => {
    const { chart, $ } = mountChart()
    chart.setData(genSeries(10))
    const pathBefore = $('.lc-line')

    // slide by 2: 8 of 10 points overlap → ratio 0.8 ≥ 0.3, overlap 8 ≥ 2
    chart.updateData(genSeries(10, { start: '2024-01-03T00:00:00.000Z' }))

    expect($('.lc-line')).toBe(pathBefore)
    expect($('.lc-series [class="lc-dot"], .lc-series .lc-dot')).not.toBeNull()
  })

  it('sufficient overlap keeps dropped points joined as exit-point dots', () => {
    const { chart, $all } = mountChart()
    chart.setData(genSeries(10))
    chart.updateData(genSeries(10, { start: '2024-01-03T00:00:00.000Z' }))
    // The 2 dropped points become pendingExitPoints and stay IN the dot join
    // (they keep the line's left edge continuous under the fade mask) — they are
    // not renamed .lc-dot-exiting until a later render drops them from the join.
    expect($all('.lc-dot')).toHaveLength(12)
    expect($all('.lc-dot-exiting')).toHaveLength(0)
  })

  it('a second slide expels the previous exit points as .lc-dot-exiting', async () => {
    const { chart, $all } = mountChart()
    chart.setData(genSeries(10))
    chart.updateData(genSeries(10, { start: '2024-01-03T00:00:00.000Z' }))
    chart.updateData(genSeries(10, { start: '2024-01-05T00:00:00.000Z' }))
    // join now = 10 new + 2 fresh exits; the 2 OLD exit dots leave the join.
    // At duration 0 the renamed exit dots are removed synchronously.
    expect($all('.lc-dot')).toHaveLength(12)
    expect($all('.lc-dot-exiting')).toHaveLength(0)
    await settleTransitions()
    expect($all('.lc-dot-exiting')).toHaveLength(0)
  })

  it('insufficient overlap rebuilds the line element from scratch (rebirth branch)', () => {
    const { chart, $ } = mountChart()
    chart.setData(genSeries(10))
    const pathBefore = $('.lc-line')

    // disjoint range → overlap 0 → rebirth
    chart.updateData(genSeries(10, { start: '2025-06-01T00:00:00.000Z' }))

    const pathAfter = $('.lc-line')
    expect(pathAfter).not.toBeNull()
    expect(pathAfter).not.toBe(pathBefore)
  })

  it('updateData on an empty chart behaves like setData', () => {
    const { chart, $all, $ } = mountChart()
    chart.updateData(genSeries(5))
    expect($('.lc-skeleton')).toBeNull()
    expect($all('.lc-dot')).toHaveLength(5)
  })
})

describe('append + rolling window', () => {
  it('appendDataPoint adds one dot', () => {
    const { chart, $all } = mountChart()
    chart.setData(genSeries(5))
    chart.appendDataPoint({ date: '2024-02-01T00:00:00.000Z', value: 42 })
    expect($all('.lc-dot')).toHaveLength(6)
  })

  it('appendDataPoints adds many dots in one render', () => {
    const { chart, $all } = mountChart()
    chart.setData(genSeries(5))
    chart.appendDataPoints(genSeries(3, { start: '2024-03-01T00:00:00.000Z' }))
    expect($all('.lc-dot')).toHaveLength(8)
  })

  it('maxDataPoints trims the data from the front; trimmed points linger as exit dots', async () => {
    const { chart, $all } = mountChart({ maxDataPoints: 5 })
    chart.setData(genSeries(5))
    chart.appendDataPoints(genSeries(3, { start: '2024-02-01T00:00:00.000Z' }))
    await settleTransitions()
    // 5 live + 3 trimmed exit points still joined for visual continuity
    expect($all('.lc-dot')).toHaveLength(8)
    const snap = chart.getSnapshot()
    expect(snap.series.find(s => s.id === 'default')!.data).toHaveLength(5)
  })

  it('append on an empty default series renders without dismissing skeleton rules', () => {
    const { chart, $all, $ } = mountChart()
    chart.appendDataPoint({ date: '2024-01-01T00:00:00.000Z', value: 1 })
    // single-series append path does NOT dismiss the skeleton (only setData/setSeriesData do)
    expect($all('.lc-dot')).toHaveLength(1)
    expect($('.lc-skeleton')).not.toBeNull()
  })

  it('rejects invalid dates loudly', () => {
    const { chart } = mountChart()
    expect(() => chart.setData([{ date: 'garbage', value: 1 }])).toThrow(/invalid date/)
  })
})

describe('clearData and destroy', () => {
  it('clearData returns to skeleton state and wipes series content', () => {
    const { chart, $all, $ } = mountChart()
    chart.setData(genSeries(8))
    expect($('.lc-skeleton')).toBeNull()

    chart.clearData()

    expect($('.lc-skeleton')).not.toBeNull()
    expect($all('.lc-series')).toHaveLength(0)
    expect($all('.lc-dot')).toHaveLength(0)

    // data can come back afterwards
    chart.setData(genSeries(3))
    expect($all('.lc-dot')).toHaveLength(3)
    expect($('.lc-skeleton')).toBeNull()
  })

  it('clearData keeps non-default series removed', () => {
    const { chart, $all } = mountChart()
    chart.setData(genSeries(4))
    chart.addSeries('extra')
    chart.setSeriesData('extra', genSeries(4))
    chart.clearData()
    chart.setData(genSeries(2))
    expect($all('.lc-series')).toHaveLength(1)
  })

  it('destroy removes all chart DOM and makes further calls throw', () => {
    const { chart, container } = mountChart()
    chart.setData(genSeries(3))
    chart.destroy()
    expect(container.querySelectorAll('svg')).toHaveLength(0)
    expect(Array.from(container.children).filter(c => c.tagName === 'DIV')).toHaveLength(0)
    expect(() => chart.setData(genSeries(1))).toThrow(/destroyed/)
    // double destroy is a no-op
    expect(() => chart.destroy()).not.toThrow()
  })

  it('window mouse events after destroy do not throw (brush listeners dropped)', () => {
    const { chart } = mountChart()
    chart.setData(genSeries(3))
    chart.destroy()
    expect(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: 10 }))
      window.dispatchEvent(new MouseEvent('mouseup'))
    }).not.toThrow()
  })
})

describe('fast paths', () => {
  it('setLineColor repaints line and dots of cascade-following series only', () => {
    const { chart, container } = mountChart()
    chart.setData(genSeries(3))
    chart.addSeries('fixed', { color: '#000000' })
    chart.setSeriesData('fixed', genSeries(3))

    chart.setLineColor('#ff0000')

    const defaultG = container.querySelector('.lc-series[data-id="default"]')!
    const fixedG = container.querySelector('.lc-series[data-id="fixed"]')!
    expect(defaultG.querySelector('.lc-line')!.getAttribute('stroke')).toBe('#ff0000')
    expect(defaultG.querySelector('.lc-dot')!.getAttribute('fill')).toBe('#ff0000')
    expect(fixedG.querySelector('.lc-line')!.getAttribute('stroke')).toBe('#000000')
  })

  it('setLineWeight repaints stroke width without touching explicit overrides', () => {
    const { chart, container } = mountChart()
    chart.setData(genSeries(3))
    chart.addSeries('thick', { lineWeight: 9 })
    chart.setSeriesData('thick', genSeries(3))

    chart.setLineWeight(5)

    expect(
      container
        .querySelector('.lc-series[data-id="default"] .lc-line')!
        .getAttribute('stroke-width'),
    ).toBe('5')
    expect(
      container.querySelector('.lc-series[data-id="thick"] .lc-line')!.getAttribute('stroke-width'),
    ).toBe('9')
  })

  it('setSeriesColor sets an explicit override that survives setLineColor', () => {
    const { chart, container } = mountChart()
    chart.setData(genSeries(3))
    chart.setSeriesColor('default', '#00ff00')
    chart.setLineColor('#0000ff')
    expect(
      container.querySelector('.lc-series[data-id="default"] .lc-line')!.getAttribute('stroke'),
    ).toBe('#00ff00')
  })
})

describe('resize', () => {
  it('resize updates both viewBoxes and re-renders', async () => {
    const { chart, container, svg } = mountChart()
    chart.setData(genSeries(5))
    const { triggerResize } = await import('./setup.ts')
    triggerResize(container, 800, 400)
    expect(svg().getAttribute('viewBox')).toBe('0 0 800 400')
    const overlay = container.querySelectorAll('svg')[1]!
    expect(overlay.getAttribute('viewBox')).toBe('0 0 800 400')
  })
})
