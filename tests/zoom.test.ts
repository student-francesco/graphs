import { describe, expect, it } from 'vitest'
import { genSeries, mountChart } from './helpers.ts'

function wheel(target: Element, deltaY: number): void {
  target.dispatchEvent(
    new WheelEvent('wheel', {
      deltaY,
      clientX: 300,
      clientY: 150,
      bubbles: true,
      cancelable: true,
    }),
  )
}

describe('wheel zoom', () => {
  it('wheel up scales the transform above identity and re-renders', () => {
    const { chart, svg, container } = mountChart()
    chart.setData(genSeries(20))
    const dBefore = container.querySelector('.lc-line')!.getAttribute('d')

    wheel(svg(), -120)

    const snap = chart.getSnapshot()
    expect(snap.zoom.transform.k).toBeGreaterThan(1)
    expect(container.querySelector('.lc-line')!.getAttribute('d')).not.toBe(dBefore)
  })

  it('zoomEnabled:false ignores wheel events', () => {
    const { chart, svg } = mountChart({ zoomEnabled: false })
    chart.setData(genSeries(20))
    wheel(svg(), -120)
    expect(chart.getSnapshot().zoom.transform.k).toBe(1)
  })

  it('zoomEnabled can be toggled at runtime without rebinding', () => {
    const { chart, svg } = mountChart()
    chart.setData(genSeries(20))
    chart.updateSettings({ zoomEnabled: false })
    wheel(svg(), -120)
    expect(chart.getSnapshot().zoom.transform.k).toBe(1)
    chart.updateSettings({ zoomEnabled: true })
    wheel(svg(), -120)
    expect(chart.getSnapshot().zoom.transform.k).toBeGreaterThan(1)
  })

  it('resetZoom returns the transform to identity (instant at duration 0)', () => {
    const { chart, svg } = mountChart()
    chart.setData(genSeries(20))
    wheel(svg(), -120)
    expect(chart.getSnapshot().zoom.transform.k).toBeGreaterThan(1)

    chart.resetZoom()

    const t = chart.getSnapshot().zoom.transform
    expect(t.k).toBe(1)
    expect(t.x).toBe(0)
    expect(t.y).toBe(0)
  })

  it('resetZoom is a no-op when not zoomed', () => {
    const { chart, container } = mountChart()
    chart.setData(genSeries(5))
    const dBefore = container.querySelector('.lc-line')!.getAttribute('d')
    chart.resetZoom()
    expect(container.querySelector('.lc-line')!.getAttribute('d')).toBe(dBefore)
  })

  it('dblclick resets only when zoomed', () => {
    const { chart, svg } = mountChart()
    chart.setData(genSeries(20))
    wheel(svg(), -120)
    expect(chart.getSnapshot().zoom.transform.k).toBeGreaterThan(1)
    svg().dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
    expect(chart.getSnapshot().zoom.transform.k).toBe(1)
  })

  it('zoom math respects zoomScaleExtent updates', () => {
    const { chart, svg } = mountChart({ zoomScaleExtent: [1, 2] })
    chart.setData(genSeries(20))
    for (let i = 0; i < 10; i++) wheel(svg(), -120)
    expect(chart.getSnapshot().zoom.transform.k).toBeLessThanOrEqual(2)
  })

  it('clearData drops zoom state', () => {
    const { chart, svg } = mountChart()
    chart.setData(genSeries(20))
    wheel(svg(), -120)
    chart.clearData()
    expect(chart.getSnapshot().zoom.transform.k).toBe(1)
  })
})
