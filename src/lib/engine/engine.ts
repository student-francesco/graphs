import { PassLogger } from './debug.ts'
import { Executor } from './executor.ts'
import { LayerManager } from './layers.ts'
import type { ChartModule, ModuleRuntime } from './module.ts'
import { resolvePlan, type ComputationPlan } from './plan.ts'
import { Scheduler } from './scheduler.ts'
import { StoreRegistry, type StoreHandle } from './store.ts'
import { SettingsToken, Trigger, type CollectToken, type Token, type TriggerInfo } from './token.ts'

export interface EngineOptions {
  /** User settings merged over the modules' combined defaults. */
  settings?: Record<string, unknown>
  /** token id → module id hints for "did you forget module X?" plan errors. */
  knownProviders?: ReadonlyMap<string, string>
}

/**
 * Assembles a chart from a module list: merges defaults into the settings store,
 * registers module stores, resolves the computation plan, mounts modules in
 * registration order (the context module must come first — it realizes the layer
 * tree every later mount may use), then runs the initial pass synchronously.
 */
export class ChartEngine {
  readonly logger = new PassLogger()
  readonly layers = new LayerManager()
  readonly plan: ComputationPlan
  readonly modules: readonly ChartModule[]

  private readonly stores: StoreRegistry
  private readonly executor: Executor
  private readonly scheduler: Scheduler
  private readonly abort = new AbortController()
  private readonly disposers: Array<() => void> = []
  private readonly commands = new Map<string, (...args: never[]) => unknown>()
  private destroyed = false

  constructor(modules: readonly ChartModule[], opts: EngineOptions = {}) {
    this.modules = modules

    const ids = new Set<string>()
    for (const m of modules) {
      if (ids.has(m.id)) throw new Error(`engine: duplicate module id "${m.id}"`)
      ids.add(m.id)
    }

    const defaults: Record<string, unknown> = {}
    for (const m of modules) Object.assign(defaults, m.defaults)
    const settings = { ...defaults, ...opts.settings }

    this.scheduler = new Scheduler(trigger => this.executor.runPass(trigger))
    this.stores = new StoreRegistry(trigger => this.scheduler.request(trigger))
    this.stores.register(SettingsToken, settings)

    const sourceTokens = new Set<string>([Trigger.id, SettingsToken.id])
    for (const m of modules) {
      for (const spec of m.stores ?? []) {
        this.stores.register(spec.token, spec.init())
        sourceTokens.add(spec.token.id)
      }
    }

    this.plan = resolvePlan(modules, { sourceTokens, knownProviders: opts.knownProviders })
    for (const step of this.plan.renderOrder) {
      if (step.layer) this.layers.declare_(step.layer)
    }

    this.executor = new Executor(
      this.plan,
      this.stores,
      this.layers,
      this.abort.signal,
      this.logger,
    )

    const rt = this.runtime()
    for (const m of modules) {
      const dispose = m.mount?.(rt)
      if (dispose) this.disposers.push(dispose)
    }

    // Initial pass — renders the empty/skeleton state synchronously, as the
    // monolith's constructor does.
    this.scheduler.request({ kind: 'mutation' })
    this.scheduler.flushSync()
  }

  runtime(): ModuleRuntime {
    return {
      store: <S>(tok: Token<S>): StoreHandle<S> => this.stores.handle(tok),
      peek: <T>(tok: Token<T>): T | undefined => this.executor.peek(tok.id) as T | undefined,
      peekCollect: <T>(tok: CollectToken<T>): readonly T[] =>
        this.executor.peekCollect(tok.id) as readonly T[],
      requestRender: (trigger?: TriggerInfo) =>
        this.scheduler.request(trigger ?? { kind: 'mutation' }),
      provideCommand: (name, fn) => {
        if (this.commands.has(name)) {
          throw new Error(`engine: command "${name}" registered twice`)
        }
        this.commands.set(name, fn)
      },
      command: (name, ...args) => this.commands.get(name)?.(...(args as unknown as never[])),
      flushSync: () => this.scheduler.flushSync(),
      layers: this.layers,
      modules: this.modules,
      isDestroyed: () => this.destroyed,
    }
  }

  /**
   * Compose the public handle from module api() maps. Every method is wrapped with
   * a liveness check; `destroy` is engine-owned and idempotent.
   */
  buildApi(): Record<string, unknown> {
    const api: Record<string, unknown> = {}
    const rt = this.runtime()
    for (const m of this.modules) {
      for (const [name, fn] of Object.entries(m.api?.(rt) ?? {})) {
        if (name === 'destroy') {
          throw new Error(`engine: module "${m.id}" must not contribute "destroy" (engine-owned)`)
        }
        if (name in api) {
          throw new Error(`engine: api method "${name}" contributed twice (module "${m.id}")`)
        }
        api[name] = (...args: never[]) => {
          this.assertAlive()
          return fn(...args)
        }
      }
    }
    api['destroy'] = () => this.destroy()
    if (!('getRegisteredModules' in api)) {
      api['getRegisteredModules'] = () => this.modules.map(m => m.id)
    }
    if (!('explainPlan' in api)) {
      api['explainPlan'] = () => this.plan.explain()
    }
    if (!('setLoggerEnabled' in api)) {
      api['setLoggerEnabled'] = (enabled: boolean) => { this.logger.enabled = enabled }
    }
    return api
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.abort.abort()
    for (const dispose of [...this.disposers].reverse()) dispose()
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error('LineChart: called on destroyed instance')
  }
}
