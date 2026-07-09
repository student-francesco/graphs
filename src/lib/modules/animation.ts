import {
  prepareStep,
  renderStep,
  Trigger,
  type ChartModule,
  type ModuleRuntime,
} from '@/lib/engine/index.ts'
import { EASING_MAP } from '@/lib/d3-maps.ts'
import type { AnimationMode } from '@/lib/types.ts'
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
  type VisibleSeriesEntry,
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
 *
 * Trimmed-off points are kept joined as ~5 pending EXIT points (dots + the line's
 * leftmost segment) so the strip's left edge stays continuous as it scrolls off
 * under the fade mask instead of popping (`series.trimExitPoints` in scrollPost).
 */
export function animationModule(): ChartModule {
  // Mirrors the monolith's construction-time init: renders within the first
  // animation window use the easeExpOut interrupt easing.
  let lastRenderAt = Date.now()
  // The x-domain edges (as +values) rendered last pass. The scroll fires when the
  // LOW edge advances (window rolled) and displaces by how far the previous HIGH
  // edge moved off the right — both read from the scale's domain (see scrollPre).
  let prevLo: number | null = null
  let prevHi: number | null = null
  let scrollStartX = 0
  let scrollDelta = 0
  // Whether THIS pass rolled the domain (set in scrollPre, consumed in scrollPost).
  // A non-rolling pass leaves any in-flight scroll untouched.
  let scrolledThisPass = false
  // stepCtx.now of the last roll — the scroll-back is paced to the gap since then so
  // it finishes about when the next point is due (null = none observed yet ⇒ fall
  // back to the full animation duration for a lone slide).
  let lastAdvanceAt: number | null = null
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
          scrolledThisPass = false
          if (anim.mode !== 'transition' || anim.duration <= 0) return
          if (!hasData(visible)) return

          const [domLo, domHi] = scales.x.domain()
          const loV = +domLo!
          const hiV = +domHi!
          const rangeR = scales.x.range()[1] ?? 0
          if (prevLo === null || prevHi === null || hiV <= loV || rangeR <= 0) return

          // Roll test: scroll only when the LEFT edge advances (old data leaving the
          // left). While filling, the left edge is pinned and the domain just grows —
          // no scroll. Epsilon is relative to the domain width so it's scale-agnostic
          // (ms for time, units for numeric).
          const width = hiV - loV
          const rolling = loV - prevLo > width * 1e-6
          if (!rolling) return

          // Displace by how far the previous right edge moved off the right: pin that
          // value to where it was (the right edge), then ease back. The rolling
          // window only translates, so this uniform shift keeps ALL retained content
          // stationary at the jump (no per-point glitch).
          const advancePx = (rangeR * (hiV - prevHi)) / width
          if (advancePx <= 0.5) return

          scrolledThisPass = true
          const scroll = ctx.scrollG
          scroll.interrupt()
          const raw = scroll.attr('transform') || ''
          const m = /translate\(\s*(-?[\d.e]+)/.exec(raw)
          const currentX = m ? parseFloat(m[1]!) : 0

          // Accumulate the new gap onto wherever the container currently sits, so a
          // scroll arriving mid-animation continues from that point (no snap-back).
          // Cap the carried-over offset at a few steps: normal focused operation
          // leaves a sub-step residual, but a backgrounded tab (scroll transition
          // frozen while appends keep arriving) would otherwise pile up an unbounded
          // shift that sweeps across on return.
          const carry = Math.min(Math.max(currentX, 0), advancePx * 3)
          scrollStartX = advancePx + carry
          scrollDelta = currentX - scrollStartX

          scroll.attr(
            'transform',
            Math.abs(scrollStartX) > 0.5 ? `translate(${scrollStartX}, 0)` : 'translate(0, 0)',
          )
        },
      }),

      renderStep({
        id: 'animation.scrollPost',
        reads: { anim: AnimationCtx, ctx: D3Ctx, scales: Scales, visible: VisibleSeries },
        phase: 'post',
        alwaysRun: true,
        run: ({ anim, ctx, scales, visible }, stepCtx) => {
          const scroll = ctx.scrollG

          if (anim.mode === 'transition' && anim.duration > 0) {
            if (scrolledThisPass) {
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
              // Ease back to the origin at a CONSTANT velocity (linear), covering the
              // distance in the time until the next point is due — the last observed
              // roll interval, capped at animationDuration. Linear + interval pacing
              // means back-to-back rolls chain into one glide rather than
              // re-decelerating from rest on each point. A lone roll (no recent one)
              // falls back to the full duration: a normal slide.
              const interval =
                lastAdvanceAt === null ? anim.duration : stepCtx.now - lastAdvanceAt
              const scrollDuration = Math.max(1, Math.min(anim.duration, interval))
              lastAdvanceAt = stepCtx.now
              if (Math.abs(scrollStartX) > 0.5) {
                scroll
                  .transition()
                  .duration(scrollDuration)
                  .ease(EASING_MAP.easeLinear)
                  .attr('transform', 'translate(0, 0)')
              } else {
                scroll.attr('transform', 'translate(0, 0)')
              }
            }
            // A non-rolling transition pass leaves the in-flight scroll alone.
          } else {
            // Reset any lingering scroll transform (resize, settings change, …).
            scroll.interrupt().attr('transform', 'translate(0, 0)')
            lastAdvanceAt = null
          }

          // Remember this pass's domain edges so the next transition measures the
          // roll from them (see scrollPre). Keep the prior values when the chart has
          // no data so an empty pass doesn't lose the reference.
          if (hasData(visible)) {
            const [domLo, domHi] = scales.x.domain()
            prevLo = +domLo!
            prevHi = +domHi!
          }
          lastRenderAt = stepCtx.now
          // Keep ~5 exit points per series (dots + the line's leftmost segment) so
          // the strip's left edge stays continuous as it scrolls off under the fade
          // mask instead of popping; takes effect on the next data-driven join.
          rtRef?.command('series.trimExitPoints', 5)
        },
      }),
    ],

    mount(rt) {
      rtRef = rt
    },
  }
}

/** Whether any visible series holds at least one point — the domain edges are only
 *  meaningful (and worth remembering across passes) when there is data. */
function hasData(visible: ReadonlyMap<string, VisibleSeriesEntry>): boolean {
  for (const s of visible.values()) {
    if (s.raw.length > 0) return true
  }
  return false
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
      // transition driver's scroll reshift; retire independently of later renders.
      const marked = sel.attr('class', exitingClass).attr('data-lc-exiting', '')
      if (reshift) {
        marked.each(function (this: Element) {
          ;(this as Element & { __lcReshift?: ReshiftSpec }).__lcReshift = reshift
        })
      }
      if (duration <= 0) {
        marked.remove()
        return
      }
      if (mode === 'transition') {
        // Transition is a strip scroll: the container carries these off the left
        // into the fade MASK (a positional gradient), which is what fades them.
        // Do NOT animate their opacity — with staggered multi-series appends the
        // container sits still between sub-appends, so an opacity fade made points
        // fade in place while nothing scrolled. Keep them fully drawn and simply
        // retire them once the scroll that carries them off has run.
        marked.transition().duration(duration).remove()
      } else {
        marked.transition().duration(duration).ease(ease).style('opacity', 0).remove()
      }
    },
  }
}
