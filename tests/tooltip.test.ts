import { describe, expect, it } from 'vitest'
import { genSeries, mountChart } from './helpers.ts'

function tooltipEl(): HTMLElement | null {
  return document.body.querySelector('[role="tooltip"]')
}

describe('tooltip', () => {
  it('creates one hover zone per raw data point', () => {
    const { chart, $all } = mountChart()
    chart.setData(genSeries(7))
    expect($all('.lc-hover-zone')).toHaveLength(7)
  })

  it('hover zones cover all series, sized to max(dotRadius, 8)', () => {
    const { chart, $all } = mountChart({ dotRadius: 12 })
    chart.setData(genSeries(3))
    chart.addSeries('b')
    chart.setSeriesData('b', genSeries(4))
    const zones = $all('.lc-hover-zone')
    expect(zones).toHaveLength(7)
    for (const z of zones) expect(z.getAttribute('r')).toBe('12')
  })

  it('appends the tooltip div to document.body once data arrives', () => {
    const { chart } = mountChart()
    expect(tooltipEl()).toBeNull()
    chart.setData(genSeries(3))
    expect(tooltipEl()).not.toBeNull()
  })

  it('mouseenter on a hover zone fills and shows the tooltip with formatted values', () => {
    const { chart, $all } = mountChart()
    chart.setData([{ date: '2024-03-15T00:00:00.000Z', value: 12.3456 }])
    const zone = $all('.lc-hover-zone')[0]!
    zone.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, clientX: 50, clientY: 50 }))

    const tip = tooltipEl()!
    expect(tip.style.opacity).toBe('1')
    expect(tip.innerHTML).toContain('Mar 15, 2024')
    expect(tip.innerHTML).toContain('12.35')
    // single series → no series name block
    expect(tip.innerHTML).not.toContain('default')

    zone.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }))
    expect(tip.style.opacity).toBe('0')
  })

  it('shows the series name only when more than one series exists', () => {
    const { chart, container } = mountChart()
    chart.setData(genSeries(2))
    chart.addSeries('beta')
    chart.setSeriesData('beta', genSeries(2, { base: 90 }))

    const zone = container.querySelector('.lc-hover-zone')!
    zone.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, clientX: 50, clientY: 50 }))
    expect(tooltipEl()!.innerHTML).toContain('default')
  })

  it('showTooltip:false renders no hover zones and no tooltip div', () => {
    const { chart, $all } = mountChart({ showTooltip: false })
    chart.setData(genSeries(5))
    expect($all('.lc-hover-zone')).toHaveLength(0)
    expect(tooltipEl()).toBeNull()
  })

  it('toggling showTooltip off destroys the tooltip div', () => {
    const { chart } = mountChart()
    chart.setData(genSeries(3))
    expect(tooltipEl()).not.toBeNull()
    chart.updateSettings({ showTooltip: false })
    expect(tooltipEl()).toBeNull()
  })

  it('theme change rebuilds the tooltip with the new palette', () => {
    const { chart } = mountChart()
    chart.setData(genSeries(3))
    const lightBg = tooltipEl()!.style.background
    chart.updateSettings({ theme: 'dark' })
    expect(tooltipEl()!.style.background).not.toBe(lightBg)
  })

  it('respects tooltip format settings', () => {
    const { chart, container } = mountChart({
      tooltipDateFormat: '%Y/%m/%d',
      tooltipValueFormat: '.0f',
    })
    chart.setData([{ date: '2024-03-15T00:00:00.000Z', value: 12.7 }])
    container
      .querySelector('.lc-hover-zone')!
      .dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, clientX: 10, clientY: 10 }))
    expect(tooltipEl()!.innerHTML).toContain('2024/03/15')
    expect(tooltipEl()!.innerHTML).toContain('13')
  })
})
