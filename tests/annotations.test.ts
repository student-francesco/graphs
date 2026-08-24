import { describe, expect, it } from 'vitest'
import { genSeries, mountChart, snapshotModules } from './helpers.ts'

/** Dispatch a synthetic mouse event; jsdom has no SVG CTM, so d3.pointer falls back to
 *  raw client coordinates (see v2-zoom.test.ts) — clientY IS the pixel y d3.drag sees. */
function mouse(type: string, target: EventTarget, clientY: number): void {
  const event = new MouseEvent(type, { clientX: 0, clientY, bubbles: true, cancelable: true })
  Object.defineProperty(event, 'view', { value: document.defaultView })
  target.dispatchEvent(event)
}

function annotationY(chart: Parameters<typeof snapshotModules>[0], id: string): number {
  const list = snapshotModules(chart)['annotations'] as Array<{ id: string; y: number }>
  return list.find(a => a.id === id)!.y
}

describe('annotations', () => {
  it('horizontal line spans the full inner width with default styling', () => {
    const { chart, $ } = mountChart()
    chart.setData(genSeries(5, { base: 50, amplitude: 10 }))
    chart.setHorizontalLine('limit', 55, 'Upper limit')

    const group = $('.lc-annotation')!
    expect(group.getAttribute('data-id')).toBe('limit')
    const line = group.querySelector('line')!
    expect(line.getAttribute('x1')).toBe('0')
    expect(Number(line.getAttribute('x2'))).toBeGreaterThan(0)
    expect(line.getAttribute('y1')).toBe(line.getAttribute('y2'))
    expect(line.getAttribute('stroke')).toBe('#6366f1')
    expect(line.getAttribute('stroke-width')).toBe('1.5')
    expect(line.getAttribute('stroke-dasharray')).toBe('6 4')
    expect(group.querySelector('title')!.textContent).toBe('Upper limit')
  })

  it('vertical line spans the full inner height at a fixed date', () => {
    const { chart, $ } = mountChart()
    chart.setData(genSeries(5))
    chart.setVerticalLine('event', '2024-01-03T00:00:00.000Z', 'Event')

    const line = $('.lc-annotation line')!
    expect(line.getAttribute('x1')).toBe(line.getAttribute('x2'))
    expect(line.getAttribute('y1')).toBe('0')
    expect(Number(line.getAttribute('y2'))).toBeGreaterThan(0)
  })

  it('annotation style settings override the defaults', () => {
    const { chart, $ } = mountChart()
    chart.setData(genSeries(5))
    chart.setHorizontalLine('styled', 50, 'S', { color: '#112233', thickness: 3, dashed: false })
    const line = $('.lc-annotation line')!
    expect(line.getAttribute('stroke')).toBe('#112233')
    expect(line.getAttribute('stroke-width')).toBe('3')
    expect(line.getAttribute('stroke-dasharray')).toBeNull()
  })

  it('annotations render in the chart area, outside the scroll container', () => {
    const { chart, $ } = mountChart()
    chart.setData(genSeries(5))
    chart.setHorizontalLine('h', 50, 'H')
    const layer = $('.lc-annotations')!
    expect(layer.parentElement!.classList.contains('lc-chart-area')).toBe(true)
    expect(layer.closest('.lc-scroll-container')).toBeNull()
  })

  it('a horizontal annotation widens its axis auto-extent like a data point', () => {
    const { chart, container } = mountChart()
    chart.setData(genSeries(5, { base: 50, amplitude: 5 }))
    const before = container.querySelector('.lc-line')!.getAttribute('d')
    chart.setHorizontalLine('far', 500, 'Way above the data')
    const after = container.querySelector('.lc-line')!.getAttribute('d')
    expect(after).not.toBe(before)
  })

  it('setting the same name twice replaces the annotation', () => {
    const { chart, $all, $ } = mountChart()
    chart.setData(genSeries(5))
    chart.setHorizontalLine('x', 40, 'First')
    chart.setHorizontalLine('x', 60, 'Second')
    expect($all('.lc-annotation')).toHaveLength(1)
    expect($('.lc-annotation title')!.textContent).toBe('Second')
  })

  it('removeAnnotation and clearAnnotations remove elements', () => {
    const { chart, $all } = mountChart()
    chart.setData(genSeries(5))
    chart.setHorizontalLine('a', 40, 'A')
    chart.setVerticalLine('b', '2024-01-02T00:00:00.000Z', 'B')
    expect($all('.lc-annotation')).toHaveLength(2)

    chart.removeAnnotation('a')
    expect($all('.lc-annotation')).toHaveLength(1)

    chart.clearAnnotations()
    expect($all('.lc-annotation')).toHaveLength(0)
  })

  it('removing an axis cascade-deletes its horizontal annotations but keeps verticals', () => {
    const { chart, $all } = mountChart()
    chart.setData(genSeries(5))
    chart.createAxis('temp')
    chart.setHorizontalLine('bound', 10, 'Bound to temp', { axis: 'temp' })
    chart.setVerticalLine('free', '2024-01-02T00:00:00.000Z', 'Axis-agnostic')
    expect($all('.lc-annotation')).toHaveLength(2)

    chart.removeAxis('temp')

    const remaining = $all('.lc-annotation')
    expect(remaining).toHaveLength(1)
    expect(remaining[0]!.getAttribute('data-id')).toBe('free')
  })

  it('setVerticalLine rejects invalid dates', () => {
    const { chart } = mountChart()
    chart.setData(genSeries(3))
    expect(() => chart.setVerticalLine('bad', 'not-a-date', 'X')).toThrow(/invalid date/)
  })

  it('annotations created before data render once data arrives', () => {
    const { chart, $all } = mountChart()
    chart.setHorizontalLine('early', 42, 'Early bird')
    expect($all('.lc-annotation')).toHaveLength(0) // no render without data
    chart.setData(genSeries(5))
    expect($all('.lc-annotation')).toHaveLength(1)
  })

  describe('draggable', () => {
    it('a draggable line gets an interactive hit-area; a non-draggable one does not', () => {
      const { chart, $ } = mountChart()
      chart.setData(genSeries(5, { base: 50, amplitude: 10 }))
      chart.setHorizontalLine('fixed', 50, 'Fixed')
      chart.setHorizontalLine('drag', 55, 'Drag', { draggable: true })

      const fixedRect = $('.lc-annotation[data-id="fixed"] .lc-annotation-drag') as SVGRectElement
      const dragRect = $('.lc-annotation[data-id="drag"] .lc-annotation-drag') as SVGRectElement
      expect(fixedRect.style.pointerEvents).toBe('none')
      expect(dragRect.style.pointerEvents).toBe('all')
      expect(dragRect.style.cursor).toBe('ns-resize')
    })

    it('dragging moves the line live and commits the final value on release', () => {
      const { chart, $ } = mountChart()
      chart.setData(genSeries(10, { base: 50, amplitude: 20 }))
      const drags: number[] = []
      let ended: number | null = null
      chart.setHorizontalLine('t', 50, 'T', {
        draggable: true,
        onDrag: v => drags.push(v),
        onDragEnd: v => { ended = v },
      })

      const rect = $('.lc-annotation[data-id="t"] .lc-annotation-drag') as SVGRectElement
      const line = $('.lc-annotation[data-id="t"] line') as SVGLineElement
      const initialY1 = line.getAttribute('y1')

      mouse('mousedown', rect, 100)
      mouse('mousemove', window, 40)
      expect(drags.length).toBeGreaterThan(0)
      expect(line.getAttribute('y1')).not.toBe(initialY1) // DOM moved live, mid-gesture
      expect(ended).toBeNull() // not committed yet

      mouse('mouseup', window, 40)

      expect(ended).not.toBeNull()
      expect(annotationY(chart, 't')).toBeCloseTo(ended!, 9) // committed to the store
    })

    it('clamps the dragged value to dragBounds in both directions', () => {
      const { chart, $ } = mountChart()
      chart.setData(genSeries(10, { base: 50, amplitude: 20 }))
      let ended: number | null = null
      chart.setHorizontalLine('t', 50, 'T', {
        draggable: true,
        dragBounds: [40, 60],
        onDragEnd: v => { ended = v },
      })
      const rect = $('.lc-annotation-drag') as SVGRectElement

      mouse('mousedown', rect, 0)
      mouse('mousemove', window, -100_000)
      mouse('mouseup', window, -100_000)
      const extremeA = ended!

      mouse('mousedown', rect, 0)
      mouse('mousemove', window, 100_000)
      mouse('mouseup', window, 100_000)
      const extremeB = ended!

      expect([extremeA, extremeB].sort((a, b) => a - b)).toEqual([40, 60])
    })

    it('a non-draggable line ignores a drag gesture dispatched directly on its hit-area', () => {
      const { chart, $ } = mountChart()
      chart.setData(genSeries(5, { base: 50, amplitude: 10 }))
      chart.setHorizontalLine('fixed', 50, 'Fixed')
      const rect = $('.lc-annotation-drag') as SVGRectElement
      const line = $('.lc-annotation line') as SVGLineElement
      const before = line.getAttribute('y1')

      mouse('mousedown', rect, 10)
      mouse('mousemove', window, 200)
      mouse('mouseup', window, 200)

      expect(line.getAttribute('y1')).toBe(before)
      expect(annotationY(chart, 'fixed')).toBe(50)
    })

    it('draggable and dragBounds survive a snapshot round-trip', () => {
      const { chart } = mountChart()
      chart.setData(genSeries(5, { base: 50, amplitude: 10 }))
      chart.setHorizontalLine('t', 50, 'T', { draggable: true, dragBounds: [10, 90] })

      const snap = chart.getSnapshot()
      chart.setHorizontalLine('t', 50, 'T') // drop draggable, prove restore brings it back
      chart.restoreSnapshot(snap)

      const restored = (snapshotModules(chart)['annotations'] as Array<
        { id: string; draggable: boolean; dragBounds: [number, number] | null }
      >).find(a => a.id === 't')!
      expect(restored.draggable).toBe(true)
      expect(restored.dragBounds).toEqual([10, 90])
    })
  })
})
