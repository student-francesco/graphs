import { describe, expect, it } from 'vitest'
import { genSeries, mountChart, seriesSlices } from './helpers.ts'

const DURATION = 60

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
}

function parseTranslateX(transform: string | null): number {
  const m = /translate\(\s*(-?[\d.e]+)/.exec(transform ?? '')
  return m ? parseFloat(m[1]!) : 0
}

describe('drawOn (setData default)', () => {
  it('reveals the path via stroke-dasharray, then clears it on completion', async () => {
    const { chart, $ } = mountChart({ animationDuration: DURATION })
    chart.setData(genSeries(8))

    const path = $('.lc-line') as SVGPathElement
    // shimmed getTotalLength() returns 100
    expect(path.getAttribute('stroke-dasharray')).toBe('100 100')
    expect(Number(path.getAttribute('stroke-dashoffset'))).toBeGreaterThan(0)

    await sleep(DURATION * 3)
    expect(path.getAttribute('stroke-dasharray')).toBeNull()
    expect(path.getAttribute('stroke-dashoffset')).toBeNull()
  })

  it('entering x ticks fade in when animationDuration > 0', async () => {
    const { chart, $all } = mountChart({ animationDuration: DURATION })
    chart.setData(genSeries(8))
    const tick = $all('.lc-x-tick')[0] as SVGGElement
    expect(tick.style.opacity).toBe('0')
    await sleep(350) // ENTER_FADE_MS is 200
    expect(tick.style.opacity === '' || tick.style.opacity === '1').toBe(true)
  })
})

describe('morph (updateData default)', () => {
  it('keeps the path element; dropped points stay joined as exit-point dots', async () => {
    const { chart, $, $all } = mountChart({ animationDuration: DURATION })
    chart.setData(genSeries(10))
    await sleep(DURATION * 3)

    const pathBefore = $('.lc-line')
    chart.updateData(genSeries(10, { start: '2024-01-03T00:00:00.000Z' }))

    expect($('.lc-line')).toBe(pathBefore)
    // dropped points remain in the join via pendingExitPoints — not renamed yet
    expect($all('.lc-dot')).toHaveLength(12)
    expect($all('.lc-dot-exiting')).toHaveLength(0)
    await sleep(DURATION * 4)
  })

  it('a second slide expels stale exit points as fading .lc-dot-exiting', async () => {
    const { chart, $all } = mountChart({ animationDuration: DURATION })
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

describe('transition (scroll choreography)', () => {
  it('pre-positions the scroll container, then animates it back to the origin', async () => {
    const { chart, $ } = mountChart({
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

  it('content inside the container snaps to final coordinates (no per-element tween)', async () => {
    const { chart, container } = mountChart({
      animationDuration: DURATION,
      updateDataAnimation: 'transition',
    })
    chart.setData(genSeries(10))
    await sleep(DURATION * 3)

    const next = genSeries(10, { start: '2024-01-03T00:00:00.000Z' })
    chart.updateData(next)

    // Immediately after the (synchronous) render, the path already holds its final
    // geometry — including exit points — while the container is still displaced.
    const d = container.querySelector('.lc-line')!.getAttribute('d')!
    expect(d.length).toBeGreaterThan(0)
    await sleep(DURATION * 4)
    expect(container.querySelector('.lc-line')!.getAttribute('d')).toBe(d)
  })

  it('non-animated renders reset any lingering scroll transform', async () => {
    const { chart, $ } = mountChart({
      animationDuration: DURATION,
      updateDataAnimation: 'transition',
    })
    chart.setData(genSeries(10))
    await sleep(DURATION * 3)
    chart.updateData(genSeries(10, { start: '2024-01-03T00:00:00.000Z' }))

    // interrupt mid-scroll with a settings render ('none')
    chart.updateSettings({ lineWeight: 3 })
    const scroll = $('.lc-scroll-container')!
    expect(Math.abs(parseTranslateX(scroll.getAttribute('transform')))).toBeLessThan(0.01)
  })
})

describe('append + maxDataPoints in transition mode', () => {
  it('rolls the window: container pre-positioned, trimmed point joined as exit dot', async () => {
    const { chart, $, $all } = mountChart({
      animationDuration: DURATION,
      appendAnimation: 'transition',
      maxDataPoints: 10,
    })
    chart.setData(genSeries(10))
    await sleep(DURATION * 3)

    chart.appendDataPoint({ date: '2024-01-11T00:00:00.000Z', value: 60 })

    // 10 live + 1 trimmed exit point still joined; the container carries the motion
    expect($all('.lc-dot')).toHaveLength(11)
    expect($all('.lc-dot-exiting')).toHaveLength(0)
    const startX = parseTranslateX($('.lc-scroll-container')!.getAttribute('transform'))
    expect(startX).toBeGreaterThan(0.5)

    await sleep(DURATION * 4)
    expect(Math.abs(parseTranslateX($('.lc-scroll-container')!.getAttribute('transform')))).toBeLessThan(0.01)

    // data stays capped at 10 regardless of lingering exit-point dots
    expect(seriesSlices(chart)[0]!.data).toHaveLength(10)
  })
})
