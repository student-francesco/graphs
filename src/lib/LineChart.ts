import * as d3 from 'd3'
import type {
  RawDataPoint,
  DataPoint,
  ChartSettings,
  ChartMargins,
  CurveType,
  EasingType,
  LineChartHandle,
  AnimationMode,
  SeriesSettings,
  AxisOptions,
} from './types.ts'
import { DEFAULT_SETTINGS, AXIS_WIDTH, TITLE_SPACE, X_LABEL_SPACE, Y_LABEL_SPACE } from './defaults.ts'
import { movingAverage, lttb } from './transforms.ts'
import { renderSkeleton, removeSkeleton } from './skeleton.ts'
import { renderAxes, type AxisLayout, type YScale } from './axes.ts'
import { TooltipController } from './tooltip.ts'
import { buildPdf } from './pdf.ts'

const EASING_MAP: Record<EasingType, (t: number) => number> = {
  easeLinear:      d3.easeLinear,
  easeQuadIn:      d3.easeQuadIn,    easeQuadOut:      d3.easeQuadOut,    easeQuadInOut:      d3.easeQuadInOut,
  easeCubicIn:     d3.easeCubicIn,   easeCubicOut:     d3.easeCubicOut,   easeCubicInOut:     d3.easeCubicInOut,
  easeSinIn:       d3.easeSinIn,     easeSinOut:       d3.easeSinOut,     easeSinInOut:       d3.easeSinInOut,
  easeExpIn:       d3.easeExpIn,     easeExpOut:       d3.easeExpOut,     easeExpInOut:       d3.easeExpInOut,
  easeCircleIn:    d3.easeCircleIn,  easeCircleOut:    d3.easeCircleOut,  easeCircleInOut:    d3.easeCircleInOut,
  easeBackIn:      d3.easeBackIn,    easeBackOut:      d3.easeBackOut,    easeBackInOut:      d3.easeBackInOut,
  easeBounceIn:    d3.easeBounceIn,  easeBounceOut:    d3.easeBounceOut,  easeBounceInOut:    d3.easeBounceInOut,
  easeElasticIn:   d3.easeElasticIn, easeElasticOut:   d3.easeElasticOut, easeElasticInOut:   d3.easeElasticInOut,
}

const CURVE_MAP: Record<CurveType, d3.CurveFactory | d3.CurveFactoryLineOnly> = {
  linear: d3.curveLinear,
  monotoneX: d3.curveMonotoneX,
  monotoneY: d3.curveMonotoneY,
  natural: d3.curveNatural,
  basis: d3.curveBasis,
  cardinal: d3.curveCardinal,
  catmullRom: d3.curveCatmullRom,
  step: d3.curveStep,
  stepBefore: d3.curveStepBefore,
  stepAfter: d3.curveStepAfter,
}

interface SeriesState {
  id: string
  data: DataPoint[]
  pendingExitPoints: DataPoint[]
  color: string | undefined       // undefined = fall back to settings.lineColor
  lineWeight: number | undefined  // undefined = fall back to settings.lineWeight
  dotRadius: number | undefined   // undefined = fall back to settings.dotRadius
  curveType: CurveType | undefined // undefined = fall back to settings.curveType
  axisId: string
  smoothing: number | undefined
  decimation: number | undefined
}

interface AxisState {
  id: string
  name: string
  color: string | null
  range: [number, number] | null
  limits: [number, number] | null
  scaleType: 'linear' | 'log'
}

const DEFAULT_AXIS_ID = 'default'

interface HoverDatum extends DataPoint {
  seriesId: string
  seriesName: string
  /** Precomputed pixel y — uses the series' own axis scale. */
  _y: number
}

function parseRaw(raw: RawDataPoint): DataPoint {
  const d = new Date(raw.date)
  if (isNaN(d.getTime())) throw new Error(`LineChart: invalid date "${raw.date}"`)
  return { date: d, value: raw.value }
}

function computeOverlap(a: DataPoint[], b: DataPoint[]): number {
  const setA = new Set(a.map(p => p.date.getTime()))
  let count = 0
  for (const p of b) {
    if (setA.has(p.date.getTime())) count++
  }
  return count
}

export class LineChart implements LineChartHandle {
  private readonly container: HTMLElement
  private settings: ChartSettings
  private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>
  private innerG: d3.Selection<SVGGElement, unknown, null, undefined>
  private series: Map<string, SeriesState> = new Map()
  private axes: Map<string, AxisState> = new Map()
  private nextPaletteIndex = 0
  private static readonly PALETTE = [
    '#e11d48', '#0891b2', '#16a34a', '#d97706', '#7c3aed', '#db2777', '#0284c7', '#4f46e5',
  ]
  private tooltip: TooltipController | null = null
  private resizeObserver: ResizeObserver | null = null
  private destroyed = false
  private hasSkeleton = true

  private width = 0
  private height = 0

  private readonly clipPathId: string
  private clipRect: d3.Selection<SVGRectElement, unknown, null, undefined>

  private readonly fadeGradId: string
  private readonly fadeMaskId: string
  private fadeStopLeft: d3.Selection<SVGStopElement, unknown, null, undefined>
  private fadeStopLeft2: d3.Selection<SVGStopElement, unknown, null, undefined>
  private fadeMaskRect: d3.Selection<SVGRectElement, unknown, null, undefined>
  private fadeBlurLeft!: HTMLDivElement

  // Render y-axis above blur
  private axisOverlaySvg: d3.Selection<SVGSVGElement, unknown, null, undefined> | null = null
  private axisOverlayG: d3.Selection<SVGGElement, unknown, null, undefined> | null = null

  private prevXScale: d3.ScaleTime<number, number> | null = null

  private lastRender: number = Date.now()

  constructor(divId: string, settings?: Partial<ChartSettings>) {
    const el = document.getElementById(divId)
    if (el === null) throw new Error(`LineChart: no element with id "${divId}"`)
    this.container = el
    this.settings = { ...DEFAULT_SETTINGS, ...settings }

    // Seed the default y-axis. color:null preserves existing single-axis visual behaviour.
    this.axes.set(DEFAULT_AXIS_ID, {
      id: DEFAULT_AXIS_ID,
      name: DEFAULT_AXIS_ID,
      color: null,
      range: null,
      limits: null,
      scaleType: this.settings.yScaleType,
    })

    // Initialise the default series — display properties left undefined so they
    // always fall back to the current chart-wide settings at render time.
    this.series.set('default', {
      id: 'default',
      data: [],
      pendingExitPoints: [],
      color: undefined,
      lineWeight: undefined,
      dotRadius: undefined,
      curveType: undefined,
      axisId: DEFAULT_AXIS_ID,
      smoothing: undefined,
      decimation: undefined,
    })

    const rect = this.container.getBoundingClientRect()
    this.width = rect.width || 600
    this.height = rect.height || 300

    this.svg = d3
      .select(this.container)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .style('display', 'block')
      .attr('viewBox', `0 0 ${this.width} ${this.height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .attr('role', 'img')
      .attr('aria-label', this.settings.ariaLabel)

    this.svg.node()!.dataset.theme = this.settings.theme

    const defs = this.svg.append('defs')

    // Clip path — hard boundary for scroll container
    this.clipPathId = `lc-clip-${Math.random().toString(36).slice(2, 9)}`
    this.clipRect = defs
      .append('clipPath')
      .attr('id', this.clipPathId)
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', this.innerWidth)
      .attr('height', this.innerHeight)

    // Fade gradient + mask
    this.fadeGradId = `lc-fade-grad-${Math.random().toString(36).slice(2, 9)}`
    this.fadeMaskId = `lc-fade-mask-${Math.random().toString(36).slice(2, 9)}`

    const grad = defs
      .append('linearGradient')
      .attr('id', this.fadeGradId)
      // objectBoundingBox (default) — stop offsets are fractions of the mask rect's width,
      // so they stay correct regardless of coordinate transforms.
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '100%')
      .attr('y2', '0%')

    this.fadeStopLeft  = grad.append('stop')
    this.fadeStopLeft2 = grad.append('stop')

    this.fadeMaskRect = defs
      .append('mask')
      .attr('id', this.fadeMaskId)
      .append('rect')
      .attr('x', 0)
      .attr('y', -20)
      .attr('width', this.innerWidth)
      .attr('height', this.innerHeight + 40)
      .attr('fill', `url(#${this.fadeGradId})`)

    const initialMargins = this.effectiveMargins()
    this.innerG = this.svg
      .append('g')
      .attr('class', 'lc-inner')
      .attr('transform', `translate(${initialMargins.left},${initialMargins.top})`)

    // Ensure container is a positioning context for the blur overlays
    if (getComputedStyle(this.container).position === 'static') {
      this.container.style.position = 'relative'
    }

    const blurStrength = 6;
    const blurEnd = 90;
    const blurStyle =
      'position:absolute;top:0;height:100%;pointer-events:none;z-index:1;' +
      `backdrop-filter:blur(${blurStrength}px);-webkit-backdrop-filter:blur(${blurStrength}px)`

    this.fadeBlurLeft = document.createElement('div')
    this.fadeBlurLeft.style.cssText =
      blurStyle +
      `;mask-image:linear-gradient(to right,black 0%,black ${blurEnd}%,transparent 100%)` +
      `;-webkit-mask-image:linear-gradient(to right,black 0%,black ${blurEnd}%,transparent 100%)`
    this.container.appendChild(this.fadeBlurLeft)

    // Overlay SVG sits above the blur divs (z-index 2) and contains only the y-axis,
    this.axisOverlaySvg = d3
      .select(this.container)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .style('display', 'block')
      .attr('viewBox', `0 0 ${this.width} ${this.height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .attr('aria-hidden', 'true')
      .style('position', 'absolute')
      .style('top', '0')
      .style('left', '0')
      .style('pointer-events', 'none')
      .style('z-index', '2')

    this.axisOverlayG = this.axisOverlaySvg
      .append('g')
      .attr('class', 'lc-axis-overlay')
      .attr('transform', `translate(${initialMargins.left},${initialMargins.top})`)

    renderSkeleton(this.svg, this.width, this.height, initialMargins)
    this.renderTitleAndLabels()

    this.resizeObserver = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry === undefined) return
      const { width, height } = entry.contentRect
      if (width === this.width && height === this.height) return
      this.width = width
      this.height = height
      this.svg.attr('viewBox', `0 0 ${width} ${height}`)
      this.axisOverlaySvg?.attr('viewBox', `0 0 ${width} ${height}`)
      if (this.hasData()) this.render('none')
    })
    this.resizeObserver.observe(this.container)
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  setData(data: RawDataPoint[]): void
  setData(data: Record<string, RawDataPoint[]>): void
  setData(data: RawDataPoint[] | Record<string, RawDataPoint[]>): void {
    this.assertAlive()
    if (Array.isArray(data)) {
      const s = this.defaultSeries()
      s.data = data.map(parseRaw)
      s.pendingExitPoints = []
      this.dismissSkeleton()
      this.ensureTooltip()
      this.render(this.settings.setDataAnimation)
    } else {
      for (const [id, points] of Object.entries(data)) {
        this.setSeriesData(id, points)
      }
    }
  }

  updateData(data: RawDataPoint[]): void {
    this.assertAlive()
    const s = this.defaultSeries()
    const incoming = data.map(parseRaw)

    if (s.data.length === 0) {
      s.data = incoming
      this.dismissSkeleton()
      this.ensureTooltip()
      this.render(this.settings.updateDataAnimation)
      return
    }

    const overlap = computeOverlap(s.data, incoming)
    const ratio = overlap / Math.max(s.data.length, incoming.length)
    const sufficient =
      overlap >= this.settings.minOverlapForTransition &&
      ratio >= this.settings.overlapThreshold

    // Compute exit points for visual continuity during animated transitions
    const incomingSet = new Set(incoming.map(p => p.date.getTime()))
    s.pendingExitPoints = s.data.filter(p => !incomingSet.has(p.date.getTime()))

    s.data = incoming

    if (sufficient) {
      this.render(this.settings.updateDataAnimation)
    } else {
      s.pendingExitPoints = []
      // Remove default series elements so renderLine sees isNew=true (triggers drawOn)
      const chartArea = this.innerG.select<SVGGElement>('.lc-chart-area')
      if (!chartArea.empty()) {
        const scrollContainer = chartArea.select<SVGGElement>('.lc-scroll-container')
        if (!scrollContainer.empty()) {
          scrollContainer.select<SVGGElement>('.lc-series[data-id="default"]')
            .selectAll('.lc-line,.lc-dot,.lc-dot-exiting').remove()
          scrollContainer.select('.lc-hover-zones').selectAll('.lc-hover-zone').remove()
        }
      }
      this.render(this.settings.updateDataAnimation)
    }
  }

  updateSettings(settings: Partial<ChartSettings>): void {
    this.assertAlive()
    const hadTooltip = this.settings.showTooltip
    const prevTheme = this.settings.theme
    this.settings = { ...this.settings, ...settings }
    this.svg.node()!.dataset.theme = this.settings.theme

    if (!hadTooltip && this.settings.showTooltip && this.hasData()) {
      this.ensureTooltip()
    } else if (hadTooltip && !this.settings.showTooltip) {
      this.tooltip?.destroy()
      this.tooltip = null
    }

    if (this.tooltip && prevTheme !== this.settings.theme) {
      this.tooltip.destroy()
      this.tooltip = null
      this.ensureTooltip()
    }

    if (settings.yScaleType !== undefined) {
      const primary = this.axes.get(DEFAULT_AXIS_ID)
      if (primary) primary.scaleType = settings.yScaleType
    }

    if (this.hasData()) this.render('none')
    else this.renderTitleAndLabels()
  }

  setLineColor(color: string): void {
    this.assertAlive()
    this.settings = { ...this.settings, lineColor: color }
    this.series.forEach((s, id) => {
      if (s.color !== undefined) return
      const painted = this.resolveStrokeColor(s)
      const g = this.innerG.select<SVGGElement>(`.lc-series[data-id="${id}"]`)
      g.select('.lc-line').attr('stroke', painted)
      g.selectAll('.lc-dot').attr('fill', painted)
    })
  }

  setLineWeight(weight: number): void {
    this.assertAlive()
    this.settings = { ...this.settings, lineWeight: weight }
    this.series.forEach((s, id) => {
      if (s.lineWeight !== undefined) return
      this.innerG.select<SVGGElement>(`.lc-series[data-id="${id}"]`)
        .select('.lc-line').attr('stroke-width', weight)
    })
  }

  appendDataPoint(point: RawDataPoint): void {
    this.assertAlive()
    const s = this.defaultSeries()
    s.data.push(parseRaw(point))
    s.pendingExitPoints = this.trimToMaxPoints(s)
    if (s.data.length > 0) this.render(this.settings.appendAnimation)
  }

  appendDataPoints(points: RawDataPoint[]): void {
    this.assertAlive()
    const s = this.defaultSeries()
    for (const p of points) s.data.push(parseRaw(p))
    s.pendingExitPoints = this.trimToMaxPoints(s)
    if (s.data.length > 0) this.render(this.settings.appendAnimation)
  }

  clearData(): void {
    this.assertAlive()
    const ds = this.defaultSeries()
    this.series.clear()
    this.series.set('default', {
      ...ds,
      data: [],
      pendingExitPoints: [],
      axisId: this.axes.has(ds.axisId) ? ds.axisId : this.firstAxisId(),
    })
    this.nextPaletteIndex = 0
    this.innerG.selectAll('*').remove()
    this.axisOverlayG?.selectAll('*').remove()
    this.hasSkeleton = true
    this.svg.node()!.dataset.theme = this.settings.theme
    renderSkeleton(this.svg, this.width, this.height, this.effectiveMargins())
    this.renderTitleAndLabels()
  }

  async saveToPdf(filename = 'chart'): Promise<void> {
    this.assertAlive()

    // 1. Clone and compose both SVGs into one for export
    const mainSvg = this.svg.node()!
    const overlaySvg = this.axisOverlaySvg?.node() ?? null

    const mainClone = mainSvg.cloneNode(true) as SVGSVGElement
    if (overlaySvg) {
      const overlayClone = overlaySvg.cloneNode(true) as SVGSVGElement
      // Move overlay children into the main clone as a final <g>
      const overlayG = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      while (overlayClone.firstChild) overlayG.appendChild(overlayClone.firstChild)
      mainClone.appendChild(overlayG)
    }

    // Fix currentColor → resolved color so the canvas render looks correct
    const containerColor = getComputedStyle(this.container).color || '#374151'
    const svgStr = new XMLSerializer().serializeToString(mainClone)
      .replace(/currentColor/g, containerColor)

    // 2. Rasterize SVG → canvas → JPEG
    const w = this.width
    const h = this.height
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)

    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    await new Promise<void>((resolve, reject) => {
      const img = new Image()
      img.onload = () => { ctx.drawImage(img, 0, 0); URL.revokeObjectURL(url); resolve() }
      img.onerror = (e) => { URL.revokeObjectURL(url); reject(e) }
      img.src = url
    })

    // 3. Get JPEG bytes
    const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.95)
    const jpegBase64 = jpegDataUrl.slice('data:image/jpeg;base64,'.length)
    const jpegBinary = atob(jpegBase64)
    const jpegBytes = new Uint8Array(jpegBinary.length)
    for (let i = 0; i < jpegBinary.length; i++) jpegBytes[i] = jpegBinary.charCodeAt(i)

    // 4. Build PDF (pixels → points: 1px ≈ 0.75pt at 96 DPI)
    const widthPt = Math.round(w * 0.75)
    const heightPt = Math.round(h * 0.75)
    const pdfBytes = buildPdf(jpegBytes, widthPt, heightPt)

    // 5. Trigger download
    // Copy into a new ArrayBuffer (not SharedArrayBuffer) to satisfy TypeScript's BlobPart
    const pdfBuffer = new ArrayBuffer(pdfBytes.byteLength)
    new Uint8Array(pdfBuffer).set(pdfBytes)
    const pdfBlob = new Blob([pdfBuffer], { type: 'application/pdf' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(pdfBlob)
    a.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(a.href)
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.resizeObserver?.disconnect()
    this.tooltip?.destroy()
    this.svg.remove()
    this.axisOverlaySvg?.remove()
    this.fadeBlurLeft.remove()
  }

  // --- Multi-series API ---

  addSeries(id: string, settings?: SeriesSettings): void {
    this.assertAlive()
    if (this.series.has(id)) return
    const color = settings?.color
      ?? LineChart.PALETTE[this.nextPaletteIndex++ % LineChart.PALETTE.length]
    // Unknown axis ids (or a request for 'default' after it was removed) fall back to the
    // first existing axis. The chart guarantees ≥ 1 axis at all times.
    const requestedAxis = settings?.axis ?? DEFAULT_AXIS_ID
    const axisId = this.axes.has(requestedAxis) ? requestedAxis : this.firstAxisId()
    this.series.set(id, {
      id,
      data: [],
      pendingExitPoints: [],
      color,
      lineWeight: settings?.lineWeight,
      dotRadius: settings?.dotRadius,
      curveType: settings?.curveType,
      axisId,
      smoothing: settings?.smoothing,
      decimation: settings?.decimation,
    })
  }

  removeSeries(id: string): void {
    this.assertAlive()
    if (id === 'default') return
    this.series.delete(id)
    // Remove DOM group immediately
    const chartArea = this.innerG.select<SVGGElement>('.lc-chart-area')
    if (!chartArea.empty()) {
      chartArea.select('.lc-scroll-container')
        .select(`.lc-series[data-id="${id}"]`).remove()
    }
    if (this.hasData()) this.render('none')
  }

  setSeriesData(id: string, data: RawDataPoint[]): void {
    this.assertAlive()
    if (!this.series.has(id)) this.addSeries(id)
    const s = this.series.get(id)!
    s.data = data.map(parseRaw)
    s.pendingExitPoints = []
    this.dismissSkeleton()
    this.ensureTooltip()
    this.render(this.settings.setDataAnimation)
  }

  updateSeriesData(id: string, data: RawDataPoint[]): void {
    this.assertAlive()
    if (!this.series.has(id)) this.addSeries(id)
    const s = this.series.get(id)!
    const incoming = data.map(parseRaw)

    if (s.data.length === 0) {
      s.data = incoming
      this.dismissSkeleton()
      this.ensureTooltip()
      this.render(this.settings.updateDataAnimation)
      return
    }

    const overlap = computeOverlap(s.data, incoming)
    const ratio = overlap / Math.max(s.data.length, incoming.length)
    const sufficient =
      overlap >= this.settings.minOverlapForTransition &&
      ratio >= this.settings.overlapThreshold

    const incomingSet = new Set(incoming.map(p => p.date.getTime()))
    s.pendingExitPoints = s.data.filter(p => !incomingSet.has(p.date.getTime()))
    s.data = incoming

    if (sufficient) {
      this.render(this.settings.updateDataAnimation)
    } else {
      s.pendingExitPoints = []
      const chartArea = this.innerG.select<SVGGElement>('.lc-chart-area')
      if (!chartArea.empty()) {
        chartArea.select('.lc-scroll-container')
          .select<SVGGElement>(`.lc-series[data-id="${id}"]`)
          .selectAll('.lc-line,.lc-dot,.lc-dot-exiting').remove()
      }
      this.render(this.settings.updateDataAnimation)
    }
  }

  appendSeriesDataPoint(id: string, point: RawDataPoint): void {
    this.assertAlive()
    if (!this.series.has(id)) this.addSeries(id)
    const s = this.series.get(id)!
    s.data.push(parseRaw(point))
    s.pendingExitPoints = this.trimToMaxPoints(s)
    if (s.data.length > 0) this.render(this.settings.appendAnimation)
  }

  appendSeriesDataPoints(id: string, points: RawDataPoint[]): void {
    this.assertAlive()
    if (!this.series.has(id)) this.addSeries(id)
    const s = this.series.get(id)!
    for (const p of points) s.data.push(parseRaw(p))
    s.pendingExitPoints = this.trimToMaxPoints(s)
    if (s.data.length > 0) this.render(this.settings.appendAnimation)
  }

  setSeriesColor(id: string, color: string): void {
    this.assertAlive()
    const s = this.series.get(id)
    if (!s) return
    s.color = color
    const painted = this.resolveStrokeColor(s)
    const g = this.innerG.select<SVGGElement>(`.lc-series[data-id="${id}"]`)
    g.select('.lc-line').attr('stroke', painted)
    g.selectAll('.lc-dot').attr('fill', painted)
  }

  setSeriesWeight(id: string, weight: number): void {
    this.assertAlive()
    const s = this.series.get(id)
    if (!s) return
    s.lineWeight = weight
    this.innerG.select<SVGGElement>(`.lc-series[data-id="${id}"]`)
      .select('.lc-line').attr('stroke-width', weight)
  }

  // --- Multi-axis API ---

  createAxis(name: string, options?: AxisOptions): void {
    this.assertAlive()
    const existing = this.axes.get(name)
    if (existing) {
      // Sparse upsert — only overwrite fields the caller actually provided.
      if (options) {
        if ('name' in options && options.name !== undefined) existing.name = options.name
        if ('color' in options) existing.color = options.color ?? null
        if ('range' in options) existing.range = options.range ?? null
        if ('limits' in options) existing.limits = options.limits ?? null
      }
    } else {
      this.axes.set(name, {
        id: name,
        name: options?.name ?? name,
        color: options?.color ?? null,
        range: options?.range ?? null,
        limits: options?.limits ?? null,
        scaleType: 'linear',
      })
    }
    if (this.hasData()) this.render('none')
  }

  removeAxis(name: string): void {
    this.assertAlive()
    if (!this.axes.has(name)) return
    // Must guarantee one axis remains.
    if (this.axes.size <= 1) return
    this.axes.delete(name)
    // Migrate orphaned series to the first remaining axis (insertion order).
    const fallback = this.firstAxisId()
    for (const s of this.series.values()) {
      if (s.axisId === name) s.axisId = fallback
    }
    // Remove DOM chrome immediately so per-axis exit anims don't linger.
    const overlay = this.axisOverlayG ?? this.innerG
    overlay.select(`.lc-y-axis[data-axis-id="${name}"]`).remove()
    if (this.hasData()) this.render('none')
  }

  associateSeries(seriesName: string, axisName: string): void {
    this.assertAlive()
    if (!this.axes.has(axisName)) {
      console.warn(`LineChart: associateSeries — unknown axis "${axisName}"`)
      return
    }
    if (!this.series.has(seriesName)) this.addSeries(seriesName)
    const s = this.series.get(seriesName)!
    s.axisId = axisName
    if (this.hasData()) this.render('none')
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private get innerWidth(): number {
    const m = this.effectiveMargins()
    return this.width - m.left - m.right
  }

  private get innerHeight(): number {
    const m = this.effectiveMargins()
    return this.height - m.top - m.bottom
  }

  /**
   * Dynamic margins that reserve horizontal space for stacked y-axes on top of the user's
   * configured base margins. Single-axis charts return the base margins unchanged.
   */
  private effectiveMargins(): ChartMargins {
    let m = this.settings.margins
    if (this.settings.title)  m = { ...m, top:    m.top    + TITLE_SPACE }
    if (this.settings.xLabel) m = { ...m, bottom: m.bottom + X_LABEL_SPACE }
    if (this.settings.yLabel) m = { ...m, left:   m.left   + Y_LABEL_SPACE }
    const count = this.axes.size
    if (count <= 1) return m
    if (count === 2) return { ...m, right: m.right + AXIS_WIDTH }
    // 3+ axes: extra rails stack on the left (the first axis stays innermost at offsetX=0).
    return { ...m, left: m.left + (count - 1) * AXIS_WIDTH }
  }

  /** Resolved per-axis render data. The first axis always sits innermost at offsetX=0. */
  private buildAxisLayout(): AxisLayout[] {
    const list = Array.from(this.axes.values())
    if (list.length === 1) {
      return [{
        id: list[0].id, name: list[0].name, color: list[0].color,
        position: 'left', offsetX: 0, scaleType: list[0].scaleType,
      }]
    }
    if (list.length === 2) {
      return [
        {
          id: list[0].id, name: list[0].name, color: list[0].color,
          position: 'left', offsetX: 0, scaleType: list[0].scaleType,
        },
        {
          id: list[1].id, name: list[1].name, color: list[1].color,
          position: 'right', offsetX: this.innerWidth, scaleType: list[1].scaleType,
        },
      ]
    }
    // 3+ axes: all left; first innermost at 0, then -AXIS_WIDTH, -2*AXIS_WIDTH, …
    return list.map((a, i) => ({
      id: a.id,
      name: a.name,
      color: a.color,
      position: 'left' as const,
      offsetX: -i * AXIS_WIDTH,
      scaleType: a.scaleType,
    }))
  }

  /**
   * Stroke / dot fill colour for a series: axis colour wins when set, otherwise the series'
   * stored colour. Keeps `setLineColor` / `setSeriesColor` working as fast paths.
   */
  private resolveStrokeColor(s: SeriesState): string {
    return this.axes.get(s.axisId)?.color ?? s.color ?? this.settings.lineColor
  }

  /**
   * The id every fallback path resolves to when 'default' has been removed.
   * The chart guarantees ≥ 1 axis, so this never returns undefined in practice.
   */
  private firstAxisId(): string {
    return this.axes.keys().next().value as string
  }

  private defaultSeries(): SeriesState {
    return this.series.get('default')!
  }

  private hasData(): boolean {
    return Array.from(this.series.values()).some(s => s.data.length > 0)
  }

  private dismissSkeleton(): void {
    if (!this.hasSkeleton) return
    removeSkeleton(this.svg)
    this.hasSkeleton = false
  }

  private ensureTooltip(): void {
    if (this.settings.showTooltip && this.tooltip === null) {
      this.tooltip = new TooltipController(this.settings)
    }
  }

  private getDecimatedData(series: SeriesState, points?: DataPoint[]): DataPoint[] {
    const threshold = series.decimation ?? this.settings.decimation
    const src = points ?? series.data
    if (threshold === 0) return src
    return lttb(src, threshold)
  }

  private trimToMaxPoints(s: SeriesState): DataPoint[] {
    const max = this.settings.maxDataPoints
    if (max === null || max <= 0 || s.data.length <= max) return []
    const newExit = s.data.splice(0, s.data.length - max)
    return s.pendingExitPoints.concat(newExit)
  }

  /**
   * Lazily creates lc-chart-area — the static wrapper that holds the clip-path and mask.
   * Nothing inside it should change its own transform; the scroll container is its only child.
   * Must be called BEFORE renderAxes so the y-axis (appended to innerG by renderAxes)
   * lands after it in DOM order and therefore renders on top.
   */
  private getOrCreateChartArea(): d3.Selection<SVGGElement, unknown, null, undefined> {
    const existing = this.innerG.select<SVGGElement>('.lc-chart-area')
    if (!existing.empty()) return existing
    return this.innerG.append('g')
      .attr('class', 'lc-chart-area')
      .attr('clip-path', `url(#${this.clipPathId})`)
  }

  /**
   * Lazily creates lc-scroll-container inside the chart area.
   * This is the only element that gets a translateX transform during transition animations.
   * No clip-path or mask here — those live on the static lc-chart-area parent.
   */
  private getOrCreateScrollContainer(
    chartArea: d3.Selection<SVGGElement, unknown, null, undefined>,
  ): d3.Selection<SVGGElement, unknown, null, undefined> {
    const existing = chartArea.select<SVGGElement>('.lc-scroll-container')
    if (!existing.empty()) return existing
    return chartArea.append('g').attr('class', 'lc-scroll-container')
  }

  private updateFadeMask(chartArea: d3.Selection<SVGGElement, unknown, null, undefined>): void {
    const w = this.innerWidth
    const margins = this.effectiveMargins()
    const leftExt = this.settings.margins.left

    // Mask rect spans from the left clip boundary to the right chart edge.
    // Extends vertically to cover x-axis tick marks and labels below innerHeight.
    this.fadeMaskRect
      .attr('x', -leftExt)
      .attr('y', -20)
      .attr('width', w + leftExt)
      .attr('height', this.innerHeight + 40)

    // With gradientUnits=objectBoundingBox the stop offsets are fractions of the mask rect width.
    // 0% = left clip edge (x = -leftExt)  →  opacity 0 (fully transparent)
    // yAxisFrac = y-axis position (x = 0) →  opacity 1 (fully opaque, holds to right edge)
    const totalW = w + leftExt
    const yAxisFrac = (leftExt / totalW * 100).toFixed(3)

    this.fadeStopLeft.attr('offset', '0%').attr('stop-color', 'white').attr('stop-opacity', 0.12)
    this.fadeStopLeft2.attr('offset', `${yAxisFrac}%`).attr('stop-color', 'white').attr('stop-opacity', 1)

    chartArea.attr('mask', `url(#${this.fadeMaskId})`)

    this.fadeBlurLeft.style.left = '0'
    this.fadeBlurLeft.style.width = `${margins.left}px`
  }

  private getSmoothedData(series: SeriesState): DataPoint[] {
    const w = series.smoothing ?? this.settings.smoothing
    return movingAverage(series.data, w)
  }

  private buildScales(): {
    xScale: d3.ScaleTime<number, number>
    yScales: Map<string, YScale>
  } {
    const allPoints = Array.from(this.series.values()).flatMap(s => s.data)
    const xExtent = d3.extent(allPoints, d => d.date) as [Date, Date]

    const yScales = new Map<string, YScale>()
    for (const axis of this.axes.values()) {
      yScales.set(axis.id, this.buildAxisYScale(axis))
    }

    return {
      xScale: d3.scaleTime().domain(xExtent).range([0, this.innerWidth]),
      yScales,
    }
  }

  /**
   * Domain selection:
   *   1. range present → use [range[0], range[1]] verbatim (no padding, no .nice()).
   *   2. limits present → auto extent from associated series, clamped to limits, then padded + nice.
   *   3. neither → auto extent from associated series, padded + nice.
   * Axes with no associated data fall back to [0, 1] so the rail still renders cleanly.
   */
  private buildAxisYScale(axis: AxisState): YScale {
    const isLog = axis.scaleType === 'log'

    if (axis.range) {
      if (isLog) {
        const lo = Math.max(axis.range[0], 1e-10)
        const hi = Math.max(axis.range[1], 1e-9)
        return d3.scaleLog().base(10).domain([lo, hi]).range([this.innerHeight, 0])
      }
      return d3.scaleLinear().domain([axis.range[0], axis.range[1]]).range([this.innerHeight, 0])
    }

    const points = Array.from(this.series.values())
      .filter(s => s.axisId === axis.id)
      .flatMap(s => this.getSmoothedData(s))

    if (points.length === 0) {
      const [lo, hi] = axis.limits ?? (isLog ? [0.1, 10] : [0, 1])
      if (isLog) {
        return d3.scaleLog().base(10).domain([Math.max(lo, 1e-10), Math.max(hi, 1e-9)]).range([this.innerHeight, 0])
      }
      return d3.scaleLinear().domain([lo, hi]).nice().range([this.innerHeight, 0])
    }

    let yMin = d3.min(points, d => d.value) ?? 0
    let yMax = d3.max(points, d => d.value) ?? 0
    if (axis.limits) {
      yMin = Math.max(yMin, axis.limits[0])
      yMax = Math.min(yMax, axis.limits[1])
      if (yMax < yMin) [yMin, yMax] = [axis.limits[0], axis.limits[1]]
    }

    if (isLog) {
      const clampedMin = Math.max(yMin, 1e-10)
      const clampedMax = Math.max(yMax, 1e-9)
      if (clampedMin !== yMin || clampedMax !== yMax) {
        console.warn('LineChart: log scale domain clamped to positive values', { yMin, yMax, clampedMin, clampedMax })
      }
      return d3.scaleLog().base(10).domain([clampedMin, clampedMax]).range([this.innerHeight, 0])
    }

    const yPad = (yMax - yMin) * 0.1 || 1
    return d3.scaleLinear().domain([yMin - yPad, yMax + yPad]).nice().range([this.innerHeight, 0])
  }

  private render(mode: AnimationMode): void {
    if (!this.hasData()) return

    const duration = mode !== 'none' ? this.settings.animationDuration : 0
    const { xScale, yScales } = this.buildScales()
    const layout = this.buildAxisLayout()
    const primaryYScale = yScales.get(layout[0].id)!

    const animatingStill = this.lastRender + duration > Date.now();
    const ease = animatingStill ? EASING_MAP.easeExpOut : EASING_MAP[this.settings.easingType]

    const margins = this.effectiveMargins()
    const innerTransform = `translate(${margins.left},${margins.top})`
    this.innerG.attr('transform', innerTransform)
    this.axisOverlayG?.attr('transform', innerTransform)

    // See updateFadeMask: leftExt is sized against the BASE margin so stacked axes'
    // label columns don't become part of the chart's clip area.
    const leftExt = this.settings.margins.left / 2
    const yAxisLabels = 32 // approximated
    this.clipRect
      .attr('x', -leftExt)
      .attr('width', this.innerWidth + leftExt + this.settings.margins.right)
      .attr('height', this.innerHeight + yAxisLabels)

    // lc-chart-area: static wrapper with clip-path + mask — must exist before
    // renderAxes so the y-axis (appended to innerG) renders on top of it.
    const chartArea = this.getOrCreateChartArea()
    this.updateFadeMask(chartArea)

    // lc-scroll-container: inside chart area; only this element gets translateX
    const scrollContainer = this.getOrCreateScrollContainer(chartArea)

    // --- Pre-compute and apply scroll shift for transition mode ---
    // This MUST happen before rendering content so elements never appear at
    // un-shifted new-scale positions (which would cause a visible snap).
    let scrollStartX = 0
    let scrollDelta = 0
    if (mode === 'transition' && duration > 0) {
      scrollContainer.interrupt()
      const raw = scrollContainer.attr('transform') || ''
      const m = raw.match(/translate\(\s*([-\d.e]+)/)
      const currentScrollX = m ? parseFloat(m[1]) : 0

      if (this.prevXScale) {
        const allPoints = Array.from(this.series.values()).flatMap(s => s.data)
        if (allPoints.length > 0) {
          const refDate = allPoints[0].date
          scrollStartX = (this.prevXScale(refDate) - xScale(refDate)) + currentScrollX
        }
      }

      scrollDelta = currentScrollX - scrollStartX

      scrollContainer.attr('transform',
        Math.abs(scrollStartX) > 0.5
          ? `translate(${scrollStartX}, 0)`
          : 'translate(0, 0)')
    }

    renderAxes({
      g: this.axisOverlayG ?? this.innerG,
      chartAreaG: chartArea,
      scrollG: scrollContainer,
      xScale,
      yScales,
      layout,
      innerWidth: this.innerWidth,
      innerHeight: this.innerHeight,
      settings: this.settings,
      mode,
      duration,
      ease,
    })

    // D3 data-join over series — one <g class="lc-series" data-id="…"> per series
    const seriesArray = Array.from(this.series.values())
    const groups = scrollContainer
      .selectAll<SVGGElement, SeriesState>('.lc-series')
      .data(seriesArray, s => s.id)

    groups.exit().remove()
    const merged = groups.enter()
      .append('g')
      .attr('class', 'lc-series')
      .attr('data-id', s => s.id)
      .merge(groups)

    const yScaleFor = (s: SeriesState): YScale =>
      yScales.get(s.axisId) ?? primaryYScale

    merged.each((s, i, nodes) => {
      const g = d3.select<SVGGElement, SeriesState>(nodes[i] as SVGGElement)
      const curve = CURVE_MAP[s.curveType ?? this.settings.curveType]
      const yScale = yScaleFor(s)
      const smoothed = this.getSmoothedData(s)
      const display = this.getDecimatedData(s, smoothed)
      this.renderLine(g, s, display, xScale, yScale, curve, mode, duration, ease)
      this.renderDots(g, s, display, xScale, yScale, mode, duration, ease)
      this.renderLabels(g, s, display, xScale, yScale, mode, duration, ease)
    })

    if (this.settings.showTooltip && this.tooltip !== null) {
      this.renderHoverZones(scrollContainer, xScale, yScaleFor)
    }

    // Reshift exiting elements so they don't jump when the container is repositioned.
    // Each element's local X is adjusted by scrollDelta so its visual position stays
    // where it was before the container moved. No transition — position only.
    if (mode === 'transition' && Math.abs(scrollDelta) > 0.5) {
      const ih = this.innerHeight
      scrollContainer.selectAll<SVGGElement, unknown>('.lc-x-tick-exiting')
        .attr('transform', function() {
          const t = d3.select(this).attr('transform') ?? 'translate(0,0)'
          const m = t.match(/translate\(\s*([-\d.e]+)\s*,\s*([-\d.e]+)/)
          return m ? `translate(${parseFloat(m[1]) + scrollDelta}, ${ih})` : t
        })
      scrollContainer.selectAll<SVGCircleElement, unknown>('.lc-dot-exiting')
        .attr('cx', function() {
          return parseFloat(d3.select(this).attr('cx') ?? '0') + scrollDelta
        })
    }

    // Animate scroll container to origin (transition mode) or reset (other modes)
    if (mode === 'transition' && duration > 0) {
      if (Math.abs(scrollStartX) > 0.5) {
        scrollContainer
          .transition()
          .duration(duration)
          .ease(ease)
          .attr('transform', 'translate(0, 0)')
      } else {
        scrollContainer.attr('transform', 'translate(0, 0)')
      }
    } else {
      // Reset any lingering scroll transform (resize, settings change, etc.)
      scrollContainer.interrupt().attr('transform', 'translate(0, 0)')
    }

    this.prevXScale = xScale
    this.lastRender = Date.now();

    this.renderTitleAndLabels()

    // Keep a small number of exit points per series so the blur is not disturbed
    for (const s of this.series.values()) {
      s.pendingExitPoints.splice(0, s.pendingExitPoints.length - 4)
    }
  }

  private renderTitleAndLabels(): void {
    const g = this.axisOverlayG ?? this.innerG
    const m = this.effectiveMargins()

    // Title — centred above the plot area in the top margin
    const titleText = this.settings.title
    const titleSel = g.select<SVGTextElement>('.lc-title')
    if (titleText) {
      const el = titleSel.empty()
        ? g.append<SVGTextElement>('text').attr('class', 'lc-title')
        : titleSel
      el
        .attr('x', this.innerWidth / 2)
        .attr('y', -(m.top / 2))
        .attr('dy', '0.35em')
        .attr('text-anchor', 'middle')
        .attr('font-size', '14px')
        .attr('font-family', 'sans-serif')
        .attr('font-weight', '600')
        .attr('fill', 'currentColor')
        .text(titleText)
    } else {
      titleSel.remove()
    }

    // X-axis label — centred below the axis ticks in the bottom margin
    const xLabelText = this.settings.xLabel
    const xLabelSel = g.select<SVGTextElement>('.lc-x-label')
    if (xLabelText) {
      const el = xLabelSel.empty()
        ? g.append<SVGTextElement>('text').attr('class', 'lc-x-label')
        : xLabelSel
      el
        .attr('x', this.innerWidth / 2)
        .attr('y', this.innerHeight + m.bottom - 6)
        .attr('text-anchor', 'middle')
        .attr('font-size', '12px')
        .attr('font-family', 'sans-serif')
        .attr('fill', 'currentColor')
        .text(xLabelText)
    } else {
      xLabelSel.remove()
    }

    // Y-axis label — rotated 90° along the left margin
    const yLabelText = this.settings.yLabel
    const yLabelSel = g.select<SVGTextElement>('.lc-y-label')
    if (yLabelText) {
      const el = yLabelSel.empty()
        ? g.append<SVGTextElement>('text').attr('class', 'lc-y-label')
        : yLabelSel
      el
        .attr('transform', `translate(${-(m.left - 12)},${this.innerHeight / 2}) rotate(-90)`)
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .attr('font-size', '12px')
        .attr('font-family', 'sans-serif')
        .attr('fill', 'currentColor')
        .text(yLabelText)
    } else {
      yLabelSel.remove()
    }
  }

  private renderLine(
    g: d3.Selection<SVGGElement, SeriesState, null, undefined>,
    series: SeriesState,
    smoothed: DataPoint[],
    xScale: d3.ScaleTime<number, number>,
    yScale: YScale,
    curve: d3.CurveFactory | d3.CurveFactoryLineOnly,
    mode: AnimationMode,
    duration: number,
    ease: (t: number) => number,
  ): void {
    const lineGen = d3
      .line<DataPoint>()
      .x(d => xScale(d.date))
      .y(d => yScale(d.value))
      .curve(curve)

    const existing = g.select<SVGPathElement>('.lc-line')
    const isNew = existing.empty()

    const path = (isNew ? g.append('path') : existing)
      .attr('class', 'lc-line')
      .attr('fill', 'none')
      .attr('stroke', this.resolveStrokeColor(series))
      .attr('stroke-width', series.lineWeight ?? this.settings.lineWeight)
      .attr('stroke-linecap', 'round')
      .attr('stroke-linejoin', 'round')

    // drawOn: stroke-dasharray trick
    // morph + isNew: fall back to drawOn
    // transition + isNew: fall back to drawOn
    const useDrawOn = mode === 'drawOn' || ((mode === 'transition' || mode === 'morph') && isNew)

    if (useDrawOn && duration > 0) {
      path.attr('d', lineGen(smoothed) ?? '')
      const totalLength = path.node()?.getTotalLength() ?? 0
      path
        .attr('stroke-dasharray', `${totalLength} ${totalLength}`)
        .attr('stroke-dashoffset', totalLength)
        .transition()
        .duration(duration)
        .ease(ease)
        .attr('stroke-dashoffset', 0)
        .on('end', () => {
          path.attr('stroke-dasharray', null).attr('stroke-dashoffset', null)
        })
    } else if (mode === 'morph' && duration > 0) {
      // D3 path morph — include exit points so control-point count stays identical
      const renderData =
        series.pendingExitPoints.length > 0
          ? [...series.pendingExitPoints, ...smoothed]
          : smoothed
      path
        .transition()
        .duration(duration)
        .ease(ease)
        .attr('d', lineGen(renderData) ?? '')
    } else if (mode === 'transition') {
      // Container handles the animation; render path instantly.
      // Include exit points (at negative x) so the leftmost segment clips off cleanly.
      const renderData =
        series.pendingExitPoints.length > 0
          ? [...series.pendingExitPoints, ...smoothed]
          : smoothed
      path
        .attr('d', lineGen(renderData) ?? '')
        .attr('stroke-dasharray', null)
        .attr('stroke-dashoffset', null)
    } else {
      path
        .attr('d', lineGen(smoothed) ?? '')
        .attr('stroke-dasharray', null)
        .attr('stroke-dashoffset', null)
    }
  }

  private renderDots(
    g: d3.Selection<SVGGElement, SeriesState, null, undefined>,
    series: SeriesState,
    smoothed: DataPoint[],
    xScale: d3.ScaleTime<number, number>,
    yScale: YScale,
    mode: AnimationMode,
    duration: number,
    ease: (t: number) => number,
  ): void {
    const dotRadius = series.dotRadius ?? this.settings.dotRadius
    if (dotRadius === 0) {
      g.selectAll('.lc-dot,.lc-dot-exiting').remove()
      return
    }

    const joinData =
      series.pendingExitPoints.length > 0
        ? [...series.pendingExitPoints, ...smoothed]
        : smoothed

    const dots = g
      .selectAll<SVGCircleElement, DataPoint>('.lc-dot')
      .data(joinData, d => d.date.getTime())

    const dotColor = this.resolveStrokeColor(series)
    const dotStroke = this.settings.dotBorderColor
      ?? (this.settings.theme === 'dark' ? '#1a1815' : '#fff')
    const enter = dots
      .enter()
      .append('circle')
      .attr('class', 'lc-dot')
      .attr('cx', d => xScale(d.date))
      .attr('cy', d => yScale(d.value))
      .attr('r', 0)
      .attr('stroke-width', 2)

    const merged = enter.merge(dots)
      .attr('fill', dotColor)
      .attr('stroke', dotStroke)

    if (mode === 'morph' && duration > 0) {
      merged
        .transition()
        .duration(duration)
        .ease(ease)
        .attr('cx', d => xScale(d.date))
        .attr('cy', d => yScale(d.value))
        .attr('r', dotRadius)
    } else {
      // transition mode and none: snap to final positions; container drives the animation
      merged
        .attr('cx', d => xScale(d.date))
        .attr('cy', d => yScale(d.value))
        .attr('r', dotRadius)
    }

    // Rename class immediately so future joins never see these elements again,
    // then fade them out independently of any subsequent render.
    const exitDots = dots.exit<DataPoint>().attr('class', 'lc-dot-exiting')
    if (duration > 0) {
      exitDots.transition().duration(duration).ease(ease).style('opacity', 0).remove()
    } else {
      exitDots.remove()
    }
  }

  private renderLabels(
    g: d3.Selection<SVGGElement, SeriesState, null, undefined>,
    series: SeriesState,
    smoothed: DataPoint[],
    xScale: d3.ScaleTime<number, number>,
    yScale: YScale,
    mode: AnimationMode,
    duration: number,
    ease: (t: number) => number,
  ): void {
    if (!this.settings.showLabels) {
      g.selectAll('.lc-label').remove()
      return
    }

    const fmt = d3.format(this.settings.labelFormat ?? this.settings.tooltipValueFormat)
    const color = this.resolveStrokeColor(series)
    const dotRadius = series.dotRadius ?? this.settings.dotRadius
    const offsetY = dotRadius > 0 ? -(dotRadius + 5) : -8
    const labels = g
      .selectAll<SVGTextElement, DataPoint>('.lc-label')
      .data(smoothed, d => d.date.getTime())

    const enter = labels
      .enter()
      .append('text')
      .attr('class', 'lc-label')
      .attr('x', d => xScale(d.date))
      .attr('y', d => yScale(d.value) + offsetY)
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px')
      .attr('font-family', 'sans-serif')
      .attr('fill', color)
      .attr('pointer-events', 'none')
      .style('opacity', 0)
      .text(d => fmt(d.value))

    const merged = enter.merge(labels).attr('fill', color).text(d => fmt(d.value))

    if (mode !== 'none' && duration > 0) {
      merged
        .transition()
        .duration(duration)
        .ease(ease)
        .attr('x', d => xScale(d.date))
        .attr('y', d => yScale(d.value) + offsetY)
        .style('opacity', 1)
    } else {
      merged
        .attr('x', d => xScale(d.date))
        .attr('y', d => yScale(d.value) + offsetY)
        .style('opacity', 1)
    }

    labels.exit().transition().duration(duration > 0 ? duration : 0).style('opacity', 0).remove()
  }

  private renderHoverZones(
    scrollContainer: d3.Selection<SVGGElement, unknown, null, undefined>,
    xScale: d3.ScaleTime<number, number>,
    yScaleFor: (series: SeriesState) => YScale,
  ): void {
    const hitRadius = Math.max(
      Math.max(...Array.from(this.series.values()).map(s => s.dotRadius ?? this.settings.dotRadius)),
      8,
    )

    // Single group above all series groups for correct paint order
    let zonesG = scrollContainer.select<SVGGElement>('.lc-hover-zones')
    if (zonesG.empty()) {
      zonesG = scrollContainer.append('g').attr('class', 'lc-hover-zones')
    }

    // Each datum carries its own y-scale via the series it came from, so dots on
    // different axes get accurate hit positions.
    const allData: HoverDatum[] = []
    for (const s of this.series.values()) {
      const yScale = yScaleFor(s)
      for (const d of s.data) allData.push({ ...d, seriesId: s.id, seriesName: s.id, _y: yScale(d.value) })
    }

    const zones = zonesG
      .selectAll<SVGCircleElement, HoverDatum>('.lc-hover-zone')
      .data(allData, d => `${d.date.getTime()}-${d.seriesId}`)

    zones
      .enter()
      .append('circle')
      .attr('class', 'lc-hover-zone')
      .attr('r', hitRadius)
      .attr('fill', 'transparent')
      .attr('stroke', 'none')
      .attr('cursor', 'crosshair')
      .merge(zones)
      .attr('cx', d => xScale(d.date))
      .attr('cy', d => d._y)
      .on('mouseenter', (event: MouseEvent, d: HoverDatum) => {
        this.tooltip?.show(event, d, this.series.size > 1 ? d.seriesName : undefined)
      })
      .on('mousemove', (event: MouseEvent) => {
        this.tooltip?.move(event)
      })
      .on('mouseleave', () => {
        this.tooltip?.hide()
      })

    zones.exit().remove()
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error('LineChart: called on destroyed instance')
  }
}
