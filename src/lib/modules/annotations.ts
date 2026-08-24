import * as d3 from 'd3'
import {
  prepareStep,
  renderStep,
  storeSpec,
  token,
  type ChartModule,
  type ModuleRuntime,
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
  /** Whether a wider invisible hit-area is rendered so the viewer can drag this line vertically. */
  readonly draggable: boolean
  /** Clamp for a drag gesture, in the bound axis's value space. Null defaults to the axis's domain. */
  readonly dragBounds: readonly [number, number] | null
}

interface VerticalAnnotation extends AnnotationBase {
  readonly type: 'vertical'
  readonly x: Date
}

export type Annotation = HorizontalAnnotation | VerticalAnnotation

/** onDrag/onDragEnd callbacks are not serializable, so they live outside the (snapshot-captured) store, keyed by annotation id. */
interface DragCallbacks {
  readonly onDrag?: (value: number) => void
  readonly onDragEnd?: (value: number) => void
}

/** Half-height in pixels of the invisible hit-area around a draggable horizontal line. */
const DRAG_HIT_HALF_HEIGHT = 7

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
  readonly draggable?: boolean
  readonly dragBounds?: readonly [number, number] | null
  readonly axisId?: string
}

const Geometry = token<readonly PlacedAnnotation[]>('annotations.geometry')

/**
 * Wire a d3.drag() gesture onto a hit-area rect. Attached once, on `enter`, to every
 * annotation's rect regardless of type/draggable-ness: non-draggable and vertical
 * annotations get `pointer-events: none` on that rect (set alongside the rest of its
 * styling in the render step), so the browser never routes a pointer event to them in
 * the first place — the `d.draggable` checks below are a defensive second layer, not
 * the primary gate. Reads the CURRENT bound datum inside each handler (via `d3.select(
 * this).datum()`), so a later `setHorizontalLine` call is picked up without re-attaching.
 */
function attachDrag(
  selection: d3.Selection<SVGRectElement, PlacedAnnotation, SVGGElement, unknown>,
  getRt: () => ModuleRuntime | null,
  getCallbacks: (id: string) => DragCallbacks | undefined,
): void {
  function resolveValue(rt: ModuleRuntime, d: PlacedAnnotation, pixelY: number): number | null {
    const scales = rt.peek(Scales)
    if (!scales) return null
    const yScale = scales.y.get(d.axisId ?? '') ?? scales.y.values().next().value
    if (!yScale) return null
    const domain = yScale.domain()
    const [lo, hi] = d.dragBounds ?? [Math.min(domain[0], domain[1]), Math.max(domain[0], domain[1])]
    return Math.min(hi, Math.max(lo, yScale.invert(pixelY)))
  }

  const drag = d3
    .drag<SVGRectElement, PlacedAnnotation>()
    // d3-drag's default subject is the bound datum itself, and reads its .x/.y to compute a
    // start-of-gesture offset (event.y = pointer.y + (subject.y - initialPointer.y)). Our datum
    // (PlacedAnnotation) carries its own unrelated `y` field -- the annotation's DATA-space value
    // (e.g. a threshold of 50), not a pixel coordinate -- so the default subject would silently
    // pick that up and bake a bogus, wildly-wrong offset into every event.y for the whole drag.
    // Mirror d3-drag's own null-datum fallback (`{x: event.x, y: event.y}`) instead: at
    // "beforestart" the event already carries the current pointer position, so subject.y equals
    // the pointer's y exactly and the resulting offset is a clean 0 -- not a hardcoded {x:0,y:0},
    // which would itself compute a bogus non-zero offset against the real pointer position.
    .subject((event) => ({x: event.x, y: event.y}))
    .on('drag', function (event) {
      const d = d3.select<SVGRectElement, PlacedAnnotation>(this).datum()
      const activeRt = getRt()
      if (!d.draggable || !activeRt) return
      const value = resolveValue(activeRt, d, event.y)
      if (value === null) return
      const scales = activeRt.peek(Scales)
      const yScale = scales?.y.get(d.axisId ?? '') ?? scales?.y.values().next().value
      if (!yScale) return
      const pixelY = yScale(value)

      const group = d3.select<SVGGElement, PlacedAnnotation>(this.parentNode as SVGGElement)
      group.select<SVGLineElement>('line').attr('y1', pixelY).attr('y2', pixelY)
      d3.select(this).attr('y', pixelY - DRAG_HIT_HALF_HEIGHT)

      getCallbacks(d.id)?.onDrag?.(value)
    })
    .on('end', function (event) {
      const d = d3.select<SVGRectElement, PlacedAnnotation>(this).datum()
      const activeRt = getRt()
      if (!d.draggable || !activeRt) return
      const value = resolveValue(activeRt, d, event.y)
      if (value === null) return

      const store = activeRt.store(AnnotationStore)
      const current = store.get().annotations.get(d.id)
      if (current?.type === 'horizontal') {
        const next = new Map(store.get().annotations)
        next.set(d.id, { ...current, y: value })
        store.set({ annotations: next })
        activeRt.flushSync()
      }

      getCallbacks(d.id)?.onDragEnd?.(value)
    })

  selection.call(drag)
}

/**
 * Horizontal/vertical reference lines (hysteresis indicators etc.). The classic
 * two-step split: 'annotations.extent' contributes horizontal levels into the y
 * auto-extent (the axis treats them like data points); 'annotations.position'
 * consumes the final scales for pixel geometry. Renders into the chart area —
 * clipped, but never inheriting the scroll container's transient translateX.
 */
export function annotationsModule(): ChartModule {
  // Set once in mount(), read from the render step's drag handlers via the same closure
  // trick zoomModule uses for its ZoomBehavior — RenderStepContext carries no runtime handle.
  let moduleRt: ModuleRuntime | null = null
  const dragCallbacks = new Map<string, DragCallbacks>()

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
            return { ...ann, x1: x, x2: x, y1: 0, y2: layout.innerHeight, draggable: false, dragBounds: null }
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
          // Wider invisible hit-area for draggable horizontal lines. Always present (inert when
          // not draggable, via pointer-events below) rather than conditionally appended, so the
          // enter selection stays uniform across every annotation.
          enter
            .append('rect')
            .attr('class', 'lc-annotation-drag')
            .attr('fill', 'transparent')
            .call(attachDrag, () => moduleRt, id => dragCallbacks.get(id))

          const merged = enter.merge(groups)

          merged
            .select<SVGLineElement>('line')
            .attr('stroke', ann => ann.color)
            .attr('stroke-width', ann => ann.thickness)
            .attr('stroke-dasharray', ann => (ann.dashed ? '6 4' : null))
          merged.select<SVGTitleElement>('title').text(ann => ann.label)
          merged
            .select<SVGRectElement>('.lc-annotation-drag')
            .style('cursor', d => (d.draggable ? 'ns-resize' : null))
            .style('pointer-events', d => (d.draggable ? 'all' : 'none'))

          const applyGeom = (sel: d3.Selection<SVGLineElement, PlacedAnnotation, SVGGElement, unknown>): void => {
            sel
              .attr('x1', d => d.x1)
              .attr('x2', d => d.x2)
              .attr('y1', d => d.y1)
              .attr('y2', d => d.y2)
          }
          const applyRectGeom = (sel: d3.Selection<SVGRectElement, PlacedAnnotation, SVGGElement, unknown>): void => {
            sel
              .attr('x', d => d.x1)
              .attr('width', d => Math.max(0, d.x2 - d.x1))
              .attr('y', d => d.y1 - DRAG_HIT_HALF_HEIGHT)
              .attr('height', DRAG_HIT_HALF_HEIGHT * 2)
          }

          // Entering lines/hit-areas snap to target geometry so the visible animation is
          // only the opacity fade — otherwise they interpolate from (0,0).
          applyGeom(enter.select<SVGLineElement>('line'))
          applyRectGeom(enter.select<SVGRectElement>('.lc-annotation-drag'))
          anim.position(merged.select<SVGLineElement>('line'), 'free', s =>
            applyGeom(s as d3.Selection<SVGLineElement, PlacedAnnotation, SVGGElement, unknown>),
          )
          // The hit-area is invisible, so it snaps rather than animating — it only needs to be
          // correct by the time a drag can start, not to visually track the line's transition.
          applyRectGeom(merged.select<SVGRectElement>('.lc-annotation-drag'))
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
      moduleRt = rt
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

      return () => {
        moduleRt = null
      }
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
          const draggable = settings?.draggable ?? false
          if (draggable && (settings?.onDrag || settings?.onDragEnd)) {
            dragCallbacks.set(name, { onDrag: settings.onDrag, onDragEnd: settings.onDragEnd })
          } else {
            dragCallbacks.delete(name)
          }
          put({
            type: 'horizontal',
            id: name,
            y,
            axisId,
            label,
            color: settings?.color ?? ANNOTATION_DEFAULTS.color,
            thickness: settings?.thickness ?? ANNOTATION_DEFAULTS.thickness,
            dashed: settings?.dashed ?? ANNOTATION_DEFAULTS.dashed,
            draggable,
            dragBounds: settings?.dragBounds ?? null,
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
          dragCallbacks.delete(name)
          rt.flushSync()
        },

        clearAnnotations: (): void => {
          if (store.get().annotations.size === 0) return
          store.set({ annotations: new Map() })
          dragCallbacks.clear()
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
                // Callbacks are not serializable and are not restored — the host must call
                // setHorizontalLine again after a restore to re-register onDrag/onDragEnd.
                draggable: (raw['draggable'] as boolean | undefined) ?? false,
                dragBounds: (raw['dragBounds'] as [number, number] | null | undefined) ?? null,
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
