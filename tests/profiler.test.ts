import { describe, expect, it } from 'vitest'
import { mountChart, genSeries } from './helpers.ts'
import type { LineChartHandle } from '@/lib/index.ts'

interface ProfilerStats {
  passes: number
  prepare: { totalMs: number; steps: number }
  render: { totalMs: number; steps: number }
}

interface ProfiledChart {
  setProfilerEnabled(on: boolean): void
  getProfilerStats(): ProfilerStats
  resetProfiler(): void
}

function profiled(chart: LineChartHandle): ProfiledChart {
  return chart as unknown as ProfiledChart
}

describe('engine profiler', () => {
  it('accumulates nothing while disabled', () => {
    const { chart } = mountChart()
    chart.setData(genSeries(10))
    chart.updateSettings({ lineColor: '#123456' })

    const stats = profiled(chart).getProfilerStats()
    expect(stats.passes).toBe(0)
    expect(stats.prepare.steps).toBe(0)
    expect(stats.render.steps).toBe(0)
    expect(stats.prepare.totalMs).toBe(0)
    expect(stats.render.totalMs).toBe(0)
  })

  it('accumulates prepare and render timings across passes once enabled', () => {
    const { chart } = mountChart()
    profiled(chart).setProfilerEnabled(true)

    chart.setData(genSeries(20))
    chart.updateSettings({ lineColor: '#abcdef' })

    const stats = profiled(chart).getProfilerStats()
    // Two mutating calls, each flushed synchronously, reach the render phase.
    expect(stats.passes).toBe(2)
    // Both phases ran real steps with non-negative accumulated time.
    expect(stats.prepare.steps).toBeGreaterThan(0)
    expect(stats.render.steps).toBeGreaterThan(0)
    expect(stats.prepare.totalMs).toBeGreaterThanOrEqual(0)
    expect(stats.render.totalMs).toBeGreaterThanOrEqual(0)
  })

  it('enabling resets the accumulators so each session starts clean', () => {
    const { chart } = mountChart()
    profiled(chart).setProfilerEnabled(true)
    chart.setData(genSeries(10))
    expect(profiled(chart).getProfilerStats().passes).toBe(1)

    profiled(chart).setProfilerEnabled(false)
    chart.setData(genSeries(10)) // not counted while off
    profiled(chart).setProfilerEnabled(true) // re-enable → reset

    expect(profiled(chart).getProfilerStats().passes).toBe(0)
  })

  it('resetProfiler zeroes counters without disabling', () => {
    const { chart } = mountChart()
    profiled(chart).setProfilerEnabled(true)
    chart.setData(genSeries(10))
    expect(profiled(chart).getProfilerStats().passes).toBe(1)

    profiled(chart).resetProfiler()
    expect(profiled(chart).getProfilerStats().passes).toBe(0)

    // Still enabled — a subsequent pass is counted again.
    chart.updateSettings({ lineColor: '#0f0f0f' })
    expect(profiled(chart).getProfilerStats().passes).toBe(1)
  })
})
