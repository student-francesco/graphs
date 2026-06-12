import { describe, expect, it } from 'vitest'
import { genSeries, mountChart, normalizePath } from './helpers.ts'

describe('initial mount', () => {
  it('renders skeleton, no series content, before any data arrives', () => {
    const { $all, $, svg } = mountChart()
    expect($('.lc-skeleton')).not.toBeNull()
    expect($('.lc-skeleton-defs')).not.toBeNull()
    expect($all('.lc-series')).toHaveLength(0)
    expect(svg().dataset.theme).toBe('light')
    expect(svg().getAttribute('role')).toBe('img')
    expect(svg().getAttribute('aria-label')).toBe('Line chart')
  })

  it('creates main svg, overlay svg, and blur div in the container', () => {
    const { container } = mountChart()
    expect(container.querySelectorAll('svg')).toHaveLength(2)
    expect(container.querySelector('.lc-inner')).not.toBeNull()
    expect(container.querySelector('.lc-axis-overlay')).not.toBeNull()
    // exactly one plain positioning div for the left blur
    const divs = Array.from(container.children).filter(c => c.tagName === 'DIV')
    expect(divs).toHaveLength(1)
  })

  it('throws for an unknown container id', async () => {
    const { createLineChart } = await import('../src/lib/index.ts')
    expect(() => createLineChart('no-such-element')).toThrow(/no element with id/)
  })
})

describe('setData structure', () => {
  it('removes the skeleton and renders one series group with line, dots, ticks, grid', () => {
    const { chart, $all, $ } = mountChart()
    chart.setData(genSeries(10))

    expect($('.lc-skeleton')).toBeNull()
    expect($all('.lc-series')).toHaveLength(1)
    expect($('.lc-series')!.getAttribute('data-id')).toBe('default')

    const line = $('.lc-line') as SVGPathElement
    expect(line).not.toBeNull()
    expect(line.getAttribute('fill')).toBe('none')
    expect(line.getAttribute('stroke')).toBe('#4f46e5')
    expect(line.getAttribute('stroke-width')).toBe('2')

    expect($all('.lc-dot')).toHaveLength(10)
    expect($all('.lc-x-tick').length).toBeGreaterThan(0)
    expect($('.lc-grid-y')).not.toBeNull()
    expect($('.lc-grid-x')).not.toBeNull()
    expect($('.lc-x-axis-line')).not.toBeNull()
    expect($all('.lc-y-axis')).toHaveLength(1)
  })

  it('nests content correctly: chart-area > scroll-container > series', () => {
    const { chart, $ } = mountChart()
    chart.setData(genSeries(5))

    const chartArea = $('.lc-chart-area')!
    expect(chartArea.getAttribute('clip-path')).toMatch(/^url\(#lc-clip-/)
    expect(chartArea.getAttribute('mask')).toMatch(/^url\(#lc-fade-mask-/)
    const scroll = chartArea.querySelector('.lc-scroll-container')!
    expect(scroll).not.toBeNull()
    expect(scroll.querySelector('.lc-series')).not.toBeNull()
    // annotations layer is a sibling of the scroll container, hover zones live inside it
    expect(scroll.querySelector('.lc-hover-zones')).not.toBeNull()
  })

  it('renders a stable path d for fixed input (golden)', () => {
    const { chart, $ } = mountChart()
    chart.setData(genSeries(5))
    const d = normalizePath(($('.lc-line') as SVGPathElement).getAttribute('d'))
    expect(d).toMatchSnapshot()
  })

  it('dots carry theme-dependent border and resolved fill', () => {
    const { chart, $all } = mountChart()
    chart.setData(genSeries(3))
    for (const dot of $all('.lc-dot')) {
      expect(dot.getAttribute('fill')).toBe('#4f46e5')
      expect(dot.getAttribute('stroke')).toBe('#fff')
      expect(dot.getAttribute('r')).toBe('4')
      expect(dot.getAttribute('stroke-width')).toBe('2')
    }
  })

  it('dotRadius 0 renders no dots', () => {
    const { chart, $all } = mountChart({ dotRadius: 0 })
    chart.setData(genSeries(6))
    expect($all('.lc-dot')).toHaveLength(0)
    expect($all('.lc-line')).toHaveLength(1)
  })

  it('value labels render when showLabels is on, excluding none for plain data', () => {
    const { chart, $all } = mountChart({ showLabels: true })
    chart.setData(genSeries(4))
    const labels = $all('.lc-label')
    expect(labels).toHaveLength(4)
    // default format falls back to tooltipValueFormat ('.2f')
    expect(labels[0]!.textContent).toMatch(/^\d+\.\d{2}$/)
  })

  it('setData with a record routes to per-series ingestion', () => {
    const { chart, $all } = mountChart()
    chart.setData({ a: genSeries(3), b: genSeries(4) })
    const groups = $all('.lc-series').map(g => g.getAttribute('data-id'))
    expect(groups).toContain('a')
    expect(groups).toContain('b')
  })
})

describe('theme and chrome', () => {
  it('updateSettings({theme}) flips the svg dataset and dot borders', () => {
    const { chart, svg, $all } = mountChart()
    chart.setData(genSeries(3))
    chart.updateSettings({ theme: 'dark' })
    expect(svg().dataset.theme).toBe('dark')
    for (const dot of $all('.lc-dot')) {
      expect(dot.getAttribute('stroke')).toBe('#1a1815')
    }
  })

  it('title, x label, and y label render with reserved margins and disappear when cleared', () => {
    const { chart, $ } = mountChart()
    chart.setData(genSeries(3))
    chart.updateSettings({ title: 'My Chart', xLabel: 'Time', yLabel: 'Value' })

    expect($('.lc-title')!.textContent).toBe('My Chart')
    expect($('.lc-x-label')!.textContent).toBe('Time')
    expect($('.lc-y-label')!.textContent).toBe('Value')

    chart.updateSettings({ title: null, xLabel: null, yLabel: null })
    expect($('.lc-title')).toBeNull()
    expect($('.lc-x-label')).toBeNull()
    expect($('.lc-y-label')).toBeNull()
  })

  it('title renders even with no data (skeleton state)', () => {
    const { chart, $ } = mountChart({ title: 'Early' })
    expect($('.lc-title')!.textContent).toBe('Early')
    expect($('.lc-skeleton')).not.toBeNull()
    void chart
  })

  it('grid can be toggled off per chart', () => {
    const { chart, $ } = mountChart()
    chart.setData(genSeries(5))
    expect($('.lc-grid-y')).not.toBeNull()
    chart.updateSettings({ showGrid: false })
    expect($('.lc-grid-y')).toBeNull()
    expect($('.lc-grid-x')).toBeNull()
  })

  it('curveType change rewrites the path geometry', () => {
    const { chart, $ } = mountChart()
    chart.setData(genSeries(6))
    const before = ($('.lc-line') as SVGPathElement).getAttribute('d')
    chart.updateSettings({ curveType: 'step' })
    const after = ($('.lc-line') as SVGPathElement).getAttribute('d')
    expect(after).not.toBe(before)
  })
})
