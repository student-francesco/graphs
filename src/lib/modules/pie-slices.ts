import * as d3 from 'd3'
import { prepareStep, renderStep, token, type ChartModule } from '@/lib/engine/index.ts'
import {
  AnimationCtx,
  HoverTargets,
  Layout,
  PieGeometry,
  PieSettings,
  PieSlices,
  type HoverTarget,
  type PieArc,
  type PieGeometryValue,
  type ResolvedPieSlice,
} from './tokens.ts'

/** The interpolated arc state — what the `d` attribute currently shows. */
export interface ArcState {
  startAngle: number
  endAngle: number
  innerRadius: number
  outerRadius: number
}

/** Elements carry their live arc so a tween (re)starts from what is on screen. */
type ArcElement = SVGPathElement & { __lcArc?: ArcState }

const SliceTargets = token<readonly HoverTarget[]>('pie.sliceTargets')

/** d3.arc reads startAngle/endAngle/innerRadius/outerRadius from the datum by default. */
const arcPath = d3.arc<ArcState>()

/** Separator stroke when sliceBorderColor is null — the theme's surface colour. */
export const surfaceColor = (theme: 'light' | 'dark'): string => (theme === 'dark' ? '#1a1815' : '#ffffff')

const percentFormat = d3.format('.1~%')

/**
 * Where an arc tween starts. drawOn sweeps every slice out of 12 o'clock; morph
 * (and transition) continue from the arc currently drawn, and entering slices
 * grow from zero width at their final start angle.
 */
export function tweenStart(
  mode: string,
  current: ArcState | undefined,
  target: ArcState,
): ArcState {
  if (mode === 'drawOn') return { ...target, startAngle: 0, endAngle: 0 }
  return current ? { ...current } : { ...target, endAngle: target.startAngle }
}

/**
 * Pie geometry + slices: lays the slices out as arcs (input order, centred in the
 * inner box), contributes one arc-shaped hover target per slice to the shared
 * tooltip, and renders the keyed slice paths — animated through the shared
 * AnimationCtx (drawOn = sweep in, morph/transition = arc interpolation, none =
 * snap; exits collapse and fade via fadeOutExit).
 */
export function pieSlicesModule(): ChartModule {
  return {
    id: 'pie-slices',
    defaults: { innerRadius: 0, sliceBorderColor: null, sliceBorderWidth: 1 },

    prepare: [
      prepareStep({
        id: 'pie.layout',
        description: 'Lay the slices out as arcs centred in the inner box (input order kept).',
        reads: { slices: PieSlices, layout: Layout, settings: PieSettings },
        provides: PieGeometry,
        run: ({ slices, layout, settings }): PieGeometryValue => {
          const outerRadius = Math.max(0, Math.min(layout.innerWidth, layout.innerHeight) / 2)
          const ratio = Math.min(Math.max(settings.innerRadius, 0), 0.9)
          const total = d3.sum(slices, s => s.value)
          const arcs = d3
            .pie<ResolvedPieSlice>()
            .sort(null)
            .value(s => s.value)(slices as ResolvedPieSlice[])
            .map(
              (a): PieArc => ({
                ...a.data,
                percent: total > 0 ? a.data.value / total : 0,
                startAngle: a.startAngle,
                endAngle: a.endAngle,
                padAngle: a.padAngle,
              }),
            )
          return {
            cx: layout.innerWidth / 2,
            cy: layout.innerHeight / 2,
            outerRadius,
            innerRadius: outerRadius * ratio,
            total,
            arcs,
          }
        },
      }),

      prepareStep({
        id: 'pie.hoverTargets',
        description: 'One arc-shaped tooltip target per non-empty slice.',
        reads: { geo: PieGeometry, settings: PieSettings },
        provides: SliceTargets,
        contributes: [{ to: HoverTargets, select: targets => targets }],
        run: ({ geo, settings }): readonly HoverTarget[] => {
          const valueFormat = d3.format(settings.sliceValueFormat)
          const transform = `translate(${geo.cx},${geo.cy})`
          return geo.arcs
            .filter(a => a.value > 0)
            .map(a => ({
              key: `slice:${a.label}`,
              shape: {
                kind: 'path',
                d: arcPath({ ...a, innerRadius: geo.innerRadius, outerRadius: geo.outerRadius }) ?? '',
                transform,
              },
              content: () => ({
                label: a.label,
                value: `${valueFormat(a.value)} (${percentFormat(a.percent)})`,
                color: a.color,
              }),
            }))
        },
      }),
    ],

    render: [
      renderStep({
        id: 'pie.render',
        reads: { geo: PieGeometry, anim: AnimationCtx, settings: PieSettings },
        layer: { name: 'pie-slices', z: 30, host: 'scroll' },
        run: ({ geo, anim, settings }, ctx) => {
          const root = ctx.layer!
          let g = root.select<SVGGElement>('g.lc-pie')
          if (g.empty()) g = root.append('g').attr('class', 'lc-pie')
          g.attr('transform', `translate(${geo.cx},${geo.cy})`)

          const target = (a: PieArc): ArcState => ({
            startAngle: a.startAngle,
            endAngle: a.endAngle,
            innerRadius: geo.innerRadius,
            outerRadius: geo.outerRadius,
          })

          const sel = g
            .selectAll<ArcElement, PieArc>('path.lc-slice')
            .data(geo.arcs, d => d.label)

          // Exits collapse to their midline while fadeOutExit retires them.
          const exiting = sel.exit<PieArc>() as d3.Selection<ArcElement, PieArc, SVGGElement, unknown>
          if (anim.shouldTween('free')) {
            exiting.each(function () {
              const from = this.__lcArc
              if (!from) return
              const mid = (from.startAngle + from.endAngle) / 2
              tweenArc(this, from, { ...from, startAngle: mid, endAngle: mid }, anim.duration, anim.ease)
            })
          }
          anim.fadeOutExit(exiting, 'lc-slice-exiting')

          const merged = sel
            .enter()
            .append<ArcElement>('path')
            .attr('class', 'lc-slice')
            .attr('data-key', d => d.label)
            .merge(sel)
            .attr('fill', d => d.color)
            .attr('stroke', settings.sliceBorderColor ?? surfaceColor(settings.theme))
            .attr('stroke-width', settings.sliceBorderWidth)

          if (anim.shouldTween('free')) {
            merged.each(function (d) {
              const to = target(d)
              tweenArc(this, tweenStart(anim.mode, this.__lcArc, to), to, anim.duration, anim.ease)
            })
          } else {
            merged.interrupt('arc').each(function (d) {
              const to = target(d)
              this.__lcArc = to
              this.setAttribute('d', arcPath(to) ?? '')
            })
          }
        },
      }),
    ],
  }
}

/** Tween one slice's `d` on the named 'arc' transition (fade transitions run alongside). */
function tweenArc(
  el: ArcElement,
  from: ArcState,
  to: ArcState,
  duration: number,
  ease: (t: number) => number,
): void {
  const interp = d3.interpolate(from, to)
  d3.select(el)
    .interrupt('arc')
    .transition('arc')
    .duration(duration)
    .ease(ease)
    .attrTween('d', () => t => {
      const now = { ...interp(t) }
      el.__lcArc = now
      return arcPath(now) ?? ''
    })
}
