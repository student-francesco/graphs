import * as d3 from 'd3'
import { renderStep, storeSpec, type ChartModule, type ModuleRuntime } from '@/lib/engine/index.ts'
import { EASING_MAP } from '@/lib/d3-maps.ts'
import {
  D3Ctx,
  Layout,
  Scales,
  Settings,
  ViewTransform,
  type ViewTransformState,
} from './tokens.ts'

const IDENTITY: ViewTransformState = {
  k: 1,
  x: 0,
  y: 0,
  xDomainOverride: null,
  yDomainOverrides: new Map(),
}

function isZoomedState(s: ViewTransformState): boolean {
  return (
    s.k !== 1 || s.x !== 0 || s.y !== 0 || s.xDomainOverride !== null || s.yDomainOverrides.size > 0
  )
}

/** Serialize an x-domain bound: Date → ISO 8601 string, number → number (no coercion). */
function serializeXBound(x: Date | number): string | number {
  return x instanceof Date ? x.toISOString() : x
}

/** Restore an x-domain bound: number stays numeric; a string parses to a Date.
 *  Returns null for an unparseable value so the caller can drop the override. */
function restoreXBound(v: string | number): Date | number | null {
  if (typeof v === 'number') return v
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d
}

/**
 * Pan/zoom (d3.zoom on the root svg) + the modifier-key brush (ctrl/cmd drag
 * resolving dynamically to horizontal / vertical / rectangular selection).
 * Gestures only mutate the ViewTransform store — the scales module consumes it
 * and applies override-then-rescale, so the data flow stays one-directional.
 * Brush pixel→domain inversion reads the COMMITTED scale bundle (exactly what
 * the user is looking at) instead of re-deriving the layering.
 */
export function zoomModule(): ChartModule {
  let zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null

  return {
    id: 'zoom',
    defaults: { zoomEnabled: true, zoomMode: 'x', zoomScaleExtent: [1, 100] },

    stores: [storeSpec({ token: ViewTransform, init: (): ViewTransformState => IDENTITY })],

    render: [
      renderStep({
        id: 'zoom.sync',
        reads: { settings: Settings },
        phase: 'pre',
        order: -50,
        run: ({ settings }) => {
          // The filter reads settings live on every event; only the scale extent
          // needs explicit syncing.
          zoomBehavior?.scaleExtent(settings.zoomScaleExtent)
        },
      }),
    ],

    mount(rt) {
      const ctx = rt.store(D3Ctx).get()
      const settingsStore = rt.store(Settings)
      const view = rt.store(ViewTransform)
      const svg = ctx.svg

      zoomBehavior = d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent(settingsStore.get().zoomScaleExtent)
        .filter((event: Event) => {
          if (!settingsStore.get().zoomEnabled) return false
          // Mirror d3.zoom's default filter, but ALSO bail on ctrl/cmd for
          // non-wheel events so the modifier brush gets exclusive ownership.
          const e = event as MouseEvent & { button?: number }
          const modifier = e.ctrlKey || e.metaKey
          return (!modifier || event.type === 'wheel') && !e.button
        })
        .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
          view.update(
            s => ({ ...s, k: event.transform.k, x: event.transform.x, y: event.transform.y }),
            { kind: 'interaction' },
          )
          rt.flushSync()
        })
      svg.call(zoomBehavior)
      // Repurpose dblclick as a one-shot "reset to natural extent" gesture.
      svg.on('dblclick.zoom', null)
      svg.on('dblclick.lc-reset', (event: MouseEvent) => {
        if (!settingsStore.get().zoomEnabled) return
        if (!isZoomedState(view.get())) return
        event.preventDefault()
        resetZoom(rt, zoomBehavior!, svg)
      })
      // Keep page scroll / pinch zoom out of the chart.
      svg.style('touch-action', 'none')

      // ---- Modifier brush -------------------------------------------------
      let brushStart: { x: number; y: number } | null = null
      let brushOrientation: 'h' | 'v' | 'rect' | null = null
      let brushRect: d3.Selection<SVGRectElement, unknown, null, undefined> | null = null

      const innerSize = (): { w: number; h: number } => {
        const layout = rt.peek(Layout)
        return { w: layout?.innerWidth ?? 0, h: layout?.innerHeight ?? 0 }
      }

      const decideBrushOrientation = (dx: number, dy: number): 'h' | 'v' | 'rect' => {
        const TOL = 24
        if (dy <= TOL && dx > dy) return 'h'
        if (dx <= TOL && dy > dx) return 'v'
        return 'rect'
      }

      const updateBrushRect = (
        p1: { x: number; y: number },
        p2: { x: number; y: number },
        orient: 'h' | 'v' | 'rect',
      ): void => {
        // Painted in the overlay group so it sits above the blur layers and is
        // never clipped; the overlay svg is pointer-events:none so it stays
        // purely visual.
        if (brushRect === null) {
          brushRect = ctx.overlayG
            .append('rect')
            .attr('class', 'lc-brush')
            .attr('fill', 'rgba(99, 102, 241, 0.18)')
            .attr('stroke', 'rgba(99, 102, 241, 0.85)')
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '4 2')
            .attr('pointer-events', 'none')
        }
        const { w: innerW, h: innerH } = innerSize()
        let x: number, y: number, w: number, h: number
        if (orient === 'h') {
          x = Math.min(p1.x, p2.x)
          w = Math.abs(p2.x - p1.x)
          y = 0
          h = innerH
        } else if (orient === 'v') {
          x = 0
          w = innerW
          y = Math.min(p1.y, p2.y)
          h = Math.abs(p2.y - p1.y)
        } else {
          x = Math.min(p1.x, p2.x)
          y = Math.min(p1.y, p2.y)
          w = Math.abs(p2.x - p1.x)
          h = Math.abs(p2.y - p1.y)
        }
        brushRect.attr('x', x).attr('y', y).attr('width', w).attr('height', h)
      }

      const applyBrushZoom = (
        x: number,
        y: number,
        w: number,
        h: number,
        orient: 'h' | 'v' | 'rect',
      ): void => {
        // The committed bundle IS the user's current view — no re-derivation.
        const scales = rt.peek(Scales)
        if (!scales) return

        let xOverride = view.get().xDomainOverride
        const yOverrides = new Map(view.get().yDomainOverrides)

        if (orient === 'h' || orient === 'rect') {
          const d0 = scales.x.invert(x)
          const d1 = scales.x.invert(x + w)
          xOverride = +d0 <= +d1 ? [d0, d1] : [d1, d0]
        }
        if (orient === 'v' || orient === 'rect') {
          for (const [id, yScale] of scales.y) {
            // y-range runs [innerHeight, 0]: smaller pixel y → larger value.
            const vTop = yScale.invert(y)
            const vBot = yScale.invert(y + h)
            yOverrides.set(id, [Math.min(vTop, vBot), Math.max(vTop, vBot)])
          }
        }

        const current = view.get()
        view.set(
          { k: current.k, x: current.x, y: current.y, xDomainOverride: xOverride, yDomainOverrides: yOverrides },
          { kind: 'interaction' },
        )
        // The new domain folds in the transform that was applied beforehand —
        // snap it back to identity so subsequent wheels start from the brushed
        // view. The zoom handler re-renders.
        if (current.k !== 1 || current.x !== 0 || current.y !== 0) {
          svg.call(zoomBehavior!.transform, d3.zoomIdentity)
        }
        rt.flushSync()
      }

      const onBrushMove = (event: MouseEvent): void => {
        if (brushStart === null) return
        const target = ctx.innerG.node()
        if (target === null) return
        const [rawX, rawY] = d3.pointer(event, target)
        const { w: innerW, h: innerH } = innerSize()
        const x = Math.max(0, Math.min(innerW, rawX))
        const y = Math.max(0, Math.min(innerH, rawY))
        const dx = Math.abs(x - brushStart.x)
        const dy = Math.abs(y - brushStart.y)
        // Sub-pixel wiggle — draw nothing so a stray click leaves no ghost rect.
        if (dx < 3 && dy < 3) return
        const orient = decideBrushOrientation(dx, dy)
        brushOrientation = orient
        updateBrushRect(brushStart, { x, y }, orient)
      }

      const onBrushUp = (): void => {
        window.removeEventListener('mousemove', onBrushMove, true)
        window.removeEventListener('mouseup', onBrushUp, true)
        const orient = brushOrientation
        const rect = brushRect
        brushStart = null
        brushOrientation = null
        brushRect = null
        if (orient !== null && rect !== null) {
          const x = parseFloat(rect.attr('x') || '0')
          const y = parseFloat(rect.attr('y') || '0')
          const w = parseFloat(rect.attr('width') || '0')
          const h = parseFloat(rect.attr('height') || '0')
          rect.remove()
          // Tiny strokes (accidental ctrl-click + 5px drag) are discarded.
          const meaningful =
            (orient === 'h' && w > 4) ||
            (orient === 'v' && h > 4) ||
            (orient === 'rect' && w > 4 && h > 4)
          if (meaningful) applyBrushZoom(x, y, w, h, orient)
        } else if (rect !== null) {
          rect.remove()
        }
      }

      svg.on('mousedown.lc-brush', (event: MouseEvent) => {
        if (!settingsStore.get().zoomEnabled) return
        if (!(event.ctrlKey || event.metaKey)) return
        const target = ctx.innerG.node()
        if (target === null) return
        const [x, y] = d3.pointer(event, target)
        const { w: innerW, h: innerH } = innerSize()
        // Ignore mousedowns outside the inner chart area (e.g. on a y-axis rail).
        if (x < 0 || x > innerW || y < 0 || y > innerH) return
        event.preventDefault()
        event.stopPropagation()
        brushStart = { x, y }
        brushOrientation = null
        // Listen on window so the brush keeps tracking outside the chart bounds.
        window.addEventListener('mousemove', onBrushMove, true)
        window.addEventListener('mouseup', onBrushUp, true)
      })

      // clearData / restore drop both viewport layers without animation.
      rt.provideCommand('viewport.reset', () => {
        const current = view.get()
        if (current.xDomainOverride !== null || current.yDomainOverrides.size > 0) {
          view.update(s => ({ ...s, xDomainOverride: null, yDomainOverrides: new Map() }))
        }
        if (current.k !== 1 || current.x !== 0 || current.y !== 0) {
          svg.call(zoomBehavior!.transform, d3.zoomIdentity)
        }
      })

      return () => {
        window.removeEventListener('mousemove', onBrushMove, true)
        window.removeEventListener('mouseup', onBrushUp, true)
        svg.on('.zoom', null)
        svg.on('dblclick.lc-reset', null)
        svg.on('mousedown.lc-brush', null)
      }
    },

    api(rt) {
      const ctx = rt.store(D3Ctx)
      return {
        resetZoom: (): void => {
          resetZoom(rt, zoomBehavior!, ctx.get().svg)
        },
      }
    },

    state(rt) {
      const view = rt.store(ViewTransform)
      return {
        key: 'zoom',
        capture: () => {
          const s = view.get()
          return {
            transform: { k: s.k, x: s.x, y: s.y },
            // Dates serialize as ISO 8601, numeric overrides as raw numbers.
            xDomainOverride: s.xDomainOverride
              ? ([serializeXBound(s.xDomainOverride[0]), serializeXBound(s.xDomainOverride[1])] as [
                  string | number,
                  string | number,
                ])
              : null,
            yDomainOverrides: Array.from(s.yDomainOverrides.entries()).map(([axisId, range]) => ({
              axisId,
              range,
            })),
          }
        },
        restore: value => {
          const raw = value as {
            transform?: { k: number; x: number; y: number }
            xDomainOverride?: [string | number, string | number] | null
            yDomainOverrides?: Array<{ axisId: string; range: [number, number] }>
          }
          let xDomainOverride: readonly [Date | number, Date | number] | null = null
          if (raw?.xDomainOverride) {
            const da = restoreXBound(raw.xDomainOverride[0])
            const db = restoreXBound(raw.xDomainOverride[1])
            if (da !== null && db !== null) xDomainOverride = [da, db]
          }
          const yDomainOverrides = new Map<string, readonly [number, number]>()
          for (const yo of raw?.yDomainOverrides ?? []) {
            // Keep only overrides whose axis survived the restore.
            const resolved = rt.command('axes.resolveId', yo.axisId) as string | undefined
            if (resolved === yo.axisId) yDomainOverrides.set(yo.axisId, yo.range)
          }
          view.set({
            k: raw?.transform?.k ?? 1,
            x: raw?.transform?.x ?? 0,
            y: raw?.transform?.y ?? 0,
            xDomainOverride,
            yDomainOverrides,
          })
          // Sync d3.zoom's internal transform store so the next wheel composes
          // with the restored transform instead of jumping from identity.
          const t = d3.zoomIdentity
            .translate(raw?.transform?.x ?? 0, raw?.transform?.y ?? 0)
            .scale(raw?.transform?.k ?? 1)
          const svg = rt.store(D3Ctx).get().svg
          if (zoomBehavior) svg.call(zoomBehavior.transform, t)
        },
      }
    },
  }
}

function resetZoom(
  rt: ModuleRuntime,
  zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown>,
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
): void {
  const view = rt.store(ViewTransform)
  const settings = rt.store(Settings).get()
  const current = view.get()
  if (!isZoomedState(current)) return

  const hadTransform = current.k !== 1 || current.x !== 0 || current.y !== 0
  // Drop the brush overrides immediately; the transform animates back (or snaps).
  if (current.xDomainOverride !== null || current.yDomainOverrides.size > 0) {
    view.update(s => ({ ...s, xDomainOverride: null, yDomainOverrides: new Map() }))
  }
  if (hadTransform && settings.animationDuration > 0) {
    svg
      .transition()
      .duration(settings.animationDuration)
      .ease(EASING_MAP[settings.easingType])
      .call(zoomBehavior.transform, d3.zoomIdentity)
  } else if (hadTransform) {
    svg.call(zoomBehavior.transform, d3.zoomIdentity)
  }
  rt.flushSync()
}
