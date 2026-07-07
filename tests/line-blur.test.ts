import { describe, expect, it } from 'vitest'
import './helpers.ts'
import { mountChart, genSeries } from './helpers.ts'

/** X-axis line-blur band: .lc-line gets a filter that blurs beneath the baseline. */

function filterIdFrom(attr: string | null): string {
  const m = attr && /^url\(#(.+)\)$/.exec(attr)
  if (!m) throw new Error(`expected a url(#id) filter attribute, got ${String(attr)}`)
  return m[1]!
}

describe('x-axis line blur', () => {
  it('applies a filter to .lc-line by default, referencing a feGaussianBlur sized from settings', () => {
    const { chart, $, container } = mountChart()
    chart.setData(genSeries(10))

    const line = $('.lc-line') as SVGPathElement
    const filterAttr = line.getAttribute('filter')
    expect(filterAttr).toMatch(/^url\(#lc-line-blur-filter-/)

    const filterId = filterIdFrom(filterAttr)
    const filterEl = container.querySelector(`#${filterId}`) as SVGFilterElement
    expect(filterEl).not.toBeNull()

    const blur = filterEl.querySelector('feGaussianBlur') as SVGFEGaussianBlurElement
    expect(blur.getAttribute('stdDeviation')).toBe('4')

    const offset = filterEl.querySelector('feOffset') as SVGFEOffsetElement
    expect(offset).not.toBeNull()
    expect(filterEl.querySelector('feMerge')).not.toBeNull()
  })

  it('disabling xAxisBlurEnabled removes the filter attribute entirely', () => {
    const { chart, $ } = mountChart({ xAxisBlurEnabled: false })
    chart.setData(genSeries(10))
    expect(($('.lc-line') as SVGPathElement).getAttribute('filter')).toBeNull()
  })

  it('re-enabling live restores the filter, and disabling live removes it', () => {
    const { chart, $ } = mountChart()
    chart.setData(genSeries(10))
    expect(($('.lc-line') as SVGPathElement).getAttribute('filter')).not.toBeNull()

    chart.updateSettings({ xAxisBlurEnabled: false })
    expect(($('.lc-line') as SVGPathElement).getAttribute('filter')).toBeNull()

    chart.updateSettings({ xAxisBlurEnabled: true })
    expect(($('.lc-line') as SVGPathElement).getAttribute('filter')).toMatch(/^url\(#lc-line-blur-filter-/)
  })

  it('xAxisBlurStrength drives feGaussianBlur stdDeviation live', () => {
    const { chart, $, container } = mountChart()
    chart.setData(genSeries(10))
    const filterId = filterIdFrom(($('.lc-line') as SVGPathElement).getAttribute('filter'))
    const blur = container.querySelector(`#${filterId} feGaussianBlur`) as SVGFEGaussianBlurElement

    chart.updateSettings({ xAxisBlurStrength: 8 })
    expect(blur.getAttribute('stdDeviation')).toBe('8')
  })

  it('sizes the blurred-band subregion from layout.innerHeight (fixed band height)', () => {
    const { chart, $, container } = mountChart()
    chart.setData(genSeries(10))
    const filterId = filterIdFrom(($('.lc-line') as SVGPathElement).getAttribute('filter'))
    const blur = container.querySelector(`#${filterId} feGaussianBlur`) as SVGFEGaussianBlurElement

    const innerHeight = Number(($('.lc-x-axis-line') as SVGLineElement).getAttribute('y1'))
    expect(Number(blur.getAttribute('y'))).toBeCloseTo(innerHeight, 5)
  })

  it('x-ticks always paint after (on top of) the series layer, independent of the blur setting', () => {
    const { chart, container } = mountChart({ xAxisBlurEnabled: false })
    chart.setData(genSeries(10))

    const seriesLayer = container.querySelector('[data-layer="series"]')!
    const ticksLayer = container.querySelector('[data-layer="x-ticks"]')!
    expect(seriesLayer.parentElement).toBe(ticksLayer.parentElement)

    const position = seriesLayer.compareDocumentPosition(ticksLayer)
    // ticksLayer must follow seriesLayer in document order (DOCUMENT_POSITION_FOLLOWING = 4)
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
