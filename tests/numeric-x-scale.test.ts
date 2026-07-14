import { describe, expect, it, vi } from 'vitest'
import { mountNumericChart } from './helpers.ts'

/** A path `d` string with an embedded NaN/Infinity is invalid SVG — the browser
 *  drops the WHOLE path silently. `.toBeTruthy()` doesn't catch this since the
 *  string is still non-empty; assert its numeric tokens are all finite instead. */
function expectFinitePath(d: string | null): void {
  expect(d).toBeTruthy()
  const tokens = d!.match(/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|NaN|Infinity|-Infinity/g) ?? []
  expect(tokens.length).toBeGreaterThan(0)
  for (const t of tokens) expect(Number.isFinite(Number(t))).toBe(true)
}

describe('numeric chart x-axis scale type', () => {
  it('defaults to a linear x scale', () => {
    const { chart, container } = mountNumericChart()
    chart.setData(Array.from({ length: 5 }, (_, i) => ({ x: i, y: i })))
    expectFinitePath(container.querySelector('.lc-line')!.getAttribute('d'))
  })

  it('renders positive-domain geometry on a log x scale', () => {
    const { chart, container } = mountNumericChart({ xScaleType: 'log' })
    chart.setData(Array.from({ length: 6 }, (_, i) => ({ x: 10 ** i, y: i })))
    expectFinitePath(container.querySelector('.lc-line')!.getAttribute('d'))
    expect(container.querySelectorAll('.lc-dot')).toHaveLength(6)
  })

  // Regression: the harness's default numeric series starts at x=0
  // (generateNumericSeries's startX default). d3.scaleLog computes Math.log(x)
  // on the raw input regardless of domain clamping, so x=0 (or any x<=0) used
  // to evaluate to NaN and blank out the ENTIRE line, not just that point.
  it('does not blank the line when a point sits at x=0', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { chart, container } = mountNumericChart({ xScaleType: 'log' })
    chart.setData(Array.from({ length: 10 }, (_, i) => ({ x: i, y: 100 + i })))
    expectFinitePath(container.querySelector('.lc-line')!.getAttribute('d'))
    expect(container.querySelectorAll('.lc-dot')).toHaveLength(10)
    warn.mockRestore()
  })

  it('clamps a non-positive x domain, warns, and still renders a valid path', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { chart, container } = mountNumericChart({ xScaleType: 'log' })
    chart.setData([
      { x: -5, y: 1 },
      { x: 0, y: 2 },
      { x: 10, y: 3 },
    ])
    expectFinitePath(container.querySelector('.lc-line')!.getAttribute('d'))
    expect(warn).toHaveBeenCalledWith(
      'LineChart: x log scale domain clamped to positive values',
      expect.anything(),
    )
    warn.mockRestore()
  })

  it('updateSettings toggles between linear and log without breaking rendering', () => {
    const { chart, container } = mountNumericChart()
    chart.setData(Array.from({ length: 5 }, (_, i) => ({ x: i + 1, y: i + 1 })))
    const linearPath = container.querySelector('.lc-line')!.getAttribute('d')
    chart.updateSettings({ xScaleType: 'log' })
    const logPath = container.querySelector('.lc-line')!.getAttribute('d')
    expectFinitePath(logPath)
    expect(logPath).not.toBe(linearPath)
  })
})
