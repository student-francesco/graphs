import { afterEach } from 'vitest'
import { createLineChart } from '@/lib/index.ts'
import { createNumericChart } from '@/lib/charts/numeric-line/numeric-line.ts'
import type { ChartSettings, LineChartHandle, RawDataPoint } from '@/lib/index.ts'
import type { NumericChartHandle } from '@/lib/charts/numeric-line/types.ts'

let chartCounter = 0
const cleanups: Array<() => void> = []

export interface Mounted {
  chart: LineChartHandle
  container: HTMLElement
  svg: () => SVGSVGElement
  /** All elements matching a selector across the main svg, overlay svg, and container. */
  $all: (selector: string) => Element[]
  $: (selector: string) => Element | null
}

/**
 * Mounts a chart into a fresh container div. animationDuration defaults to 0 so
 * renders settle synchronously — animation tests override it explicitly.
 * Charts are destroyed and containers removed automatically after each test.
 */
export function mountChart(settings?: Partial<ChartSettings>): Mounted {
  const container = document.createElement('div')
  container.id = `chart-${++chartCounter}`
  document.body.appendChild(container)
  const chart = createLineChart(container.id, { animationDuration: 0, ...settings })
  cleanups.push(() => {
    try {
      chart.destroy()
    } catch {
      // already destroyed by the test itself
    }
    container.remove()
  })
  return {
    chart,
    container,
    svg: () => container.querySelector('svg') as SVGSVGElement,
    $all: (selector: string) => Array.from(container.querySelectorAll(selector)),
    $: (selector: string) => container.querySelector(selector),
  }
}

export interface MountedNumeric {
  chart: NumericChartHandle
  container: HTMLElement
  $all: (selector: string) => Element[]
  $: (selector: string) => Element | null
}

/** Same contract as mountChart, for the numeric (x: number, y: number) chart kind. */
export function mountNumericChart(settings?: Partial<ChartSettings>): MountedNumeric {
  const container = document.createElement('div')
  container.id = `chart-${++chartCounter}`
  document.body.appendChild(container)
  const chart = createNumericChart(container.id, { animationDuration: 0, ...settings })
  cleanups.push(() => {
    try {
      chart.destroy()
    } catch {
      // already destroyed by the test itself
    }
    container.remove()
  })
  return {
    chart,
    container,
    $all: (selector: string) => Array.from(container.querySelectorAll(selector)),
    $: (selector: string) => container.querySelector(selector),
  }
}

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
  // Tooltip divs and download anchors attach to document.body — sweep leftovers.
  document.body.innerHTML = ''
})

/**
 * Deterministic time-series data: daily points on a sine wave (no randomness so
 * path-`d` goldens are stable).
 */
export function genSeries(
  count: number,
  opts: { start?: string; stepDays?: number; base?: number; amplitude?: number } = {},
): RawDataPoint[] {
  const { start = '2024-01-01T00:00:00.000Z', stepDays = 1, base = 50, amplitude = 20 } = opts
  const startMs = new Date(start).getTime()
  const stepMs = stepDays * 86_400_000
  return Array.from({ length: count }, (_, i) => ({
    date: new Date(startMs + i * stepMs).toISOString(),
    value: base + amplitude * Math.sin(i / 3),
  }))
}

/** Let zero-duration d3 transitions (exit fades etc.) run to completion. */
export async function settleTransitions(frames = 3, frameMs = 25): Promise<void> {
  for (let i = 0; i < frames; i++) {
    await new Promise(resolve => setTimeout(resolve, frameMs))
  }
}

/** Drain pending microtasks (async renderAxes with mocked Blazor delegates). */
export async function flushMicrotasks(times = 8): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve()
}

/** Round all numbers in a path `d` string to 2 decimals for stable assertions. */
export function normalizePath(d: string | null | undefined): string {
  if (!d) return ''
  return d.replace(/-?\d+(?:\.\d+)?(?:e-?\d+)?/gi, m => {
    const n = Number(m)
    return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : m
  })
}

export interface MockDelegate {
  invokeMethodAsync: (method: string, ...args: unknown[]) => Promise<string>
  calls: Array<{ method: string; args: unknown[] }>
}

/**
 * Mimics the .NET delegate wrapper Blazor interop hands to the chart: a non-function
 * object exposing invokeMethodAsync('executeDelegate', value, index).
 */
export function makeDelegate(impl?: (value: unknown, index: number) => string): MockDelegate {
  const calls: Array<{ method: string; args: unknown[] }> = []
  return {
    calls,
    invokeMethodAsync: (method: string, ...args: unknown[]) => {
      calls.push({ method, args })
      const index = args[1] as number
      return Promise.resolve(impl ? impl(args[0], index) : `L${index}`)
    },
  }
}

/** v2 snapshot slice access (format: { version: 2, modules: {…} }). */
export function snapshotModules(chart: LineChartHandle): Record<string, unknown> {
  const snap = (chart as unknown as { getSnapshot(): { modules: Record<string, unknown> } }).getSnapshot()
  return snap.modules
}

export function zoomTransform(chart: LineChartHandle): { k: number; x: number; y: number } {
  return (snapshotModules(chart)['zoom'] as { transform: { k: number; x: number; y: number } })
    .transform
}

export function seriesSlices(
  chart: LineChartHandle,
): Array<{ id: string; axisId: string; data: Array<{ date: string; value: number }> }> {
  return (
    snapshotModules(chart)['series'] as {
      series: Array<{ id: string; axisId: string; data: Array<{ date: string; value: number }> }>
    }
  ).series
}

export function makeFailingDelegate(): MockDelegate {
  const calls: Array<{ method: string; args: unknown[] }> = []
  return {
    calls,
    invokeMethodAsync: (method: string, ...args: unknown[]) => {
      calls.push({ method, args })
      return Promise.reject(new Error('interop unavailable'))
    },
  }
}
