import { prepareStep, Trigger, type ChartModule } from '../engine/index.ts'
import { EASING_MAP } from '../d3-maps.ts'
import type { AnimationMode } from '../types.ts'
import {
  AnimationCtx,
  Settings,
  type AnimationCtxValue,
  type AnySelection,
  type GeomRole,
  type PathSpec,
  type ReshiftSpec,
} from './tokens.ts'

/**
 * Resolves the per-pass animation context every renderer consumes. The tween
 * policy table (extracted verbatim from the monolith's per-renderer branches):
 *
 * |            | path d                | dots cx/cy | labels x/y | x-ticks | grid  |
 * | none       | snap                  | snap       | snap       | snap    | snap  |
 * | drawOn     | dasharray reveal      | snap       | tween      | tween   | tween |
 * | morph      | tween (exit+display)  | tween      | tween      | tween   | tween |
 * | transition | snap (exit+display)   | snap       | tween      | snap    | snap  |
 *
 * The transition-mode scroll container choreography (pre-positioning, exit
 * reshifting via the data-lc-exit-shift markers, animation back to the origin)
 * is layered on by this module's scroll steps when they land — geometry modules
 * already mark their exits and need no change.
 */
export function animationModule(): ChartModule {
  return {
    id: 'animation',

    prepare: [
      prepareStep({
        id: 'animation.ctx',
        reads: { trigger: Trigger, settings: Settings },
        provides: AnimationCtx,
        // Helpers are closures; equality is the policy tuple. Consumers keep the
        // previous (behaviorally identical) value when nothing changed.
        equals: (a, b) =>
          a.mode === b.mode &&
          a.duration === b.duration &&
          a.ease === b.ease &&
          a.fadeEnters === b.fadeEnters,
        run: ({ trigger, settings }): AnimationCtxValue => {
          const mode: AnimationMode =
            trigger.kind === 'setData'
              ? settings.setDataAnimation
              : trigger.kind === 'updateData'
                ? settings.updateDataAnimation
                : trigger.kind === 'append'
                  ? settings.appendAnimation
                  : 'none'
          const duration = mode !== 'none' ? settings.animationDuration : 0
          const ease = EASING_MAP[settings.easingType]
          return buildCtx(mode, duration, ease, settings.animationDuration > 0)
        },
      }),
    ],
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
