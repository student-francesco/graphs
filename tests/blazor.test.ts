import { describe, expect, it, vi } from 'vitest'
import type { ChartSettings } from '@/lib/index.ts'
import { flushMicrotasks, genSeries, makeDelegate, makeFailingDelegate, mountChart } from './helpers.ts'

/** The chart treats any non-function formatter object as a .NET delegate wrapper. */
function asXFormatter(delegate: unknown): ChartSettings['xAxisFormatter'] {
  return delegate as ChartSettings['xAxisFormatter']
}

function asYFormatter(delegate: unknown): ChartSettings['yAxisFormatter'] {
  return delegate as ChartSettings['yAxisFormatter']
}

function xTickTexts(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.lc-x-tick text')).map(t => t.textContent ?? '')
}

function yTickTexts(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.lc-y-axis .tick text')).map(
    t => t.textContent ?? '',
  )
}

describe('plain JS formatters', () => {
  it('xAxisFormatter function formats every x tick synchronously', () => {
    const { chart, container } = mountChart({
      xAxisFormatter: (_d: Date, i: number) => `X${i}`,
    })
    chart.setData(genSeries(10))
    const texts = xTickTexts(container)
    expect(texts.length).toBeGreaterThan(0)
    texts.forEach((t, i) => expect(t).toBe(`X${i}`))
  })

  it('yAxisFormatter function formats every y tick synchronously', () => {
    const { chart, container } = mountChart({
      yAxisFormatter: (v: number) => `#${v}`,
    })
    chart.setData(genSeries(10))
    const texts = yTickTexts(container)
    expect(texts.length).toBeGreaterThan(0)
    for (const t of texts) expect(t).toMatch(/^#/)
  })
})

describe('.NET delegate wrappers (Blazor Server)', () => {
  it('invokes the x delegate once per tick with ISO date and index', async () => {
    const delegate = makeDelegate()
    const { chart, container } = mountChart({ xAxisFormatter: asXFormatter(delegate) })
    chart.setData(genSeries(10))
    await flushMicrotasks()

    const tickCount = container.querySelectorAll('.lc-x-tick').length
    expect(delegate.calls.length).toBeGreaterThanOrEqual(tickCount)
    for (const call of delegate.calls) {
      expect(call.method).toBe('executeDelegate')
      expect(typeof call.args[0]).toBe('string') // ISO date string
      expect(typeof call.args[1]).toBe('number') // tick index
      expect(() => new Date(call.args[0] as string)).not.toThrow()
    }
  })

  // Fixed by the module rewrite: labels come from the resolved model for ALL
  // ticks (the monolith overwrote them with the default formatter).
  it('renders the delegate-resolved labels on x ticks', async () => {
    const delegate = makeDelegate()
    const { chart, container } = mountChart({ xAxisFormatter: asXFormatter(delegate) })
    chart.setData(genSeries(10))
    await flushMicrotasks()

    const texts = xTickTexts(container)
    expect(texts.length).toBeGreaterThan(0)
    texts.forEach((t, i) => expect(t).toBe(`L${i}`))
  })

  it('invokes the y delegate per axis tick with the numeric value', async () => {
    const delegate = makeDelegate((value, i) => `Y${i}:${String(value)}`)
    const { chart, container } = mountChart({ yAxisFormatter: asYFormatter(delegate) })
    chart.setData(genSeries(10))
    await flushMicrotasks()

    expect(delegate.calls.length).toBeGreaterThan(0)
    for (const call of delegate.calls) {
      expect(typeof call.args[0]).toBe('number')
    }
    // resolved labels reach the tick text (their indices come from the resolver, see bug below)
    const texts = yTickTexts(container)
    expect(texts.length).toBeGreaterThan(0)
    for (const t of texts) expect(t).toMatch(/^Y\d+:/)
  })

  // Fixed by the module rewrite: labels are resolved for exactly the tick
  // values the rail renders (the monolith mis-indexed when counts differed).
  it('y tick labels correspond to the rendered tick values', async () => {
    const delegate = makeDelegate((value) => `V=${String(value)}`)
    const { chart, container } = mountChart({ yAxisFormatter: asYFormatter(delegate) })
    chart.setData(genSeries(10))
    await flushMicrotasks()

    const ticks = Array.from(container.querySelectorAll('.lc-y-axis .tick'))
    expect(ticks.length).toBeGreaterThan(0)
    for (const tick of ticks) {
      const datum = (tick as SVGGElement & { __data__?: number }).__data__
      expect(tick.querySelector('text')!.textContent).toBe(`V=${String(datum)}`)
    }
  })

  it('falls back to the default formatter and warns when x interop rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const delegate = makeFailingDelegate()
    const { chart, container } = mountChart({ xAxisFormatter: asXFormatter(delegate) })

    expect(() => chart.setData(genSeries(10))).not.toThrow()
    await flushMicrotasks()

    expect(warn).toHaveBeenCalledWith('Failed to invoke formatter from Blazor', expect.anything())
    const texts = xTickTexts(container)
    expect(texts.length).toBeGreaterThan(0)
    for (const t of texts) expect(t).not.toBe('')
    warn.mockRestore()
  })

  it('falls back to the default formatter and warns when y interop rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const delegate = makeFailingDelegate()
    const { chart, container } = mountChart({ yAxisFormatter: asYFormatter(delegate) })

    expect(() => chart.setData(genSeries(10))).not.toThrow()
    await flushMicrotasks()

    expect(warn).toHaveBeenCalled()
    const texts = yTickTexts(container)
    expect(texts.length).toBeGreaterThan(0)
    for (const t of texts) expect(t).not.toBe('')
    warn.mockRestore()
  })
})
