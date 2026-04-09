import * as d3 from 'd3'
import type {
  RawDataPoint,
  DataPoint,
  ChartSettings,
  CurveType,
  EasingType,
  LineChartHandle,
  AnimationMode,
} from './types.ts'
import { DEFAULT_SETTINGS } from './defaults.ts'
import { renderSkeleton, removeSkeleton } from './skeleton.ts'
import { renderAxes } from './axes.ts'
import { TooltipController } from './tooltip.ts'

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
  private data: DataPoint[] = []
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
  private fadeStopRight1: d3.Selection<SVGStopElement, unknown, null, undefined>
  private fadeStopRight: d3.Selection<SVGStopElement, unknown, null, undefined>
  private fadeMaskRect: d3.Selection<SVGRectElement, unknown, null, undefined>
  private fadeBlurLeft!: HTMLDivElement
  private fadeBlurRight!: HTMLDivElement

  // Render y-axis above blur
  private axisOverlaySvg: d3.Selection<SVGSVGElement, unknown, null, undefined> | null = null
  private axisOverlayG: d3.Selection<SVGGElement, unknown, null, undefined> | null = null

  private pendingExitPoints: DataPoint[] = []
  private prevXScale: d3.ScaleTime<number, number> | null = null

  private lastRender: number = Date.now()

  constructor(divId: string, settings?: Partial<ChartSettings>) {
    const el = document.getElementById(divId)
    if (el === null) throw new Error(`LineChart: no element with id "${divId}"`)
    this.container = el
    this.settings = { ...DEFAULT_SETTINGS, ...settings }

    const rect = this.container.getBoundingClientRect()
    this.width = rect.width || 600
    this.height = rect.height || 300

    this.svg = d3
      .select(this.container)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', `0 0 ${this.width} ${this.height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .attr('role', 'img')
      .attr('aria-label', this.settings.ariaLabel)

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
    this.fadeStopRight1 = grad.append('stop')
    this.fadeStopRight = grad.append('stop')

    this.fadeMaskRect = defs
      .append('mask')
      .attr('id', this.fadeMaskId)
      .append('rect')
      .attr('x', 0)
      .attr('y', -20)
      .attr('width', this.innerWidth)
      .attr('height', this.innerHeight + 40)
      .attr('fill', `url(#${this.fadeGradId})`)

    this.innerG = this.svg
      .append('g')
      .attr('class', 'lc-inner')
      .attr('transform', `translate(${this.settings.margins.left},${this.settings.margins.top})`)

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

    this.fadeBlurRight = document.createElement('div')
    this.fadeBlurRight.style.cssText =
      blurStyle +
      ';mask-image:linear-gradient(to left,black 0%,black 75%,transparent 100%)' +
      ';-webkit-mask-image:linear-gradient(to left,black 0%,black 75%,transparent 100%)'
    this.container.appendChild(this.fadeBlurRight)

    // Overlay SVG sits above the blur divs (z-index 2) and contains only the y-axis,
    this.axisOverlaySvg = d3
      .select(this.container)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
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
      .attr('transform', `translate(${this.settings.margins.left},${this.settings.margins.top})`)

    renderSkeleton(this.svg, this.width, this.height, this.settings.margins)

    this.resizeObserver = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry === undefined) return
      const { width, height } = entry.contentRect
      if (width === this.width && height === this.height) return
      this.width = width
      this.height = height
      this.svg.attr('viewBox', `0 0 ${width} ${height}`)
      this.axisOverlaySvg?.attr('viewBox', `0 0 ${width} ${height}`)
      if (this.data.length > 0) this.render('none')
    })
    this.resizeObserver.observe(this.container)
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  setData(data: RawDataPoint[]): void {
    this.assertAlive()
    this.data = data.map(parseRaw)
    this.dismissSkeleton()
    this.ensureTooltip()
    this.render(this.settings.setDataAnimation)
  }

  updateData(data: RawDataPoint[]): void {
    this.assertAlive()
    const incoming = data.map(parseRaw)

    if (this.data.length === 0) {
      this.data = incoming
      this.dismissSkeleton()
      this.ensureTooltip()
      this.render(this.settings.updateDataAnimation)
      return
    }

    const overlap = computeOverlap(this.data, incoming)
    const ratio = overlap / Math.max(this.data.length, incoming.length)
    const sufficient =
      overlap >= this.settings.minOverlapForTransition &&
      ratio >= this.settings.overlapThreshold

    // Compute exit points for visual continuity during animated transitions
    const incomingSet = new Set(incoming.map(p => p.date.getTime()))
    this.pendingExitPoints = this.data.filter(p => !incomingSet.has(p.date.getTime()))

    this.data = incoming

    if (sufficient) {
      this.render(this.settings.updateDataAnimation)
    } else {
      this.pendingExitPoints = []
      this.innerG.selectAll('.lc-line,.lc-dots,.lc-dot,.lc-hover-zone').remove()
      this.render(this.settings.updateDataAnimation)
    }
  }

  updateSettings(settings: Partial<ChartSettings>): void {
    this.assertAlive()
    const hadTooltip = this.settings.showTooltip
    this.settings = { ...this.settings, ...settings }

    if (!hadTooltip && this.settings.showTooltip && this.data.length > 0) {
      this.ensureTooltip()
    } else if (hadTooltip && !this.settings.showTooltip) {
      this.tooltip?.destroy()
      this.tooltip = null
    }

    if (this.data.length > 0) this.render('none')
  }

  setLineColor(color: string): void {
    this.assertAlive()
    this.settings = { ...this.settings, lineColor: color }
    this.innerG.select('.lc-line').attr('stroke', color)
    this.innerG.selectAll('.lc-dot').attr('fill', color)
  }

  setLineWeight(weight: number): void {
    this.assertAlive()
    this.settings = { ...this.settings, lineWeight: weight }
    this.innerG.select('.lc-line').attr('stroke-width', weight)
  }

  appendDataPoint(point: RawDataPoint): void {
    this.assertAlive()
    this.data.push(parseRaw(point))
    this.pendingExitPoints = this.trimToMaxPoints()
    if (this.data.length > 0) this.render(this.settings.appendAnimation)
  }

  appendDataPoints(points: RawDataPoint[]): void {
    this.assertAlive()
    for (const p of points) this.data.push(parseRaw(p))
    this.pendingExitPoints = this.trimToMaxPoints()
    if (this.data.length > 0) this.render(this.settings.appendAnimation)
  }

  clearData(): void {
    this.assertAlive()
    this.data = []
    this.pendingExitPoints = []
    this.innerG.selectAll('*').remove()
    this.hasSkeleton = true
    renderSkeleton(this.svg, this.width, this.height, this.settings.margins)
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.resizeObserver?.disconnect()
    this.tooltip?.destroy()
    this.svg.remove()
    this.axisOverlaySvg?.remove()
    this.fadeBlurLeft.remove()
    this.fadeBlurRight.remove()
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private get innerWidth(): number {
    return this.width - this.settings.margins.left - this.settings.margins.right
  }

  private get innerHeight(): number {
    return this.height - this.settings.margins.top - this.settings.margins.bottom
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

  private trimToMaxPoints(): DataPoint[] {
    const max = this.settings.maxDataPoints
    if (max === null || max <= 0 || this.data.length <= max) return []
    const newExit = this.data.splice(0, this.data.length - max);
    return this.pendingExitPoints.concat(newExit)
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
    const fw = this.settings.edgeFadeWidth
    const w = this.innerWidth
    // Left fade: always active. Clip + fade-to-transparent starts halfway between the
    // SVG left edge and the y-axis (i.e. margins.left / 2 to the left of x=0).
    const leftExt = this.settings.margins.left / 2

    // Mask rect spans from the left clip boundary to the right chart edge.
    // Extends vertically to cover x-axis tick marks and labels below innerHeight.
    this.fadeMaskRect
      .attr('x', -leftExt)
      .attr('y', -20)
      .attr('width', w + leftExt)
      .attr('height', this.innerHeight + 40)

    // With objectBoundingBox the stop offsets are fractions of the mask rect width.
    // 0% = left clip edge (x = -leftExt)   →  opacity 0 (fully transparent)
    // yAxisFrac = y-axis position (x = 0)  →  opacity 1 (fully opaque)
    // rightFrac = right-fade start          →  opacity 1
    // 100% = right edge (x = innerWidth)   →  opacity 0 if edgeFadeWidth > 0, else 1
    const totalW = w + leftExt
    const yAxisFrac = (leftExt / totalW * 100).toFixed(3)
    const rightFrac = fw > 0
      ? ((w - fw + leftExt) / totalW * 100).toFixed(3)
      : '100'

    this.fadeStopLeft.attr('offset', '0%').attr('stop-color', 'white').attr('stop-opacity', 0.12)
    this.fadeStopLeft2.attr('offset', `${yAxisFrac}%`).attr('stop-color', 'white').attr('stop-opacity', 1)
    this.fadeStopRight1.attr('offset', `${rightFrac}%`).attr('stop-color', 'white').attr('stop-opacity', 1)
    this.fadeStopRight.attr('offset', '100%').attr('stop-color', 'white').attr('stop-opacity', fw > 0 ? 0.12 : 1)

    // Left fade is always active; apply mask unconditionally.
    chartArea.attr('mask', `url(#${this.fadeMaskId})`)

    // Position the HTML blur overlays to match the fade zones.
    // Since viewBox = container dimensions, SVG units ≈ CSS pixels.
    this.fadeBlurLeft.style.left = '0'
    this.fadeBlurLeft.style.width = `${this.settings.margins.left}px`

    if (fw > 0) {
      this.fadeBlurRight.style.display = 'block'
      this.fadeBlurRight.style.right = `${this.settings.margins.right}px`
      this.fadeBlurRight.style.width = `${fw}px`
    } else {
      this.fadeBlurRight.style.display = 'none'
    }
  }

  private buildScales(): {
    xScale: d3.ScaleTime<number, number>
    yScale: d3.ScaleLinear<number, number>
  } {
    const xExtent = d3.extent(this.data, d => d.date) as [Date, Date]
    const yMax = d3.max(this.data, d => d.value) ?? 0
    const yMin = d3.min(this.data, d => d.value) ?? 0
    const yPad = (yMax - yMin) * 0.1 || 1

    return {
      xScale: d3.scaleTime().domain(xExtent).range([0, this.innerWidth]),
      yScale: d3.scaleLinear().domain([yMin - yPad, yMax + yPad]).nice().range([this.innerHeight, 0]),
    }
  }

  private render(mode: AnimationMode): void {
    if (this.data.length === 0) return

    const duration = mode !== 'none' ? this.settings.animationDuration : 0
    const { xScale, yScale } = this.buildScales()
    const curve = CURVE_MAP[this.settings.curveType]

    const animatingStill = this.lastRender + duration > Date.now();
    const ease = animatingStill ? EASING_MAP.easeExpOut : EASING_MAP[this.settings.easingType]

    const innerTransform = `translate(${this.settings.margins.left},${this.settings.margins.top})`
    this.innerG.attr('transform', innerTransform)
    this.axisOverlayG?.attr('transform', innerTransform)

    const leftExt = this.settings.margins.left / 2
    const yAxisLabels = 32 // approximated
    this.clipRect
      .attr('x', -leftExt)
      .attr('width', this.innerWidth + leftExt)
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

      if (this.prevXScale && this.data.length > 0) {
        const refDate = this.data[0].date
        scrollStartX = (this.prevXScale(refDate) - xScale(refDate)) + currentScrollX
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
      yScale,
      innerWidth: this.innerWidth,
      innerHeight: this.innerHeight,
      settings: this.settings,
      mode,
      duration,
      ease,
    })

    this.renderLine(scrollContainer, xScale, yScale, curve, mode, duration, ease)
    this.renderDots(scrollContainer, xScale, yScale, mode, duration, ease)

    if (this.settings.showTooltip && this.tooltip !== null) {
      this.renderHoverZones(scrollContainer, xScale, yScale)
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

    // Keep a small number of exit points so the blur is not disturbed
    this.pendingExitPoints.splice(0, this.pendingExitPoints.length - 4);
  }

  private renderLine(
    scrollContainer: d3.Selection<SVGGElement, unknown, null, undefined>,
    xScale: d3.ScaleTime<number, number>,
    yScale: d3.ScaleLinear<number, number>,
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

    const existing = scrollContainer.select<SVGPathElement>('.lc-line')
    const isNew = existing.empty()

    const path = (isNew ? scrollContainer.append('path') : existing)
      .attr('class', 'lc-line')
      .attr('fill', 'none')
      .attr('stroke', this.settings.lineColor)
      .attr('stroke-width', this.settings.lineWeight)
      .attr('stroke-linecap', 'round')
      .attr('stroke-linejoin', 'round')

    // drawOn: stroke-dasharray trick
    // morph + isNew: fall back to drawOn
    // transition + isNew: fall back to drawOn
    const useDrawOn = mode === 'drawOn' || ((mode === 'transition' || mode === 'morph') && isNew)

    if (useDrawOn && duration > 0) {
      path.attr('d', lineGen(this.data) ?? '')
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
        this.pendingExitPoints.length > 0
          ? [...this.pendingExitPoints, ...this.data]
          : this.data
      path
        .transition()
        .duration(duration)
        .ease(ease)
        .attr('d', lineGen(renderData) ?? '')
    } else if (mode === 'transition') {
      // Container handles the animation; render path instantly.
      // Include exit points (at negative x) so the leftmost segment clips off cleanly.
      const renderData =
        this.pendingExitPoints.length > 0
          ? [...this.pendingExitPoints, ...this.data]
          : this.data
      path
        .attr('d', lineGen(renderData) ?? '')
        .attr('stroke-dasharray', null)
        .attr('stroke-dashoffset', null)
    } else {
      path
        .attr('d', lineGen(this.data) ?? '')
        .attr('stroke-dasharray', null)
        .attr('stroke-dashoffset', null)
    }
  }

  private renderDots(
    scrollContainer: d3.Selection<SVGGElement, unknown, null, undefined>,
    xScale: d3.ScaleTime<number, number>,
    yScale: d3.ScaleLinear<number, number>,
    mode: AnimationMode,
    duration: number,
    ease: (t: number) => number,
  ): void {
    if (this.settings.dotRadius === 0) {
      scrollContainer.selectAll('.lc-dot,.lc-dot-exiting').remove()
      return
    }

    const joinData =
      this.pendingExitPoints.length > 0
        ? [...this.pendingExitPoints, ...this.data]
        : this.data

    const dots = scrollContainer
      .selectAll<SVGCircleElement, DataPoint>('.lc-dot')
      .data(joinData, d => d.date.getTime())

    const enter = dots
      .enter()
      .append('circle')
      .attr('class', 'lc-dot')
      .attr('cx', d => xScale(d.date))
      .attr('cy', d => yScale(d.value))
      .attr('r', 0)
      .attr('fill', this.settings.lineColor)
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)

    const merged = enter.merge(dots).attr('fill', this.settings.lineColor)

    if (mode === 'morph' && duration > 0) {
      merged
        .transition()
        .duration(duration)
        .ease(ease)
        .attr('cx', d => xScale(d.date))
        .attr('cy', d => yScale(d.value))
        .attr('r', this.settings.dotRadius)
    } else {
      // transition mode and none: snap to final positions; container drives the animation
      merged
        .attr('cx', d => xScale(d.date))
        .attr('cy', d => yScale(d.value))
        .attr('r', this.settings.dotRadius)
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

  private renderHoverZones(
    scrollContainer: d3.Selection<SVGGElement, unknown, null, undefined>,
    xScale: d3.ScaleTime<number, number>,
    yScale: d3.ScaleLinear<number, number>,
  ): void {
    const hitRadius = Math.max(this.settings.dotRadius, 8)

    const zones = scrollContainer
      .selectAll<SVGCircleElement, DataPoint>('.lc-hover-zone')
      .data(this.data, d => d.date.getTime())

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
      .attr('cy', d => yScale(d.value))
      .on('mouseenter', (event: MouseEvent, d: DataPoint) => {
        this.tooltip?.show(event, d)
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
