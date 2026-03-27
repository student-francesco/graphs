import * as d3 from 'd3'
import type {
  RawDataPoint,
  DataPoint,
  ChartSettings,
  CurveType,
  LineChartHandle,
} from './types.ts'
import { DEFAULT_SETTINGS } from './defaults.ts'
import { renderSkeleton, removeSkeleton } from './skeleton.ts'
import { renderAxes } from './axes.ts'
import { TooltipController } from './tooltip.ts'

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

/**
 * Compute overlap between two sorted arrays of DataPoints (sorted by date asc).
 * Returns the number of timestamps present in both.
 */
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

  constructor(divId: string, settings?: Partial<ChartSettings>) {
    const el = document.getElementById(divId)
    if (el === null) throw new Error(`LineChart: no element with id "${divId}"`)
    this.container = el
    this.settings = { ...DEFAULT_SETTINGS, ...settings }

    // Seed dimensions from container; fall back to sensible defaults
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

    this.innerG = this.svg
      .append('g')
      .attr('class', 'lc-inner')
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
      if (this.data.length > 0) this.render(false)
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
    this.render(true)
  }

  updateData(data: RawDataPoint[]): void {
    this.assertAlive()
    const incoming = data.map(parseRaw)

    // First call — treat as setData
    if (this.data.length === 0) {
      this.data = incoming
      this.dismissSkeleton()
      this.ensureTooltip()
      this.render(true)
      return
    }

    const overlap = computeOverlap(this.data, incoming)
    const ratio = overlap / Math.max(this.data.length, incoming.length)
    const sufficient =
      overlap >= this.settings.minOverlapForTransition &&
      ratio >= this.settings.overlapThreshold

    this.data = incoming

    if (sufficient) {
      // Smooth transition: scales shift, line/dots animate to new positions
      this.render(true)
    } else {
      // No meaningful overlap — full replace with draw-on animation
      this.innerG.selectAll('.lc-line,.lc-dots,.lc-dot,.lc-hover-zone').remove()
      this.render(true)
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

    if (this.data.length > 0) this.render(false)
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
    if (this.data.length > 0) this.render(false)
  }

  appendDataPoints(points: RawDataPoint[]): void {
    this.assertAlive()
    for (const p of points) this.data.push(parseRaw(p))
    if (this.data.length > 0) this.render(false)
  }

  clearData(): void {
    this.assertAlive()
    this.data = []
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

  private render(animate: boolean): void {
    if (this.data.length === 0) return

    const duration = animate ? this.settings.animationDuration : 0
    const { xScale, yScale } = this.buildScales()
    const curve = CURVE_MAP[this.settings.curveType]

    this.innerG.attr(
      'transform',
      `translate(${this.settings.margins.left},${this.settings.margins.top})`,
    )

    renderAxes({
      g: this.innerG,
      xScale,
      yScale,
      innerWidth: this.innerWidth,
      innerHeight: this.innerHeight,
      settings: this.settings,
      animate,
      duration,
    })

    this.renderLine(xScale, yScale, curve, animate, duration)
    this.renderDots(xScale, yScale, animate, duration)

    if (this.settings.showTooltip && this.tooltip !== null) {
      this.renderHoverZones(xScale, yScale)
    }
  }

  private renderLine(
    xScale: d3.ScaleTime<number, number>,
    yScale: d3.ScaleLinear<number, number>,
    curve: d3.CurveFactory | d3.CurveFactoryLineOnly,
    animate: boolean,
    duration: number,
  ): void {
    const lineGen = d3
      .line<DataPoint>()
      .x(d => xScale(d.date))
      .y(d => yScale(d.value))
      .curve(curve)

    const existing = this.innerG.select<SVGPathElement>('.lc-line')
    const isNew = existing.empty()

    const path = (isNew ? this.innerG.append('path') : existing)
      .attr('class', 'lc-line')
      .attr('fill', 'none')
      .attr('stroke', this.settings.lineColor)
      .attr('stroke-width', this.settings.lineWeight)
      .attr('stroke-linecap', 'round')
      .attr('stroke-linejoin', 'round')

    if (isNew && animate && duration > 0) {
      // Draw-on animation for brand-new path
      path.attr('d', lineGen(this.data) ?? '')
      const node = path.node()
      const totalLength = node?.getTotalLength() ?? 0
      path
        .attr('stroke-dasharray', `${totalLength} ${totalLength}`)
        .attr('stroke-dashoffset', totalLength)
        .transition()
        .duration(duration)
        .ease(d3.easeCubicInOut)
        .attr('stroke-dashoffset', 0)
        .on('end', () => {
          path.attr('stroke-dasharray', null).attr('stroke-dashoffset', null)
        })
    } else if (animate && duration > 0) {
      // Smooth transition for existing path (sliding window / data update)
      path
        .transition()
        .duration(duration)
        .ease(d3.easeCubicInOut)
        .attr('d', lineGen(this.data) ?? '')
    } else {
      path.attr('d', lineGen(this.data) ?? '')
        .attr('stroke-dasharray', null)
        .attr('stroke-dashoffset', null)
    }
  }

  private renderDots(
    xScale: d3.ScaleTime<number, number>,
    yScale: d3.ScaleLinear<number, number>,
    animate: boolean,
    duration: number,
  ): void {
    if (this.settings.dotRadius === 0) {
      this.innerG.selectAll('.lc-dot').remove()
      return
    }

    const dots = this.innerG
      .selectAll<SVGCircleElement, DataPoint>('.lc-dot')
      .data(this.data, d => d.date.getTime())

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

    if (animate && duration > 0) {
      merged
        .transition()
        .duration(duration)
        .ease(d3.easeCubicOut)
        .attr('cx', d => xScale(d.date))
        .attr('cy', d => yScale(d.value))
        .attr('r', this.settings.dotRadius)
    } else {
      merged
        .attr('cx', d => xScale(d.date))
        .attr('cy', d => yScale(d.value))
        .attr('r', this.settings.dotRadius)
    }

    dots
      .exit()
      .transition()
      .duration(duration > 0 ? duration / 2 : 0)
      .attr('r', 0)
      .remove()
  }

  private renderHoverZones(
    xScale: d3.ScaleTime<number, number>,
    yScale: d3.ScaleLinear<number, number>,
  ): void {
    const hitRadius = Math.max(this.settings.dotRadius, 8)

    const zones = this.innerG
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
