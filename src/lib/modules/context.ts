import * as d3 from 'd3'
import {
  prepareStep,
  renderStep,
  storeSpec,
  type ChartModule,
} from '../engine/index.ts'
import type { ChartMargins } from '../types.ts'
import {
  ContainerSize,
  D3Ctx,
  Layout,
  MarginRequests,
  Settings,
  type D3Context,
  type LayoutBox,
} from './tokens.ts'

/**
 * The context module starts the chart inside the containing div: it owns the svg
 * scaffold (defs, clip path, fade mask, inner group, blur overlay, axis-overlay
 * svg), realizes the z-ordered layer tree for every other module, watches the
 * container size, merges margin contributions into the Layout, and keeps the
 * frame chrome (viewBox, transforms, clip, mask) in sync each pass.
 *
 * It must be FIRST in a chart's module list — later modules' mounts may resolve
 * layers, which exist only after this module's mount realized them.
 */
export function contextModule(container: HTMLElement): ChartModule {
  let scaffold: D3Context | null = null

  const buildScaffold = (): D3Context => {
    const rect = container.getBoundingClientRect()
    const width = rect.width || 600
    const height = rect.height || 300

    const svg = d3
      .select(container)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .style('display', 'block')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .attr('role', 'img')

    const defs = svg.append('defs')

    const clipPathId = `lc-clip-${Math.random().toString(36).slice(2, 9)}`
    const clipRect = defs
      .append('clipPath')
      .attr('id', clipPathId)
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)

    const fadeGradId = `lc-fade-grad-${Math.random().toString(36).slice(2, 9)}`
    const fadeMaskId = `lc-fade-mask-${Math.random().toString(36).slice(2, 9)}`

    const grad = defs
      .append('linearGradient')
      .attr('id', fadeGradId)
      // objectBoundingBox (default) — stop offsets are fractions of the mask rect's
      // width, so they stay correct regardless of coordinate transforms.
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '100%')
      .attr('y2', '0%')

    const fadeStopLeft = grad.append('stop')
    const fadeStopLeft2 = grad.append('stop')

    const fadeMaskRect = defs
      .append('mask')
      .attr('id', fadeMaskId)
      .append('rect')
      .attr('x', 0)
      .attr('y', -20)
      .attr('fill', `url(#${fadeGradId})`)

    const innerG = svg.append('g').attr('class', 'lc-inner')

    // chart area: static wrapper carrying clip + mask; scroll container is the only
    // element that ever gets a translateX during transition animations.
    const chartAreaG = innerG
      .append('g')
      .attr('class', 'lc-chart-area')
      .attr('clip-path', `url(#${clipPathId})`)
      .attr('mask', `url(#${fadeMaskId})`)
    const scrollG = chartAreaG.append('g').attr('class', 'lc-scroll-container')

    // Ensure container is a positioning context for the blur overlay
    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative'
    }

    const blurStrength = 6
    const blurEnd = 90
    const blurDiv = document.createElement('div')
    blurDiv.style.cssText =
      'position:absolute;top:0;height:100%;pointer-events:none;z-index:1;' +
      `backdrop-filter:blur(${blurStrength}px);-webkit-backdrop-filter:blur(${blurStrength}px)` +
      `;mask-image:linear-gradient(to right,black 0%,black ${blurEnd}%,transparent 100%)` +
      `;-webkit-mask-image:linear-gradient(to right,black 0%,black ${blurEnd}%,transparent 100%)`
    container.appendChild(blurDiv)

    // Overlay svg sits above the blur div (z-index 2): y-axes + chrome labels.
    const overlaySvg = d3
      .select(container)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .style('display', 'block')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .attr('aria-hidden', 'true')
      .style('position', 'absolute')
      .style('top', '0')
      .style('left', '0')
      .style('pointer-events', 'none')
      .style('z-index', '2')

    const overlayG = overlaySvg.append('g').attr('class', 'lc-axis-overlay')

    return {
      container,
      svg,
      overlaySvg,
      defs,
      innerG,
      overlayG,
      chartAreaG,
      scrollG,
      clipRect,
      fadeMaskRect,
      fadeStopLeft,
      fadeStopLeft2,
      blurDiv,
    }
  }

  const sumSide = (
    requests: readonly Partial<ChartMargins>[],
    side: keyof ChartMargins,
  ): number => requests.reduce((sum, r) => sum + (r[side] ?? 0), 0)

  return {
    id: 'context',
    stores: [
      storeSpec({
        token: D3Ctx,
        init: () => {
          scaffold = buildScaffold()
          return scaffold
        },
      }),
      storeSpec({
        token: ContainerSize,
        init: () => {
          const rect = container.getBoundingClientRect()
          return { width: rect.width || 600, height: rect.height || 300 }
        },
      }),
    ],

    prepare: [
      prepareStep({
        id: 'layout.merge',
        description: 'Fold all margin requests into the base margins and derive the inner plot box dimensions.',
        reads: { settings: Settings, size: ContainerSize, requests: MarginRequests },
        provides: Layout,
        run: ({ settings, size, requests }): LayoutBox => {
          const base = settings.margins
          const margins: ChartMargins = {
            top: base.top + sumSide(requests, 'top'),
            right: base.right + sumSide(requests, 'right'),
            bottom: base.bottom + sumSide(requests, 'bottom'),
            left: base.left + sumSide(requests, 'left'),
          }
          return {
            width: size.width,
            height: size.height,
            margins,
            baseMargins: { ...base },
            innerWidth: size.width - margins.left - margins.right,
            innerHeight: size.height - margins.top - margins.bottom,
          }
        },
      }),
    ],

    render: [
      renderStep({
        id: 'context.frame',
        reads: { ctx: D3Ctx, layout: Layout },
        phase: 'pre',
        order: -100,
        run: ({ ctx, layout }) => {
          const { width, height, margins, baseMargins, innerWidth, innerHeight } = layout

          ctx.svg.attr('viewBox', `0 0 ${width} ${height}`)
          ctx.overlaySvg.attr('viewBox', `0 0 ${width} ${height}`)

          const innerTransform = `translate(${margins.left},${margins.top})`
          ctx.innerG.attr('transform', innerTransform)
          ctx.overlayG.attr('transform', innerTransform)

          // Clip is sized against the BASE margin so stacked axes' label columns
          // don't become part of the chart's clip area.
          const leftExt = baseMargins.left / 2
          const xAxisLabelSpace = 32 // approximated
          ctx.clipRect
            .attr('x', -leftExt)
            .attr('width', Math.max(0, innerWidth + leftExt + baseMargins.right))
            .attr('height', Math.max(0, innerHeight + xAxisLabelSpace))

          // Fade mask: 0% = left clip edge (transparent) → y-axis position (opaque).
          const maskLeft = baseMargins.left
          const totalW = innerWidth + maskLeft
          const yAxisFrac = totalW > 0 ? ((maskLeft / totalW) * 100).toFixed(3) : '0'
          ctx.fadeMaskRect
            .attr('x', -maskLeft)
            .attr('y', -20)
            .attr('width', Math.max(0, totalW))
            .attr('height', Math.max(0, innerHeight + 40))
          ctx.fadeStopLeft.attr('offset', '0%').attr('stop-color', 'white').attr('stop-opacity', 0.12)
          ctx.fadeStopLeft2.attr('offset', `${yAxisFrac}%`).attr('stop-color', 'white').attr('stop-opacity', 1)

          ctx.blurDiv.style.left = '0'
          ctx.blurDiv.style.width = `${margins.left}px`
        },
      }),
    ],

    mount(rt) {
      const ctx = rt.store(D3Ctx).get()
      rt.layers.realize({
        svg: ctx.svg as never,
        inner: ctx.innerG,
        'chart-area': ctx.chartAreaG,
        scroll: ctx.scrollG,
        overlay: ctx.overlayG,
      })

      const size = rt.store(ContainerSize)
      const ro = new ResizeObserver(entries => {
        const entry = entries[0]
        if (entry === undefined || rt.isDestroyed()) return
        const { width, height } = entry.contentRect
        const current = size.get()
        if (width === current.width && height === current.height) return
        size.set({ width, height }, { kind: 'resize' })
        rt.flushSync()
      })
      ro.observe(container)

      return () => {
        ro.disconnect()
        ctx.svg.remove()
        ctx.overlaySvg.remove()
        ctx.blurDiv.remove()
      }
    },
  }
}
