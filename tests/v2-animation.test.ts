import { afterEach, describe, expect, it } from 'vitest'
import { createLineChart } from '../src/lib/index.ts'
import type { ChartSettings, LineChartHandle } from '../src/lib/index.ts'
import { genSeries } from './helpers.ts'

/** v2 (module engine) — animation modes + transition scroll choreography. */

const DURATION = 60

let v2Counter = 400
const cleanups: Array<() => void> = []

function mountV2(settings?: Partial<ChartSettings>): {
  chart: LineChartHandle
  container: HTMLElement
  $: (sel: string) => Element | null
  $all: (sel: string) => Element[]
} {
  const container = document.createElement('div')
  container.id = `v2-anim-${++v2Counter}`
  document.body.appendChild(container)
  const chart = createLineChart(container.id, { animationDuration: 0, ...settings })
  cleanups.push(() => {
    try {
      chart.destroy()
    } catch {
      // destroyed by the test
    }
    container.remove()
  })
  return {
    chart,
    container,
    $: sel => container.querySelector(sel),
    $all: sel => Array.from(container.querySelectorAll(sel)),
  }
}

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
  document.body.innerHTML = ''
})

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
}

function parseTranslateX(transform: string | null): number {
  const m = /translate\(\s*(-?[\d.e]+)/.exec(transform ?? '')
  return m ? parseFloat(m[1]!) : 0
}

describe('v2 drawOn', () => {
  it('reveals the path via stroke-dasharray, then clears it', async () => {
    const { chart, $ } = mountV2({ animationDuration: DURATION })
    chart.setData(genSeries(8))

    const path = $('.lc-line') as SVGPathElement
    expect(path.getAttribute('stroke-dasharray')).toBe('100 100')
    expect(Number(path.getAttribute('stroke-dashoffset'))).toBeGreaterThan(0)

    await sleep(DURATION * 3)
    expect(path.getAttribute('stroke-dasharray')).toBeNull()
    expect(path.getAttribute('stroke-dashoffset')).toBeNull()
  })

  it('entering x ticks fade in when animationDuration > 0', async () => {
    const { chart, $all } = mountV2({ animationDuration: DURATION })
    chart.setData(genSeries(8))
    const tick = $all('.lc-x-tick')[0] as SVGGElement
    expect(tick.style.opacity).toBe('0')
    await sleep(350)
    expect(tick.style.opacity === '' || tick.style.opacity === '1').toBe(true)
  })
})

describe('v2 morph', () => {
  it('keeps the path element; dropped points stay joined as exit-point dots', async () => {
    const { chart, $, $all } = mountV2({ animationDuration: DURATION })
    chart.setData(genSeries(10))
    await sleep(DURATION * 3)

    const pathBefore = $('.lc-line')
    chart.updateData(genSeries(10, { start: '2024-01-03T00:00:00.000Z' }))

    expect($('.lc-line')).toBe(pathBefore)
    expect($all('.lc-dot')).toHaveLength(12)
    expect($all('.lc-dot-exiting')).toHaveLength(0)
    await sleep(DURATION * 4)
  })

  it('a second slide expels stale exit points as fading .lc-dot-exiting', async () => {
    const { chart, $all } = mountV2({ animationDuration: DURATION })
    chart.setData(genSeries(10))
    await sleep(DURATION * 3)
    chart.updateData(genSeries(10, { start: '2024-01-03T00:00:00.000Z' }))
    await sleep(DURATION * 4)

    chart.updateData(genSeries(10, { start: '2024-01-05T00:00:00.000Z' }))
    expect($all('.lc-dot-exiting').length).toBeGreaterThan(0)

    await sleep(DURATION * 4)
    expect($all('.lc-dot-exiting')).toHaveLength(0)
  })
})

describe('v2 transition (scroll choreography)', () => {
  it('pre-positions the scroll container, then animates back to the origin', async () => {
    const { chart, $ } = mountV2({
      animationDuration: DURATION,
      updateDataAnimation: 'transition',
    })
    chart.setData(genSeries(10))
    await sleep(DURATION * 3)

    chart.updateData(genSeries(10, { start: '2024-01-03T00:00:00.000Z' }))

    const scroll = $('.lc-scroll-container')!
    const startX = parseTranslateX(scroll.getAttribute('transform'))
    expect(startX).toBeGreaterThan(0.5)

    await sleep(DURATION * 4)
    expect(Math.abs(parseTranslateX(scroll.getAttribute('transform')))).toBeLessThan(0.01)
  })

  it('content snaps to final coordinates while the container carries the motion', async () => {
    const { chart, container } = mountV2({
      animationDuration: DURATION,
      updateDataAnimation: 'transition',
    })
    chart.setData(genSeries(10))
    await sleep(DURATION * 3)

    chart.updateData(genSeries(10, { start: '2024-01-03T00:00:00.000Z' }))
    const d = container.querySelector('.lc-line')!.getAttribute('d')!
    expect(d.length).toBeGreaterThan(0)
    await sleep(DURATION * 4)
    expect(container.querySelector('.lc-line')!.getAttribute('d')).toBe(d)
  })

  it('exiting elements are reshifted by the scroll delta and marked', async () => {
    const { chart, $, $all } = mountV2({
      animationDuration: DURATION,
      updateDataAnimation: 'transition',
    })
    chart.setData(genSeries(10))
    await sleep(DURATION * 3)
    chart.updateData(genSeries(10, { start: '2024-01-03T00:00:00.000Z' }))
    await sleep(DURATION * 4)

    // second slide expels the previous exit points mid-scroll
    chart.updateData(genSeries(10, { start: '2024-01-05T00:00:00.000Z' }))
    const exiting = $all('.lc-dot-exiting')
    expect(exiting.length).toBeGreaterThan(0)
    for (const el of exiting) {
      expect(el.hasAttribute('data-lc-exiting')).toBe(true)
    }
    const startX = parseTranslateX($('.lc-scroll-container')!.getAttribute('transform'))
    expect(startX).toBeGreaterThan(0.5)

    await sleep(DURATION * 4)
    expect($all('.lc-dot-exiting')).toHaveLength(0)
  })

  it('non-animated renders reset any lingering scroll transform', async () => {
    const { chart, $ } = mountV2({
      animationDuration: DURATION,
      updateDataAnimation: 'transition',
    })
    chart.setData(genSeries(10))
    await sleep(DURATION * 3)
    chart.updateData(genSeries(10, { start: '2024-01-03T00:00:00.000Z' }))

    chart.updateSettings({ lineWeight: 3 })
    expect(Math.abs(parseTranslateX($('.lc-scroll-container')!.getAttribute('transform')))).toBeLessThan(0.01)
  })

  it('append + maxDataPoints rolls the window through the container', async () => {
    const { chart, $, $all } = mountV2({
      animationDuration: DURATION,
      appendAnimation: 'transition',
      maxDataPoints: 10,
    })
    chart.setData(genSeries(10))
    await sleep(DURATION * 3)

    chart.appendDataPoint({ date: '2024-01-11T00:00:00.000Z', value: 60 })

    expect($all('.lc-dot')).toHaveLength(11)
    expect($all('.lc-dot-exiting')).toHaveLength(0)
    const startX = parseTranslateX($('.lc-scroll-container')!.getAttribute('transform'))
    expect(startX).toBeGreaterThan(0.5)

    await sleep(DURATION * 4)
    expect(Math.abs(parseTranslateX($('.lc-scroll-container')!.getAttribute('transform')))).toBeLessThan(0.01)

    const snap = (chart as unknown as { getSnapshot(): { modules: Record<string, unknown> } }).getSnapshot()
    const series = snap.modules['series'] as { series: Array<{ data: unknown[] }> }
    expect(series.series[0]!.data).toHaveLength(10)
  })

  it('exit points are trimmed to 4 after each pass', async () => {
    const { chart } = mountV2({
      animationDuration: DURATION,
      appendAnimation: 'transition',
      maxDataPoints: 10,
    })
    chart.setData(genSeries(10))
    await sleep(DURATION * 3)
    for (let i = 0; i < 7; i++) {
      chart.appendDataPoint({
        date: new Date(Date.UTC(2024, 0, 11 + i)).toISOString(),
        value: 50 + i,
      })
    }
    await sleep(DURATION * 5)
    // 7 trims accumulated, but the post-pass cap keeps at most 4 (+1 in flight)
    const { container } = { container: document.getElementById(`v2-anim-${v2Counter}`)! }
    const dots = container.querySelectorAll('.lc-dot')
    expect(dots.length).toBeLessThanOrEqual(10 + 5)
  })
})
