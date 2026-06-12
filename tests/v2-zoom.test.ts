import { afterEach, describe, expect, it } from 'vitest'
import { createLineChartV2 } from '../src/lib/charts/line.ts'
import type { ChartSettings, LineChartHandle } from '../src/lib/index.ts'
import { genSeries } from './helpers.ts'

/** v2 (module engine) — zoom, brush, viewport state. */

let v2Counter = 300
const cleanups: Array<() => void> = []

interface ZoomSlice {
  transform: { k: number; x: number; y: number }
  xDomainOverride: [string, string] | null
  yDomainOverrides: Array<{ axisId: string; range: [number, number] }>
}

function mountV2(settings?: Partial<ChartSettings>): {
  chart: LineChartHandle
  container: HTMLElement
  svg: () => SVGSVGElement
  $: (sel: string) => Element | null
  zoomState: () => ZoomSlice
} {
  const container = document.createElement('div')
  container.id = `v2-zoom-${++v2Counter}`
  document.body.appendChild(container)
  const chart = createLineChartV2(container.id, { animationDuration: 0, ...settings })
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
    svg: () => container.querySelector('svg') as SVGSVGElement,
    $: sel => container.querySelector(sel),
    zoomState: () => {
      const snap = (chart as unknown as { getSnapshot(): { modules: Record<string, unknown> } }).getSnapshot()
      return snap.modules['zoom'] as ZoomSlice
    },
  }
}

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
  document.body.innerHTML = ''
})

function wheel(target: Element, deltaY: number): void {
  target.dispatchEvent(
    new WheelEvent('wheel', { deltaY, clientX: 300, clientY: 150, bubbles: true, cancelable: true }),
  )
}

function mouse(type: string, target: EventTarget, x: number, y: number, ctrl = false): void {
  const event = new MouseEvent(type, {
    clientX: x,
    clientY: y,
    ctrlKey: ctrl,
    bubbles: true,
    cancelable: true,
  })
  // d3-zoom's pan path reads event.view for its no-drag guard. jsdom's MouseEvent
  // constructor rejects the view member, so shadow the getter on the instance.
  Object.defineProperty(event, 'view', { value: document.defaultView })
  target.dispatchEvent(event)
}

describe('v2 wheel zoom', () => {
  it('wheel scales the transform and re-renders synchronously', () => {
    const { chart, svg, container, zoomState } = mountV2()
    chart.setData(genSeries(20))
    const dBefore = container.querySelector('.lc-line')!.getAttribute('d')

    wheel(svg(), -120)

    expect(zoomState().transform.k).toBeGreaterThan(1)
    expect(container.querySelector('.lc-line')!.getAttribute('d')).not.toBe(dBefore)
  })

  it('zoomEnabled gates wheel events, toggleable at runtime', () => {
    const { chart, svg, zoomState } = mountV2({ zoomEnabled: false })
    chart.setData(genSeries(20))
    wheel(svg(), -120)
    expect(zoomState().transform.k).toBe(1)
    chart.updateSettings({ zoomEnabled: true })
    wheel(svg(), -120)
    expect(zoomState().transform.k).toBeGreaterThan(1)
  })

  it('zoomScaleExtent caps the zoom factor after updateSettings', () => {
    const { chart, svg, zoomState } = mountV2()
    chart.setData(genSeries(20))
    chart.updateSettings({ zoomScaleExtent: [1, 2] })
    for (let i = 0; i < 10; i++) wheel(svg(), -120)
    expect(zoomState().transform.k).toBeLessThanOrEqual(2)
  })

  it('resetZoom returns to identity instantly at duration 0; dblclick resets too', () => {
    const { chart, svg, zoomState } = mountV2()
    chart.setData(genSeries(20))
    wheel(svg(), -120)
    chart.resetZoom()
    expect(zoomState().transform).toEqual({ k: 1, x: 0, y: 0 })

    wheel(svg(), -120)
    expect(zoomState().transform.k).toBeGreaterThan(1)
    svg().dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
    expect(zoomState().transform.k).toBe(1)
  })

  it('clearData drops the zoom state via viewport.reset', () => {
    const { chart, svg, zoomState } = mountV2()
    chart.setData(genSeries(20))
    wheel(svg(), -120)
    chart.clearData()
    expect(zoomState().transform.k).toBe(1)
  })
})

describe('v2 modifier brush', () => {
  it('ctrl-drag horizontal sets an x domain override; tiny strokes are discarded', () => {
    const { chart, svg, zoomState } = mountV2()
    chart.setData(genSeries(20))

    // jsdom: d3.pointer falls back to client coords (no SVG CTM) — drag within bounds.
    mouse('mousedown', svg(), 100, 100, true)
    mouse('mousemove', window, 300, 105, true)
    mouse('mouseup', window, 300, 105, true)

    const state = zoomState()
    expect(state.xDomainOverride).not.toBeNull()
    expect(state.yDomainOverrides).toHaveLength(0)

    // tiny stroke → no further change
    const before = zoomState()
    mouse('mousedown', svg(), 100, 100, true)
    mouse('mousemove', window, 102, 101, true)
    mouse('mouseup', window, 102, 101, true)
    expect(zoomState()).toEqual(before)
  })

  it('ctrl-drag vertical sets y overrides for every axis', () => {
    const { chart, zoomState, svg } = mountV2()
    chart.setData(genSeries(20))
    chart.createAxis('second')

    mouse('mousedown', svg(), 100, 50, true)
    mouse('mousemove', window, 104, 200, true)
    mouse('mouseup', window, 104, 200, true)

    const state = zoomState()
    expect(state.xDomainOverride).toBeNull()
    expect(state.yDomainOverrides.map(o => o.axisId).sort()).toEqual(['default', 'second'])
    for (const o of state.yDomainOverrides) {
      expect(o.range[0]).toBeLessThan(o.range[1])
    }
  })

  it('brush zoom changes the rendered geometry and resetZoom restores autoscale', () => {
    const { chart, svg, container, zoomState } = mountV2()
    chart.setData(genSeries(20))
    const dBefore = container.querySelector('.lc-line')!.getAttribute('d')

    mouse('mousedown', svg(), 100, 100, true)
    mouse('mousemove', window, 300, 104, true)
    mouse('mouseup', window, 300, 104, true)

    expect(container.querySelector('.lc-line')!.getAttribute('d')).not.toBe(dBefore)

    chart.resetZoom()
    expect(zoomState().xDomainOverride).toBeNull()
    expect(container.querySelector('.lc-line')!.getAttribute('d')).toBe(dBefore)
  })

  it('plain drag (no modifier) does not brush', () => {
    const { chart, svg, zoomState } = mountV2()
    chart.setData(genSeries(20))
    mouse('mousedown', svg(), 100, 100, false)
    mouse('mousemove', window, 300, 105, false)
    mouse('mouseup', window, 300, 105, false)
    expect(zoomState().xDomainOverride).toBeNull()
  })

  it('zoom snapshot round-trips through restore', () => {
    const { chart, svg, zoomState } = mountV2()
    chart.setData(genSeries(20))
    wheel(svg(), -120)
    mouse('mousedown', svg(), 100, 100, true)
    mouse('mousemove', window, 300, 104, true)
    mouse('mouseup', window, 300, 104, true)

    const handle = chart as unknown as {
      getSnapshot(): unknown
      restoreSnapshot(s: unknown): void
    }
    const snap = JSON.parse(JSON.stringify(handle.getSnapshot()))
    const stateBefore = zoomState()

    const target = mountV2()
    const targetHandle = target.chart as unknown as { restoreSnapshot(s: unknown): void }
    targetHandle.restoreSnapshot(snap)
    expect(target.zoomState()).toEqual(JSON.parse(JSON.stringify(stateBefore)))
  })
})
