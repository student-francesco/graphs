import * as d3 from 'd3'
import { prepareStep, renderStep, token, type ChartModule } from '@/lib/engine/index.ts'
import type { ChartMargins, SliceLabelContent } from '@/lib/types.ts'
import {
  AnimationCtx,
  MarginRequests,
  PieGeometry,
  PieSettings,
  PieSlices,
} from './tokens.ts'

/** Gap between the slice edge and the leader's elbow (px). */
const ELBOW = 10
/** Horizontal run from the elbow to the text (px). */
const RUN = 16
/** Minimum vertical distance between two outside labels on the same side (px). */
const LINE_GAP = 14
/** Approximate glyph width of the 12px label font, for margin reservation (px). */
const CHAR_W = 6.6
/** Cap on the horizontal margin reserved per side for outside labels (px). */
const MAX_SIDE_RESERVE = 160

export interface SliceLabelItem {
  readonly key: string
  readonly text: string
  readonly x: number
  readonly y: number
  readonly anchor: 'start' | 'middle' | 'end'
  readonly color: string
  /** Leader polyline points (outside labels only). */
  readonly leader: string | null
}

interface LabelPlan {
  readonly cx: number
  readonly cy: number
  readonly items: readonly SliceLabelItem[]
}

const LabelReserve = token<Partial<ChartMargins>>('pieLabels.reserve')
const LabelLayout = token<LabelPlan>('pieLabels.layout')

/** The label text for one slice — pure, shared by measurement and layout. */
export function sliceLabelText(
  content: SliceLabelContent,
  label: string,
  value: number,
  percent: number,
  valueFormat: (v: number) => string,
): string {
  const pct = d3.format('.1~%')(percent)
  switch (content) {
    case 'none':
      return ''
    case 'label':
      return label
    case 'value':
      return valueFormat(value)
    case 'percent':
      return pct
    case 'label-value':
      return `${label}: ${valueFormat(value)}`
    case 'label-percent':
      return `${label}: ${pct}`
  }
}

/**
 * Spread labels on one side so neighbours keep at least `gap` px apart, staying
 * within [minY, maxY] where possible: a downward sweep pushes overlaps down, an
 * upward sweep pulls the stack back inside the bottom bound. Order is preserved.
 */
export function relaxLabels(ys: readonly number[], gap: number, minY: number, maxY: number): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y)
  for (let k = 0; k < order.length; k++) {
    const floor = k === 0 ? minY : order[k - 1]!.y + gap
    if (order[k]!.y < floor) order[k]!.y = floor
  }
  for (let k = order.length - 1; k >= 0; k--) {
    const ceil = k === order.length - 1 ? maxY : order[k + 1]!.y - gap
    if (order[k]!.y > ceil) order[k]!.y = ceil
  }
  const out = new Array<number>(ys.length)
  for (const o of order) out[o.i] = o.y
  return out
}

/** Dark or light text, whichever reads better on the slice fill. */
export function contrastText(fill: string): string {
  const c = d3.rgb(fill)
  const lin = (v: number): number => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
  return luminance > 0.4 ? '#111827' : '#ffffff'
}

/**
 * Text labels for the pie slices: next to each slice with a leader line
 * ('outside', default) or centred inside it. Outside labels reserve margin room
 * through MarginRequests from an early step (reads only slices + settings), and
 * lay out against the merged geometry in a later one — the contribute/consume
 * split. Labels of empty slices, and inside labels too narrow to fit, are skipped.
 */
export function pieLabelsModule(): ChartModule {
  return {
    id: 'pie-labels',
    defaults: { sliceLabels: 'label-percent', sliceLabelPosition: 'outside', sliceValueFormat: ',.2~f' },

    prepare: [
      prepareStep({
        id: 'pieLabels.reserve',
        description: 'Reserve side margins for outside slice labels, estimated from the longest label.',
        reads: { slices: PieSlices, settings: PieSettings },
        provides: LabelReserve,
        contributes: [{ to: MarginRequests, select: reserve => reserve }],
        run: ({ slices, settings }): Partial<ChartMargins> => {
          if (settings.sliceLabels === 'none' || settings.sliceLabelPosition !== 'outside') return {}
          const total = d3.sum(slices, s => s.value)
          const valueFormat = d3.format(settings.sliceValueFormat)
          let longest = 0
          for (const s of slices) {
            if (s.value <= 0) continue
            const text = sliceLabelText(settings.sliceLabels, s.label, s.value, s.value / total, valueFormat)
            longest = Math.max(longest, text.length)
          }
          if (longest === 0) return {}
          const side = Math.min(MAX_SIDE_RESERVE, Math.ceil(longest * CHAR_W + ELBOW + RUN + 6))
          return { left: side, right: side, top: 12, bottom: 12 }
        },
      }),

      prepareStep({
        id: 'pieLabels.layout',
        description: 'Position each slice label (centroid inside, or leader + relaxed side stack outside).',
        reads: { geo: PieGeometry, settings: PieSettings },
        provides: LabelLayout,
        run: ({ geo, settings }): LabelPlan => {
          const { cx, cy, outerRadius: r, innerRadius } = geo
          if (settings.sliceLabels === 'none' || r <= 0) return { cx, cy, items: [] }
          const valueFormat = d3.format(settings.sliceValueFormat)
          const visible = geo.arcs.filter(a => a.value > 0)
          const textOf = (a: (typeof visible)[number]): string =>
            sliceLabelText(settings.sliceLabels, a.label, a.value, a.percent, valueFormat)

          if (settings.sliceLabelPosition === 'inside') {
            const rLabel = innerRadius > 0 ? (innerRadius + r) / 2 : r * 0.62
            const items: SliceLabelItem[] = []
            for (const a of visible) {
              const text = textOf(a)
              const span = a.endAngle - a.startAngle
              // Too narrow for the text along the arc → skip rather than overflow.
              if (span * rLabel < Math.min(text.length * CHAR_W, 48) && span < Math.PI) continue
              const m = (a.startAngle + a.endAngle) / 2
              items.push({
                key: a.label,
                text,
                x: Math.sin(m) * rLabel,
                y: -Math.cos(m) * rLabel,
                anchor: 'middle',
                color: contrastText(a.color),
                leader: null,
              })
            }
            return { cx, cy, items }
          }

          // Outside: elbow at r + ELBOW on the slice midline, then a horizontal run
          // to the text; each side's stack is relaxed so labels never overlap.
          const placed = visible.map(a => {
            const m = (a.startAngle + a.endAngle) / 2
            const side = Math.sin(m) >= 0 ? 1 : -1
            return { a, m, side, y: -Math.cos(m) * (r + ELBOW) }
          })
          const bound = r + ELBOW + 8
          for (const side of [1, -1]) {
            const group = placed.filter(p => p.side === side)
            const ys = relaxLabels(group.map(p => p.y), LINE_GAP, -bound, bound)
            group.forEach((p, i) => { p.y = ys[i]! })
          }
          const items = placed.map(({ a, m, side, y }): SliceLabelItem => {
            const x0 = Math.sin(m) * r
            const y0 = -Math.cos(m) * r
            const x1 = Math.sin(m) * (r + ELBOW)
            const y1 = -Math.cos(m) * (r + ELBOW)
            const x2 = side * (Math.abs(x1) + RUN)
            const f = (v: number): string => v.toFixed(2)
            return {
              key: a.label,
              text: textOf(a),
              x: x2 + side * 4,
              y,
              anchor: side > 0 ? 'start' : 'end',
              color: 'currentColor',
              leader: `${f(x0)},${f(y0)} ${f(x1)},${f(y1)} ${f(x2)},${f(y)}`,
            }
          })
          return { cx, cy, items }
        },
      }),
    ],

    render: [
      renderStep({
        id: 'pieLabels.render',
        reads: { plan: LabelLayout, anim: AnimationCtx },
        layer: { name: 'pie-labels', z: 40, host: 'scroll' },
        run: ({ plan, anim }, ctx) => {
          const root = ctx.layer!
          let g = root.select<SVGGElement>('g.lc-pie-labels')
          if (g.empty()) g = root.append('g').attr('class', 'lc-pie-labels')
          g.attr('transform', `translate(${plan.cx},${plan.cy})`)

          const sel = g
            .selectAll<SVGGElement, SliceLabelItem>('g.lc-slice-label')
            .data(plan.items, d => d.key)

          anim.fadeOutExit(sel.exit(), 'lc-slice-label-exiting')

          const entered = sel.enter().append('g').attr('class', 'lc-slice-label')
          entered.append('text')
            .attr('dominant-baseline', 'middle')
            .attr('font-size', 12)
            .attr('x', d => d.x)
            .attr('y', d => d.y)
          anim.fadeIn(entered)

          const merged = entered.merge(sel)

          // Leaders exist only for outside labels; add / drop them as the mode changes.
          merged.each(function (d) {
            const group = d3.select(this)
            let leader = group.select<SVGPolylineElement>('polyline.lc-slice-leader')
            if (d.leader === null) {
              leader.remove()
              return
            }
            if (leader.empty()) {
              leader = group
                .insert('polyline', 'text')
                .attr('class', 'lc-slice-leader')
                .attr('fill', 'none')
                .attr('stroke', 'currentColor')
                .attr('stroke-opacity', 0.45)
                .attr('stroke-width', 1)
                .attr('points', d.leader)
            }
            anim.position(leader, 'free', s => s.attr('points', d.leader))
          })

          const text = merged
            .select<SVGTextElement>('text')
            .text(d => d.text)
            .attr('text-anchor', d => d.anchor)
            .attr('fill', d => d.color)
          anim.position(text, 'free', s => s.attr('x', (d: SliceLabelItem) => d.x).attr('y', (d: SliceLabelItem) => d.y))
        },
      }),
    ],
  }
}
