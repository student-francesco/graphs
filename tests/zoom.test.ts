import { describe, expect, it } from 'vitest'
import { genSeries, mountChart, zoomTransform } from './helpers.ts'

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

    expect(zoomTransform(chart).k).toBeGreaterThan(1)
    expect(container.querySelector('.lc-line')!.getAttribute('d')).not.toBe(dBefore)
  })

  it('zoomEnabled:false ignores wheel events', () => {
    const { chart, svg } = mountChart({ zoomEnabled: false })
    chart.setData(genSeries(20))
    wheel(svg(), -120)
    expect(zoomTransform(chart).k).toBe(1)
  })

  it('zoomEnabled can be toggled at runtime without rebinding', () => {
    const { chart, svg } = mountChart()
    chart.setData(genSeries(20))
    chart.updateSettings({ zoomEnabled: false })
    wheel(svg(), -120)
    expect(zoomTransform(chart).k).toBe(1)
    chart.updateSettings({ zoomEnabled: true })
    wheel(svg(), -120)
    expect(zoomTransform(chart).k).toBeGreaterThan(1)
  })

  it('resetZoom returns the transform to identity (instant at duration 0)', () => {
    const { chart, svg } = mountChart()
    chart.setData(genSeries(20))
    wheel(svg(), -120)
    expect(zoomTransform(chart).k).toBeGreaterThan(1)

    chart.resetZoom()

    expect(zoomTransform(chart)).toEqual({ k: 1, x: 0, y: 0 })
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
    expect(zoomTransform(chart).k).toBeGreaterThan(1)
    svg().dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
    expect(zoomTransform(chart).k).toBe(1)
  })

  it('zoom math respects zoomScaleExtent updates', () => {
    const { chart, svg } = mountChart({ zoomScaleExtent: [1, 2] })
    chart.setData(genSeries(20))
    for (let i = 0; i < 10; i++) wheel(svg(), -120)
    expect(zoomTransform(chart).k).toBeLessThanOrEqual(2)
  })

  it('clearData drops zoom state', () => {
    const { chart, svg } = mountChart()
    chart.setData(genSeries(20))
    wheel(svg(), -120)
    chart.clearData()
    expect(zoomTransform(chart).k).toBe(1)
  })
})
