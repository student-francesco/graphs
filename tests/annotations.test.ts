import { describe, expect, it } from 'vitest'
import { genSeries, mountChart } from './helpers.ts'

describe('annotations', () => {
  it('horizontal line spans the full inner width with default styling', () => {
    const { chart, $ } = mountChart()
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

  it('vertical line spans the full inner height at a fixed date', () => {
    const { chart, $ } = mountChart()
    chart.setData(genSeries(5))
    chart.setVerticalLine('event', '2024-01-03T00:00:00.000Z', 'Event')

    const line = $('.lc-annotation line')!
    expect(line.getAttribute('x1')).toBe(line.getAttribute('x2'))
    expect(line.getAttribute('y1')).toBe('0')
    expect(Number(line.getAttribute('y2'))).toBeGreaterThan(0)
  })

  it('annotation style settings override the defaults', () => {
    const { chart, $ } = mountChart()
    chart.setData(genSeries(5))
    chart.setHorizontalLine('styled', 50, 'S', { color: '#112233', thickness: 3, dashed: false })
    const line = $('.lc-annotation line')!
    expect(line.getAttribute('stroke')).toBe('#112233')
    expect(line.getAttribute('stroke-width')).toBe('3')
    expect(line.getAttribute('stroke-dasharray')).toBeNull()
  })

  it('annotations render in the chart area, outside the scroll container', () => {
    const { chart, $ } = mountChart()
    chart.setData(genSeries(5))
    chart.setHorizontalLine('h', 50, 'H')
    const layer = $('.lc-annotations')!
    expect(layer.parentElement!.classList.contains('lc-chart-area')).toBe(true)
    expect(layer.closest('.lc-scroll-container')).toBeNull()
  })

  it('a horizontal annotation widens its axis auto-extent like a data point', () => {
    const { chart, container } = mountChart()
    chart.setData(genSeries(5, { base: 50, amplitude: 5 }))
    const before = container.querySelector('.lc-line')!.getAttribute('d')
    chart.setHorizontalLine('far', 500, 'Way above the data')
    const after = container.querySelector('.lc-line')!.getAttribute('d')
    expect(after).not.toBe(before)
  })

  it('setting the same name twice replaces the annotation', () => {
    const { chart, $all, $ } = mountChart()
    chart.setData(genSeries(5))
    chart.setHorizontalLine('x', 40, 'First')
    chart.setHorizontalLine('x', 60, 'Second')
    expect($all('.lc-annotation')).toHaveLength(1)
    expect($('.lc-annotation title')!.textContent).toBe('Second')
  })

  it('removeAnnotation and clearAnnotations remove elements', () => {
    const { chart, $all } = mountChart()
    chart.setData(genSeries(5))
    chart.setHorizontalLine('a', 40, 'A')
    chart.setVerticalLine('b', '2024-01-02T00:00:00.000Z', 'B')
    expect($all('.lc-annotation')).toHaveLength(2)

    chart.removeAnnotation('a')
    expect($all('.lc-annotation')).toHaveLength(1)

    chart.clearAnnotations()
    expect($all('.lc-annotation')).toHaveLength(0)
  })

  it('removing an axis cascade-deletes its horizontal annotations but keeps verticals', () => {
    const { chart, $all } = mountChart()
    chart.setData(genSeries(5))
    chart.createAxis('temp')
    chart.setHorizontalLine('bound', 10, 'Bound to temp', { axis: 'temp' })
    chart.setVerticalLine('free', '2024-01-02T00:00:00.000Z', 'Axis-agnostic')
    expect($all('.lc-annotation')).toHaveLength(2)

    chart.removeAxis('temp')

    const remaining = $all('.lc-annotation')
    expect(remaining).toHaveLength(1)
    expect(remaining[0]!.getAttribute('data-id')).toBe('free')
  })

  it('setVerticalLine rejects invalid dates', () => {
    const { chart } = mountChart()
    chart.setData(genSeries(3))
    expect(() => chart.setVerticalLine('bad', 'not-a-date', 'X')).toThrow(/invalid date/)
  })

  it('annotations created before data render once data arrives', () => {
    const { chart, $all } = mountChart()
    chart.setHorizontalLine('early', 42, 'Early bird')
    expect($all('.lc-annotation')).toHaveLength(0) // no render without data
    chart.setData(genSeries(5))
    expect($all('.lc-annotation')).toHaveLength(1)
  })
})
