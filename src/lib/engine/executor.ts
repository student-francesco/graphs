import { shallowEquals } from './diff.ts'
import type { LayerManager } from './layers.ts'
import type { AnyPrepareStep, RenderStepContext, StepContext } from './module.ts'
import type { ComputationPlan } from './plan.ts'
import type { StoreRegistry } from './store.ts'
import { Trigger, type AnyToken, type TriggerInfo } from './token.ts'
import type { PassLogger } from './debug.ts'

interface TokenState {
  value: unknown
  rev: number
}

interface StepState {
  hasRun: boolean
  /** Input revisions captured when the step's deps were resolved for its last run. */
  lastInputRevs: Map<string, number>
}

function isThenable(v: unknown): v is Promise<unknown> {
  return typeof v === 'object' && v !== null && typeof (v as Promise<unknown>).then === 'function'
}

/**
 * Executes one pass of the computation plan: prepare waves in dependency order
 * (concurrent within a wave), then the render phase in z-order.
 *
 * Synchronous-when-possible: when every dirty prepare step returns a plain value
 * (the non-Blazor case), the entire pass — including rendering — completes before
 * runPass returns. This preserves the monolith's synchronous mutate→render contract.
 * Only a step that actually returns a promise (awaiting C# formatter interop) tips
 * the pass into async mode.
 */
export class Executor {
  private readonly tokens = new Map<string, TokenState>()
  /** `${stepId}#${contributionIndex}` → last contribution value. */
  private readonly contributions = new Map<string, unknown>()
  /** Collect-token id → revision (bumped when any contribution changes). */
  private readonly collectRevs = new Map<string, number>()
  private readonly prepareState = new Map<string, StepState>()
  private readonly renderState = new Map<string, StepState>()
  private passCounter = 0

  private readonly plan: ComputationPlan
  private readonly stores: StoreRegistry
  private readonly layers: LayerManager
  private readonly signal: AbortSignal
  private readonly log: PassLogger

  constructor(
    plan: ComputationPlan,
    stores: StoreRegistry,
    layers: LayerManager,
    signal: AbortSignal,
    log: PassLogger,
  ) {
    this.plan = plan
    this.stores = stores
    this.layers = layers
    this.signal = signal
    this.log = log
  }

  runPass(trigger: TriggerInfo): void | Promise<void> {
    const passId = ++this.passCounter
    this.publish(Trigger.id, trigger, /* alwaysBump */ true)
    const ctx: StepContext = { passId, now: Date.now(), signal: this.signal, trigger }
    this.log.passStart(passId, trigger)
    return this.runWaves(0, ctx)
  }

  /** Last committed value of a token (stores read live). */
  peek(tokenId: string): unknown {
    if (this.stores.has(tokenId)) return this.stores.entry(tokenId).value
    return this.tokens.get(tokenId)?.value
  }

  peekCollect(tokenId: string): readonly unknown[] {
    return this.collectValue(tokenId)
  }

  // ---------------------------------------------------------------------------

  private runWaves(fromWave: number, ctx: StepContext): void | Promise<void> {
    for (let w = fromWave; w < this.plan.waves.length; w++) {
      if (this.signal.aborted) return
      const pending: Promise<void>[] = []
      for (const step of this.plan.waves[w]!) {
        const dirtyReason = this.prepareDirtyReason(step)
        if (dirtyReason === null) {
          this.log.step(ctx.passId, step.id, 'skipped', 'inputs clean')
          continue
        }
        const { deps, inputRevs } = this.resolveDeps(step.reads)
        const out = step.run(deps, ctx)
        if (isThenable(out)) {
          this.log.step(ctx.passId, step.id, 'ran-async', dirtyReason)
          pending.push(out.then(value => this.commitPrepare(step, value, inputRevs)))
        } else {
          this.log.step(ctx.passId, step.id, 'ran', dirtyReason)
          this.commitPrepare(step, out, inputRevs)
        }
      }
      if (pending.length > 0) {
        return Promise.all(pending).then(() => this.runWaves(w + 1, ctx))
      }
    }
    if (this.signal.aborted) return
    this.renderPhase(ctx)
  }

  private renderPhase(ctx: StepContext): void {
    for (const step of this.plan.renderOrder) {
      const state = this.renderState.get(step.id) ?? { hasRun: false, lastInputRevs: new Map() }
      const dirtyReason = step.alwaysRun
        ? 'alwaysRun'
        : this.dirtyReason(step.reads, state)
      if (dirtyReason === null) {
        this.log.render(ctx.passId, step.id, false, 'inputs clean')
        continue
      }
      const { deps, inputRevs } = this.resolveDeps(step.reads)
      const renderCtx: RenderStepContext = {
        layer: step.layer ? this.layers.layer(step.layer.name) : null,
        layers: this.layers,
        changed: (tok: AnyToken) => {
          const recorded = state.lastInputRevs.get(tok.id)
          return recorded === undefined || recorded !== this.revOf(tok.id, tok.kind)
        },
        passId: ctx.passId,
        now: ctx.now,
        trigger: ctx.trigger,
      }
      this.log.render(ctx.passId, step.id, true, dirtyReason)
      step.run(deps, renderCtx)
      this.renderState.set(step.id, { hasRun: true, lastInputRevs: inputRevs })
    }
    this.log.passEnd(ctx.passId)
  }

  private prepareDirtyReason(step: AnyPrepareStep): string | null {
    if (step.cache === false) return 'cache disabled'
    const state = this.prepareState.get(step.id)
    if (!state?.hasRun) return 'first run'
    return this.dirtyReason(step.reads, state)
  }

  private dirtyReason(
    reads: Record<string, AnyToken>,
    state: StepState,
  ): string | null {
    if (!state.hasRun) return 'first run'
    for (const tok of Object.values(reads)) {
      const recorded = state.lastInputRevs.get(tok.id)
      const current = this.revOf(tok.id, tok.kind)
      if (recorded !== current) return `"${tok.id}" rev ${recorded ?? '∅'}→${current}`
    }
    return null
  }

  private revOf(tokenId: string, kind: 'single' | 'collect'): number {
    if (kind === 'collect') return this.collectRevs.get(tokenId) ?? 0
    if (this.stores.has(tokenId)) return this.stores.entry(tokenId).rev
    return this.tokens.get(tokenId)?.rev ?? 0
  }

  private resolveDeps(reads: Record<string, AnyToken>): {
    deps: Record<string, unknown>
    inputRevs: Map<string, number>
  } {
    const deps: Record<string, unknown> = {}
    const inputRevs = new Map<string, number>()
    for (const [key, tok] of Object.entries(reads)) {
      inputRevs.set(tok.id, this.revOf(tok.id, tok.kind))
      if (tok.kind === 'collect') {
        deps[key] = this.collectValue(tok.id)
      } else if (this.stores.has(tok.id)) {
        deps[key] = this.stores.entry(tok.id).value
      } else {
        deps[key] = this.tokens.get(tok.id)?.value
      }
    }
    return { deps, inputRevs }
  }

  private collectValue(tokenId: string): readonly unknown[] {
    const refs = this.plan.contributorsOf.get(tokenId) ?? []
    const values: unknown[] = []
    for (const ref of refs) {
      const key = `${ref.step.id}#${ref.index}`
      if (this.contributions.has(key)) values.push(this.contributions.get(key))
    }
    return values
  }

  private commitPrepare(
    step: AnyPrepareStep,
    out: unknown,
    inputRevs: Map<string, number>,
  ): void {
    const state = this.prepareState.get(step.id)
    const prev = this.tokens.get(step.provides.id)
    const equalsFn = step.equals ?? shallowEquals
    const changed = !state?.hasRun || prev === undefined || !equalsFn(prev.value, out)

    if (changed) {
      this.publish(step.provides.id, out, true)
    }
    // Keep the previous reference when unchanged — maximizes downstream Object.is hits.

    for (const [index, contrib] of (step.contributes ?? []).entries()) {
      const key = `${step.id}#${index}`
      const value = contrib.select(changed ? out : prev!.value)
      const had = this.contributions.has(key)
      const prevValue = this.contributions.get(key)
      if (!had || !shallowEquals(prevValue, value)) {
        this.contributions.set(key, value)
        this.collectRevs.set(contrib.to.id, (this.collectRevs.get(contrib.to.id) ?? 0) + 1)
      }
    }

    this.prepareState.set(step.id, { hasRun: true, lastInputRevs: inputRevs })
  }

  private publish(tokenId: string, value: unknown, bump: boolean): void {
    const existing = this.tokens.get(tokenId)
    if (existing) {
      existing.value = value
      if (bump) existing.rev++
    } else {
      this.tokens.set(tokenId, { value, rev: 1 })
    }
  }
}
