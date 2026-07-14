import { describe, expect, it, vi } from 'vitest'
import { mountNumericChart } from './helpers.ts'

describe('numeric chart x-axis scale type', () => {
  it('defaults to a linear x scale', () => {
    const { chart, container } = mountNumericChart()
    chart.setData(Array.from({ length: 5 }, (_, i) => ({ x: i, y: i })))
    expect(container.querySelector('.lc-line')!.getAttribute('d')).toBeTruthy()
  })

  it('renders positive-domain geometry on a log x scale', () => {
    const { chart, container } = mountNumericChart({ xScaleType: 'log' })
    chart.setData(Array.from({ length: 6 }, (_, i) => ({ x: 10 ** i, y: i })))
    expect(container.querySelector('.lc-line')!.getAttribute('d')).toBeTruthy()
    expect(container.querySelectorAll('.lc-dot')).toHaveLength(6)
  })

  it('clamps a non-positive x domain and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { chart, container } = mountNumericChart({ xScaleType: 'log' })
    chart.setData([
      { x: -5, y: 1 },
      { x: 0, y: 2 },
      { x: 10, y: 3 },
    ])
    expect(container.querySelector('.lc-line')!.getAttribute('d')).toBeTruthy()
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
    expect(logPath).toBeTruthy()
    expect(logPath).not.toBe(linearPath)
  })
})
