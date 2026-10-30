import { describe, expect, it } from 'vitest'
import { formatTimeTicks, timeResolution } from '@/lib/modules/axes-render.ts'
import { genSeries, mountChart } from './helpers.ts'

// Local-time constructors: labels are formatted in local time, like d3's default.
const at = (...args: [number, number, number?, number?, number?, number?, number?]) =>
  new Date(...(args as [number, number]))

describe('timeResolution', () => {
  it('picks the finest unit any tick uses', () => {
    expect(timeResolution([at(2026, 0, 1), at(2027, 0, 1)])).toBe('year')
    expect(timeResolution([at(2026, 0, 1), at(2026, 3, 1)])).toBe('month')
    expect(timeResolution([at(2026, 9, 1), at(2026, 9, 8)])).toBe('day')
    expect(timeResolution([at(2026, 9, 28, 0), at(2026, 9, 28, 6)])).toBe('minute')
    expect(timeResolution([at(2026, 9, 28, 13, 0, 0), at(2026, 9, 28, 13, 0, 5)])).toBe('second')
    expect(timeResolution([at(2026, 9, 28, 13, 0, 0, 0), at(2026, 9, 28, 13, 0, 0, 500)])).toBe('millisecond')
  })
})

describe('formatTimeTicks', () => {
  it('shows dates at day resolution, with the year on the first tick and year changes', () => {
    expect(formatTimeTicks([at(2026, 11, 30), at(2026, 11, 31), at(2027, 0, 1), at(2027, 0, 2)]))
      .toEqual(['Dec 30, 2026', 'Dec 31', 'Jan 01, 2027', 'Jan 02'])
  })

  it('switches to datetimes when zoomed below a day, printing the date when it changes', () => {
    expect(formatTimeTicks([at(2026, 9, 28, 12), at(2026, 9, 29, 0), at(2026, 9, 29, 12)]))
      .toEqual(['Oct 28 12:00', 'Oct 29 00:00', '12:00'])
  })

  it('adds seconds, then milliseconds, as the zoom deepens', () => {
    expect(formatTimeTicks([at(2026, 9, 28, 13, 0, 0), at(2026, 9, 28, 13, 0, 5)]))
      .toEqual(['Oct 28 13:00:00', '13:00:05'])
    expect(formatTimeTicks([at(2026, 9, 28, 13, 0, 0, 0), at(2026, 9, 28, 13, 0, 0, 20)]))
      .toEqual(['Oct 28 13:00:00.000', '13:00:00.020'])
  })

  it('shows months and years when zoomed far out', () => {
    expect(formatTimeTicks([at(2026, 10, 1), at(2026, 11, 1), at(2027, 0, 1)]))
      .toEqual(['Nov 2026', 'Dec', 'Jan 2027'])
    expect(formatTimeTicks([at(2025, 0, 1), at(2026, 0, 1)])).toEqual(['2025', '2026'])
  })
})

describe('temporal x-axis default labels (public API)', () => {
  const xLabels = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('.lc-x-tick text')).map(t => t.textContent ?? '')

  it('never repeats a label, at any zoom depth', () => {
    const start = at(2026, 9, 28, 13).toISOString()
    for (const stepDays of [1, 1 / 24, 1 / 1440, 1 / 86_400, 1 / 86_400_000]) {
      const { chart, container } = mountChart()
      chart.setData(genSeries(20, { start, stepDays }))
      const labels = xLabels(container)
      expect(labels.length).toBeGreaterThan(1)
      expect(new Set(labels).size).toBe(labels.length)
      chart.destroy()
    }
  })

  it('labels a millisecond-scale domain with millisecond precision', () => {
    const { chart, container } = mountChart()
    chart.setData(genSeries(20, { start: at(2026, 9, 28, 13).toISOString(), stepDays: 1 / 86_400_000 }))
    for (const label of xLabels(container)) expect(label).toMatch(/\d{2}:\d{2}:\d{2}\.\d{3}$/)
  })
})
