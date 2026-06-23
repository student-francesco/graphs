import {
  prepareStep,
  renderStep,
  Trigger,
  type ChartModule,
  type ModuleRuntime,
} from '@/lib/engine/index.ts'
import { EASING_MAP } from '@/lib/d3-maps.ts'
import type { AnimationMode, InternalDataPoint } from '@/lib/types.ts'
import {
  AnimationCtx,
  D3Ctx,
  Scales,
  Settings,
  VisibleSeries,
  type AnimationCtxValue,
  type AnySelection,
  type GeomRole,
  type PathSpec,
  type ReshiftSpec,
  type ScaleBundle,
} from './tokens.ts'

/**
 * Resolves the per-pass animation context every renderer consumes, and owns the
 * transition-mode scroll choreography. The tween policy table (extracted
 * verbatim from the monolith's per-renderer branches):
 *
 * |            | path d                | dots cx/cy | labels x/y | x-ticks | grid  |
 * | none       | snap                  | snap       | snap       | snap    | snap  |
 * | drawOn     | dasharray reveal      | snap       | tween      | tween   | tween |
 * | morph      | tween (exit+display)  | tween      | tween      | tween   | tween |
 * | transition | snap (exit+display)   | snap       | tween      | snap    | snap  |
 *
 * Transition mode: scrollPre (phase 'pre') pre-positions the scroll container at
 * scrollStartX BEFORE any content renders — elements paint at their FINAL
 * coordinates and never appear unshifted; scrollPost (phase 'post') reshifts
 * every element marked data-lc-exiting by the scroll delta (so exiters keep
 * their visual position when the container moves) and animates the container
 * back to the origin. Renderers never read or write the container transform.
 */
export function animationModule(): ChartModule {
  // Mirrors the monolith's construction-time init: renders within the first
  // animation window use the easeExpOut interrupt easing.
  let lastRenderAt = Date.now()
  let prevXScale: ScaleBundle['x'] | null = null
  let scrollStartX = 0
  let scrollDelta = 0
  let rtRef: ModuleRuntime | null = null

  return {
    id: 'animation',
    defaults: {
      animationDuration: 750,
      easingType: 'easeCubicInOut',
      setDataAnimation: 'drawOn',
      updateDataAnimation: 'morph',
      appendAnimation: 'none',
    },

    prepare: [
      prepareStep({
        id: 'animation.ctx',
        description: 'Resolve the pass’s animation mode, duration and easing from the trigger kind and settings.',
        reads: { trigger: Trigger, settings: Settings },
        provides: AnimationCtx,
        // Helpers are closures; equality is the policy tuple. Consumers keep the
        // previous (behaviorally identical) value when nothing changed.
        equals: (a, b) =>
          a.mode === b.mode &&
          a.duration === b.duration &&
          a.ease === b.ease &&
          a.fadeEnters === b.fadeEnters,
        run: ({ trigger, settings }, stepCtx): AnimationCtxValue => {
          const mode: AnimationMode =
            trigger.kind === 'setData'
              ? settings.setDataAnimation
              : trigger.kind === 'updateData'
                ? settings.updateDataAnimation
                : trigger.kind === 'append'
                  ? settings.appendAnimation
                  : 'none'
          const duration = mode !== 'none' ? settings.animationDuration : 0
          // A re-render landing mid-animation switches to a decelerating ease so
          // the visual interruption stays smooth.
          const animatingStill = lastRenderAt + duration > stepCtx.now
          const ease = animatingStill ? EASING_MAP.easeExpOut : EASING_MAP[settings.easingType]
          return buildCtx(mode, duration, ease, settings.animationDuration > 0)
        },
      }),
    ],

    render: [
      renderStep({
        id: 'animation.scrollPre',
        reads: { anim: AnimationCtx, ctx: D3Ctx, visible: VisibleSeries, scales: Scales },
        phase: 'pre',
        order: 0,
        alwaysRun: true,
        run: ({ anim, ctx, visible, scales }) => {
          scrollStartX = 0
          scrollDelta = 0
          if (anim.mode !== 'transition' || anim.duration <= 0) return

          const scroll = ctx.scrollG
          scroll.interrupt()
          const raw = scroll.attr('transform') || ''
          const m = /translate\(\s*(-?[\d.e]+)/.exec(raw)
          const currentX = m ? parseFloat(m[1]!) : 0

          if (prevXScale) {
            let refX: InternalDataPoint['x'] | undefined
            for (const s of visible.values()) {
              if (s.raw.length > 0) {
                refX = s.raw[0]!.x
                break
              }
            }
            if (refX !== undefined) {
              scrollStartX = prevXScale(refX) - scales.x(refX) + currentX
            }
          }
          scrollDelta = currentX - scrollStartX

          scroll.attr(
            'transform',
            Math.abs(scrollStartX) > 0.5 ? `translate(${scrollStartX}, 0)` : 'translate(0, 0)',
          )
        },
      }),

      renderStep({
        id: 'animation.scrollPost',
        reads: { anim: AnimationCtx, ctx: D3Ctx, scales: Scales },
        phase: 'post',
        alwaysRun: true,
        run: ({ anim, ctx, scales }, stepCtx) => {
          const scroll = ctx.scrollG

          if (anim.mode === 'transition' && anim.duration > 0) {
            // Reshift exiting elements (still fading from this or earlier passes)
            // so they don't jump when the container is repositioned. Position
            // only — their fade transitions keep running.
            if (Math.abs(scrollDelta) > 0.5) {
              const delta = scrollDelta
              scroll.selectAll<Element, unknown>('[data-lc-exiting]').each(function () {
                applyReshift(
                  this,
                  (this as Element & { __lcReshift?: ReshiftSpec }).__lcReshift,
                  delta,
                )
              })
            }
            if (Math.abs(scrollStartX) > 0.5) {
              scroll
                .transition()
                .duration(anim.duration)
                .ease(anim.ease)
                .attr('transform', 'translate(0, 0)')
            } else {
              scroll.attr('transform', 'translate(0, 0)')
            }
          } else {
            // Reset any lingering scroll transform (resize, settings change, …).
            scroll.interrupt().attr('transform', 'translate(0, 0)')
          }

          prevXScale = scales.x
          lastRenderAt = stepCtx.now
          // Keep a small number of exit points per series so the left-edge blur
          // is not disturbed; takes effect on the next data-driven join.
          rtRef?.command('series.trimExitPoints', 4)
        },
      }),
    ],

    mount(rt) {
      rtRef = rt
    },
  }
}

function applyReshift(el: Element, spec: ReshiftSpec | undefined, delta: number): void {
  if (!spec) return
  if (spec.kind === 'attr-x') {
    const current = parseFloat(el.getAttribute(spec.attr) ?? '0')
    el.setAttribute(spec.attr, String(current + delta))
  } else {
    const t = el.getAttribute('transform') ?? 'translate(0,0)'
    const m = /translate\(\s*(-?[\d.e]+)/.exec(t)
    const x = m ? parseFloat(m[1]!) : 0
    el.setAttribute('transform', `translate(${x + delta}, ${spec.fixedY})`)
  }
}

function buildCtx(
  mode: AnimationMode,
  duration: number,
  ease: (t: number) => number,
  fadeEnters: boolean,
): AnimationCtxValue {
  const shouldTween = (role: GeomRole): boolean => {
    if (mode === 'none' || duration <= 0) return false
    switch (role) {
      case 'scrolled':
        return mode !== 'transition'
      case 'marker':
        return mode === 'morph'
      case 'free':
        return true
    }
  }

  /** Duration for entering-tick fades, independent of the main animation mode. */
  const ENTER_FADE_MS = 200

  return {
    mode,
    duration,
    ease,
    fadeEnters,
    shouldTween,

    position(sel, role, apply) {
      if (shouldTween(role)) {
        apply(sel.transition().duration(duration).ease(ease))
      } else {
        apply(sel)
      }
    },

    renderPath(path, spec: PathSpec) {
      const { gen, display, exit, isNew } = spec
      const useDrawOn =
        mode === 'drawOn' || ((mode === 'transition' || mode === 'morph') && isNew)

      if (useDrawOn && duration > 0) {
        path.attr('d', gen(display as never) ?? '')
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
        // Include exit points so the control-point count stays identical mid-tween.
        const renderData = exit.length > 0 ? [...exit, ...display] : display
        path
          .transition()
          .duration(duration)
          .ease(ease)
          .attr('d', gen(renderData as never) ?? '')
      } else if (mode === 'transition') {
        // Container handles the motion; render instantly with exit points so the
        // leftmost segment clips off cleanly.
        const renderData = exit.length > 0 ? [...exit, ...display] : display
        path
          .attr('d', gen(renderData as never) ?? '')
          .attr('stroke-dasharray', null)
          .attr('stroke-dashoffset', null)
      } else {
        path
          .attr('d', gen(display as never) ?? '')
          .attr('stroke-dasharray', null)
          .attr('stroke-dashoffset', null)
      }
    },

    fadeIn(sel) {
      if (!fadeEnters) return
      sel.style('opacity', 0).transition().duration(ENTER_FADE_MS).style('opacity', null)
    },

    fadeOutExit(sel: AnySelection, exitingClass: string, reshift?: ReshiftSpec) {
      // Rename immediately so future joins never see these elements; mark for the
      // transition driver's scroll reshift; fade out independently of later renders.
      const marked = sel.attr('class', exitingClass).attr('data-lc-exiting', '')
      if (reshift) {
        marked.each(function (this: Element) {
          ;(this as Element & { __lcReshift?: ReshiftSpec }).__lcReshift = reshift
        })
      }
      if (duration > 0) {
        marked.transition().duration(duration).ease(ease).style('opacity', 0).remove()
      } else {
        marked.remove()
      }
    },
  }
}
