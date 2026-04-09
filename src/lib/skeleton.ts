import type * as d3Types from 'd3'
import type { ChartMargins } from './types.ts'

type SvgSelection = d3Types.Selection<SVGSVGElement, unknown, null, undefined>

const SKELETON_CLASS = 'lc-skeleton'
const GRADIENT_ID_PREFIX = 'lc-shimmer-'

// Unique counter so multiple charts on one page don't share gradient IDs
let instanceCounter = 0

export function renderSkeleton(
  svg: SvgSelection,
  width: number,
  height: number,
  margins: ChartMargins,
): void {
  const gradientId = `${GRADIENT_ID_PREFIX}${++instanceCounter}`
  const innerW = width - margins.left - margins.right
  const innerH = height - margins.top - margins.bottom

  // <defs> with shimmer gradient using SVG-native animation (no external CSS)
  const defs = svg.append('defs').attr('class', 'lc-skeleton-defs')
  const gradient = defs
    .append('linearGradient')
    .attr('id', gradientId)
    .attr('x1', '-1')
    .attr('x2', '2')
    .attr('y1', '0')
    .attr('y2', '0')

  gradient.append('stop').attr('offset', '0%').attr('stop-color', '#e5e7eb')
  gradient.append('stop').attr('offset', '50%').attr('stop-color', '#f3f4f6')
  gradient.append('stop').attr('offset', '100%').attr('stop-color', '#e5e7eb')

  gradient
    .append('animateTransform')
    .attr('attributeName', 'gradientTransform')
    .attr('type', 'translate')
    .attr('from', '-2 0')
    .attr('to', '2 0')
    .attr('dur', '1.4s')
    .attr('repeatCount', 'indefinite')

  const fill = `url(#${gradientId})`
  const barH = 12
  const radius = 4

  const g = svg
    .append('g')
    .attr('class', SKELETON_CLASS)
    .attr('transform', `translate(${margins.left},${margins.top})`)

  // Y-axis label bars
  const yLabelCount = 5
  for (let i = 0; i < yLabelCount; i++) {
    const y = (innerH / (yLabelCount - 1)) * i
    g.append('rect')
      .attr('x', -50)
      .attr('y', y - barH / 2)
      .attr('width', 40)
      .attr('height', barH)
      .attr('rx', radius)
      .attr('fill', fill)
  }

  // Main chart area
  g.append('rect')
    .attr('x', 0)
    .attr('y', 0)
    .attr('width', innerW)
    .attr('height', innerH)
    .attr('rx', 8)
    .attr('fill', fill)
    .attr('opacity', 0.5)

  // X-axis label bars
  const xLabelCount = 5
  for (let i = 0; i < xLabelCount; i++) {
    const x = (innerW / (xLabelCount - 1)) * i - 20
    g.append('rect')
      .attr('x', x)
      .attr('y', innerH + 10)
      .attr('width', 40)
      .attr('height', barH)
      .attr('rx', radius)
      .attr('fill', fill)
  }
}

export function removeSkeleton(svg: SvgSelection): void {
  svg.select('.lc-skeleton-defs').remove()
  svg.select(`.${SKELETON_CLASS}`).remove()
}
