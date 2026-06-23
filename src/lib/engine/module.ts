import type * as d3 from 'd3'
import type { CollectToken, DepsSpec, ResolvedDeps, Token, TriggerInfo } from './token.ts'
import type { LayerManager } from './layers.ts'
import type { StoreHandle } from './store.ts'

/**
 * Cache policies for prepare steps.
 * - 'by-revision' (default): re-run when any declared input token's revision changed.
 * - 'tracked': reserved for proxy-recorded attribute tracking — currently behaves
 *   exactly like 'by-revision'; module code written against it needs no change when
 *   the tracked implementation lands.
 * - false: run on every pass.
 */
export type CachePolicy = 'tracked' | 'by-revision' | false

export interface StepContext {
  readonly passId: number
  /** Timestamp captured once at pass start — prepare steps must not call Date.now(). */
  readonly now: number
  /** Aborted when the chart is destroyed; async steps bail out after awaits. */
  readonly signal: AbortSignal
  readonly trigger: TriggerInfo
}

export interface ContributionSpec<Out, C> {
  readonly to: CollectToken<C>
  /**
   * Pure projection of the step output. Contributions are diffed independently of
   * the main output, so consumers of the collect token only wake when the
   * contribution itself changed.
   */
  readonly select: (out: Out) => C
}

export interface PrepareStep<D extends DepsSpec = DepsSpec, Out = unknown> {
  /** Unique per chart, conventionally '<module>.<step>'. */
  readonly id: string
  /** Human-readable summary of what this step computes — shown in the plan/debug views. */
  readonly description: string
  readonly reads: D
  readonly provides: Token<Out>
  readonly contributes?: ReadonlyArray<ContributionSpec<Out, unknown>>
  readonly cache?: CachePolicy
  /** Custom output differ — e.g. scale bundles compare domain/range descriptors. */
  readonly equals?: (prev: Out, next: Out) => boolean
  run(deps: ResolvedDeps<D>, ctx: StepContext): Out | Promise<Out>
}

export type LayerHost = string

export interface LayerSpec {
  readonly name: string
  /** Paint order within the host — lower z paints first (further back). */
  readonly z: number
  readonly host: LayerHost
}

export type RenderPhase = 'pre' | 'main' | 'post'

export interface RenderStepContext {
  /** This step's own z-ordered group; null when the step declared no layer. */
  readonly layer: d3.Selection<SVGGElement, unknown, null, undefined> | null
  readonly layers: LayerManager
  /** True when the given token's value changed since this step last ran. */
  changed(tok: Token<unknown> | CollectToken<unknown>): boolean
  readonly passId: number
  readonly now: number
  readonly trigger: TriggerInfo
}

export interface RenderStep<D extends DepsSpec = DepsSpec> {
  readonly id: string
  readonly reads: D
  /** Omit for steps that paint outside the layer tree (e.g. skeleton on the raw svg). */
  readonly layer?: LayerSpec
  /** Execution group: 'pre' runs before all 'main' steps, 'post' after. Default 'main'. */
  readonly phase?: RenderPhase
  /** Ordering key for steps without a layer (defaults to 0). */
  readonly order?: number
  /** Run even when all inputs are clean (rare — prefer declared reads). */
  readonly alwaysRun?: boolean
  /** MUST be synchronous: an await here would interleave mutations with half-painted DOM. */
  run(deps: ResolvedDeps<D>, ctx: RenderStepContext): void
}

/* Heterogeneous step lists cannot retain per-step generics; these helpers typecheck
 * construction and erase to the Any* forms for storage. */
export type AnyPrepareStep = PrepareStep<DepsSpec, unknown>
export type AnyRenderStep = RenderStep<DepsSpec>

export function prepareStep<D extends DepsSpec, Out>(step: PrepareStep<D, Out>): AnyPrepareStep {
  return step as unknown as AnyPrepareStep
}

export function renderStep<D extends DepsSpec>(step: RenderStep<D>): AnyRenderStep {
  return step as AnyRenderStep
}

/** Declarative store owned by a module — a source node of the graph. */
export interface StoreSpec<S = unknown> {
  readonly token: Token<S>
  init(): S
}

export function storeSpec<S>(spec: StoreSpec<S>): StoreSpec {
  return spec as StoreSpec
}

/** JSON-safe state slice a module contributes to snapshots. */
export interface StateSlice {
  readonly key: string
  capture(): unknown
  /** Restore runs inside a batch; the caller triggers a single pass afterwards. */
  restore(value: unknown): void
}

export interface ModuleRuntime {
  store<S>(tok: Token<S>): StoreHandle<S>
  /** Last committed value of a token (undefined before its first pass). */
  peek<T>(tok: Token<T>): T | undefined
  peekCollect<T>(tok: CollectToken<T>): readonly T[]
  requestRender(trigger?: TriggerInfo): void
  /**
   * Named capability registry — the sanctioned way for one module to invoke
   * another without importing it (e.g. clearData fires 'viewport.reset', which
   * the zoom module registers). Unregistered commands are silent no-ops.
   */
  provideCommand(name: string, fn: (...args: never[]) => unknown): void
  command<A extends unknown[]>(name: string, ...args: A): unknown
  /**
   * Run any pending pass synchronously when possible (no async step in flight).
   * Public API methods call this so mutations render before they return, matching
   * the monolith's synchronous behavior.
   */
  flushSync(): void
  readonly layers: LayerManager
  readonly modules: readonly ChartModule[]
  /** True once destroy() ran — long-lived callbacks (observers) must bail. */
  isDestroyed(): boolean
}

export interface ChartModule {
  readonly id: string
  /** Settings keys this module owns; merged into the chart's effective defaults. */
  readonly defaults?: Record<string, unknown>
  readonly stores?: readonly StoreSpec[]
  readonly prepare?: readonly AnyPrepareStep[]
  readonly render?: readonly AnyRenderStep[]
  /** One-time setup after the DOM scaffold exists. Returns an optional dispose. */
  mount?(rt: ModuleRuntime): (() => void) | void
  /** Public handle methods contributed by this module. Name collisions throw. */
  api?(rt: ModuleRuntime): Record<string, (...args: never[]) => unknown>
  /** Snapshot participation: the slice this module captures and restores. */
  state?(rt: ModuleRuntime): StateSlice
}
