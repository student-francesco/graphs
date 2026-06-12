/**
 * jsdom shims for APIs the chart depends on but jsdom does not implement.
 *
 * - ResizeObserver: the LineChart constructor observes its container; without a stub
 *   every chart test would throw. The stub records callbacks so tests can drive
 *   resizes via `triggerResize`.
 * - SVGElement.getTotalLength: the drawOn animation measures path length for its
 *   stroke-dasharray reveal. jsdom has no SVG geometry; a fixed length is fine
 *   because tests assert the dasharray mechanism, not real lengths.
 * - SVGSVGElement.viewBox: d3-zoom reads `svg.viewBox.baseVal` to compute its default
 *   extent. jsdom doesn't expose SVGAnimatedRect, so parse the attribute instead.
 */

interface ObserverRecord {
  cb: ResizeObserverCallback
  targets: Set<Element>
}

const activeObservers = new Set<ObserverRecord>()

class ResizeObserverStub {
  private readonly record: ObserverRecord

  constructor(cb: ResizeObserverCallback) {
    this.record = { cb, targets: new Set() }
    activeObservers.add(this.record)
  }

  observe(target: Element): void {
    this.record.targets.add(target)
  }

  unobserve(target: Element): void {
    this.record.targets.delete(target)
  }

  disconnect(): void {
    activeObservers.delete(this.record)
  }
}

globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver

/** Fire all registered ResizeObserver callbacks watching `target` with the given size. */
export function triggerResize(target: Element, width: number, height: number): void {
  for (const { cb, targets } of activeObservers) {
    if (!targets.has(target)) continue
    const entry = {
      target,
      contentRect: { width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0 },
    } as ResizeObserverEntry
    cb([entry], undefined as unknown as ResizeObserver)
  }
}

const svgProto = (globalThis as { SVGElement?: typeof SVGElement }).SVGElement?.prototype
if (svgProto && !('getTotalLength' in svgProto)) {
  Object.defineProperty(svgProto, 'getTotalLength', {
    value: () => 100,
    configurable: true,
    writable: true,
  })
}

/**
 * d3-interpolate's transform interpolator parses transform attributes by writing them
 * to a detached <g> and reading `transform.baseVal.consolidate().matrix`. jsdom has no
 * SVGTransformList, so emulate consolidate() with a real matrix composition — a wrong
 * matrix here would make every transform tween land on the wrong final value.
 */
interface Matrix {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

function multiply(m: Matrix, n: Matrix): Matrix {
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e,
    f: m.b * n.e + m.d * n.f + m.f,
  }
}

function parseTransformAttribute(value: string): Matrix {
  let matrix: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
  const fnRe = /(\w+)\s*\(([^)]*)\)/g
  let m: RegExpExecArray | null
  while ((m = fnRe.exec(value)) !== null) {
    const args = m[2]!.split(/[\s,]+/).filter(s => s.length > 0).map(Number)
    const [x = 0, y = 0] = args
    switch (m[1]) {
      case 'translate':
        matrix = multiply(matrix, { a: 1, b: 0, c: 0, d: 1, e: x, f: y })
        break
      case 'scale':
        matrix = multiply(matrix, { a: x, b: 0, c: 0, d: args.length > 1 ? y : x, e: 0, f: 0 })
        break
      case 'rotate': {
        const rad = (x * Math.PI) / 180
        const cos = Math.cos(rad)
        const sin = Math.sin(rad)
        const [, cx = 0, cy = 0] = args
        if (cx !== 0 || cy !== 0) {
          matrix = multiply(matrix, { a: 1, b: 0, c: 0, d: 1, e: cx, f: cy })
          matrix = multiply(matrix, { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 })
          matrix = multiply(matrix, { a: 1, b: 0, c: 0, d: 1, e: -cx, f: -cy })
        } else {
          matrix = multiply(matrix, { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 })
        }
        break
      }
      case 'skewX':
        matrix = multiply(matrix, { a: 1, b: 0, c: Math.tan((x * Math.PI) / 180), d: 1, e: 0, f: 0 })
        break
      case 'skewY':
        matrix = multiply(matrix, { a: 1, b: Math.tan((x * Math.PI) / 180), c: 0, d: 1, e: 0, f: 0 })
        break
      case 'matrix':
        matrix = multiply(matrix, {
          a: args[0] ?? 1,
          b: args[1] ?? 0,
          c: args[2] ?? 0,
          d: args[3] ?? 1,
          e: args[4] ?? 0,
          f: args[5] ?? 0,
        })
        break
    }
  }
  return matrix
}

if (svgProto && !('transform' in svgProto)) {
  Object.defineProperty(svgProto, 'transform', {
    get(this: SVGElement) {
      const raw = this.getAttribute('transform')
      return {
        baseVal: {
          consolidate: () => (raw ? { matrix: parseTransformAttribute(raw) } : null),
        },
      }
    },
    configurable: true,
  })
}

const svgSvgProto = (globalThis as { SVGSVGElement?: typeof SVGSVGElement }).SVGSVGElement
  ?.prototype
if (svgSvgProto && !('viewBox' in svgSvgProto)) {
  Object.defineProperty(svgSvgProto, 'viewBox', {
    get(this: SVGSVGElement) {
      const raw = this.getAttribute('viewBox') ?? '0 0 0 0'
      const [x = 0, y = 0, width = 0, height = 0] = raw.split(/[\s,]+/).map(Number)
      return { baseVal: { x, y, width, height } }
    },
    configurable: true,
  })
}
