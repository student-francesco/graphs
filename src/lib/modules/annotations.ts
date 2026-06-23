import * as d3 from 'd3'
import {
  prepareStep,
  renderStep,
  storeSpec,
  token,
  type ChartModule,
  type Token,
} from '@/lib/engine/index.ts'
import type {
  HorizontalAnnotationSettings,
  VerticalAnnotationSettings,
} from '@/lib/types.ts'
import {
  AnimationCtx,
  HasData,
  Layout,
  Scales,
  YDomainValues,
} from './tokens.ts'

interface AnnotationBase {
  readonly id: string
  readonly label: string
  readonly color: string
  readonly thickness: number
  readonly dashed: boolean
}

interface HorizontalAnnotation extends AnnotationBase {
  readonly type: 'horizontal'
  readonly y: number
  readonly axisId: string
}

interface VerticalAnnotation extends AnnotationBase {
  readonly type: 'vertical'
  readonly x: Date
}

export type Annotation = HorizontalAnnotation | VerticalAnnotation

const ANNOTATION_DEFAULTS = {
  color: '#6366f1',
  thickness: 1.5,
  dashed: true,
} as const

interface AnnotationStoreState {
  readonly annotations: ReadonlyMap<string, Annotation>
}

export const AnnotationStore: Token<AnnotationStoreState> = token('annotations.store')

interface AnnotationDecls {
  readonly list: readonly Annotation[]
  readonly yByAxis: ReadonlyArray<{ axisId: string; values: readonly number[] }>
}

const Decls = token<AnnotationDecls>('annotations.decls')

interface PlacedAnnotation extends AnnotationBase {
  readonly x1: number
  readonly x2: number
  readonly y1: number
  readonly y2: number
}

const Geometry = token<readonly PlacedAnnotation[]>('annotations.geometry')

/**
 * Horizontal/vertical reference lines (hysteresis indicators etc.). The classic
 * two-step split: 'annotations.extent' contributes horizontal levels into the y
 * auto-extent (the axis treats them like data points); 'annotations.position'
 * consumes the final scales for pixel geometry. Renders into the chart area —
 * clipped, but never inheriting the scroll container's transient translateX.
 */
export function annotationsModule(): ChartModule {
  return {
    id: 'annotations',

    stores: [
      storeSpec({
        token: AnnotationStore,
        init: (): AnnotationStoreState => ({ annotations: new Map() }),
      }),
    ],

    prepare: [
      prepareStep({
        id: 'annotations.extent',
        description: 'Read annotations from the store and contribute horizontal-line values to their axis domains.',
        reads: { store: AnnotationStore },
        provides: Decls,
        contributes: [{ to: YDomainValues, select: out => out.yByAxis }],
        run: ({ store }): AnnotationDecls => {
          const list = Array.from(store.annotations.values())
          const byAxis = new Map<string, number[]>()
          for (const ann of list) {
            if (ann.type !== 'horizontal') continue
            const values = byAxis.get(ann.axisId) ?? []
            values.push(ann.y)
            byAxis.set(ann.axisId, values)
          }
          return {
            list,
            yByAxis: Array.from(byAxis, ([axisId, values]) => ({ axisId, values })),
          }
        },
      }),
      prepareStep({
        id: 'annotations.position',
        description: 'Project each annotation through the scales into pixel endpoints spanning the plot area.',
        reads: { decls: Decls, scales: Scales, layout: Layout },
        provides: Geometry,
        run: ({ decls, scales, layout }): readonly PlacedAnnotation[] => {
          const primary = scales.y.values().next().value
          return decls.list.map(ann => {
            if (ann.type === 'horizontal') {
              const yScale = scales.y.get(ann.axisId) ?? primary!
              const y = yScale(ann.y)
              return { ...ann, x1: 0, x2: layout.innerWidth, y1: y, y2: y }
            }
            const x = scales.x(ann.x)
            return { ...ann, x1: x, x2: x, y1: 0, y2: layout.innerHeight }
          })
        },
      }),
    ],

    render: [
      renderStep({
        id: 'annotations.render',
        reads: { geometry: Geometry, hasData: HasData, anim: AnimationCtx },
        layer: { name: 'annotations', z: 60, host: 'chart-area' },
        run: ({ geometry, hasData, anim }, ctx) => {
          const RESTING_OPACITY = 0.85
          const layer = ctx.layer!.classed('lc-annotations', true)

          const groups = layer
            .selectAll<SVGGElement, PlacedAnnotation>('.lc-annotation')
            .data(hasData ? geometry : [], ann => ann.id)

          anim.fadeOutExit(groups.exit(), 'lc-annotation-exiting')

          const enter = groups
            .enter()
            .append('g')
            .attr('class', 'lc-annotation')
            .attr('data-id', ann => ann.id)
            .style('opacity', 0)
          enter.append('line').attr('pointer-events', 'stroke')
          enter.append('title')

          const merged = enter.merge(groups)

          merged
            .select<SVGLineElement>('line')
            .attr('stroke', ann => ann.color)
            .attr('stroke-width', ann => ann.thickness)
            .attr('stroke-dasharray', ann => (ann.dashed ? '6 4' : null))
          merged.select<SVGTitleElement>('title').text(ann => ann.label)

          const applyGeom = (sel: d3.Selection<SVGLineElement, PlacedAnnotation, SVGGElement, unknown>): void => {
            sel
              .attr('x1', d => d.x1)
              .attr('x2', d => d.x2)
              .attr('y1', d => d.y1)
              .attr('y2', d => d.y2)
          }

          // Entering lines snap to target geometry so the visible animation is
          // only the opacity fade — otherwise they interpolate from (0,0).
          applyGeom(enter.select<SVGLineElement>('line'))
          anim.position(merged.select<SVGLineElement>('line'), 'free', s =>
            applyGeom(s as d3.Selection<SVGLineElement, PlacedAnnotation, SVGGElement, unknown>),
          )
          anim.position(merged, 'free', s =>
            (s as d3.Selection<SVGGElement, PlacedAnnotation, SVGGElement, unknown>).style(
              'opacity',
              RESTING_OPACITY,
            ),
          )
        },
      }),
    ],

    mount(rt) {
      const store = rt.store(AnnotationStore)
      // Horizontal annotations are pinned to an axis: cascade-removed with it.
      rt.provideCommand('annotations.dropAxis', (axisId: string) => {
        const current = store.get().annotations
        const next = new Map(current)
        let touched = false
        for (const [id, ann] of next) {
          if (ann.type === 'horizontal' && ann.axisId === axisId) {
            next.delete(id)
            touched = true
          }
        }
        if (touched) store.set({ annotations: next })
      })
    },

    api(rt) {
      const store = rt.store(AnnotationStore)

      const put = (annotation: Annotation): void => {
        const next = new Map(store.get().annotations)
        next.set(annotation.id, annotation)
        store.set({ annotations: next })
        rt.flushSync()
      }

      return {
        setHorizontalLine: (
          name: string,
          y: number,
          label: string,
          settings?: HorizontalAnnotationSettings,
        ): void => {
          // Requested axis when it exists, otherwise the first axis.
          const axisId =
            (rt.command('axes.resolveId', settings?.axis ?? '') as string | undefined) ?? 'default'
          put({
            type: 'horizontal',
            id: name,
            y,
            axisId,
            label,
            color: settings?.color ?? ANNOTATION_DEFAULTS.color,
            thickness: settings?.thickness ?? ANNOTATION_DEFAULTS.thickness,
            dashed: settings?.dashed ?? ANNOTATION_DEFAULTS.dashed,
          })
        },

        setVerticalLine: (
          name: string,
          x: string,
          label: string,
          settings?: VerticalAnnotationSettings,
        ): void => {
          const date = new Date(x)
          if (isNaN(date.getTime())) throw new Error(`LineChart: invalid date "${x}"`)
          put({
            type: 'vertical',
            id: name,
            x: date,
            label,
            color: settings?.color ?? ANNOTATION_DEFAULTS.color,
            thickness: settings?.thickness ?? ANNOTATION_DEFAULTS.thickness,
            dashed: settings?.dashed ?? ANNOTATION_DEFAULTS.dashed,
          })
        },

        removeAnnotation: (name: string): void => {
          const current = store.get().annotations
          if (!current.has(name)) return
          const next = new Map(current)
          next.delete(name)
          store.set({ annotations: next })
          rt.flushSync()
        },

        clearAnnotations: (): void => {
          if (store.get().annotations.size === 0) return
          store.set({ annotations: new Map() })
          rt.flushSync()
        },
      }
    },

    state(rt) {
      const store = rt.store(AnnotationStore)
      return {
        key: 'annotations',
        capture: () =>
          Array.from(store.get().annotations.values()).map(a =>
            a.type === 'horizontal'
              ? { ...a }
              : { ...a, x: a.x.toISOString() },
          ),
        restore: value => {
          const next = new Map<string, Annotation>()
          for (const raw of (value as Array<Record<string, unknown>>) ?? []) {
            if (raw['type'] === 'horizontal') {
              const axisId =
                (rt.command('axes.resolveId', raw['axisId'] as string) as string | undefined) ??
                'default'
              next.set(raw['id'] as string, {
                type: 'horizontal',
                id: raw['id'] as string,
                y: raw['y'] as number,
                axisId,
                label: raw['label'] as string,
                color: raw['color'] as string,
                thickness: raw['thickness'] as number,
                dashed: raw['dashed'] as boolean,
              })
            } else {
              const x = new Date(raw['x'] as string)
              if (isNaN(x.getTime())) continue
              next.set(raw['id'] as string, {
                type: 'vertical',
                id: raw['id'] as string,
                x,
                label: raw['label'] as string,
                color: raw['color'] as string,
                thickness: raw['thickness'] as number,
                dashed: raw['dashed'] as boolean,
              })
            }
          }
          store.set({ annotations: next })
        },
      }
    },
  }
}
