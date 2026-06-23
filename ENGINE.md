# Engine Internals

The engine (`src/lib/engine/`) is chart-agnostic: it has no D3 dependency, no knowledge of axes or series, and no notion of what a line chart is. Its job is to wire together a list of `ChartModule` objects into a reactive computation graph, run that graph on demand, and present a unified public API.

---

## Table of Contents

1. [Architecture overview](#1-architecture-overview)
2. [Tokens](#2-tokens)
3. [Stores](#3-stores)
4. [Computation plan](#4-computation-plan)
5. [Executor](#5-executor)
6. [Scheduler](#6-scheduler)
7. [LayerManager](#7-layermanager)
8. [ChartEngine — the assembler](#8-chartengine--the-assembler)
9. [ModuleRuntime](#9-moduleruntime)
10. [PassLogger](#10-passlogger)
11. [shallowEquals](#11-shallowequals)
12. [Public API assembly](#12-public-api-assembly)
13. [Lifecycle sequence diagram](#13-lifecycle-sequence-diagram)

---

## 1. Architecture overview

```
ChartEngine
  │
  ├─ StoreRegistry   — mutable roots; every set() queues a pass
  ├─ resolvePlan()   — topological sort → ComputationPlan (waves + render order)
  ├─ LayerManager    — z-ordered SVG group registry
  ├─ Executor        — runs one pass: prepare waves then render steps
  └─ Scheduler       — coalesces requests; serialises async passes
```

The data flow within a single pass is strictly one-way:

```
Stores  ──►  Prepare wave 0  ──►  Prepare wave 1  ──►  …  ──►  Render steps
```

No module ever calls another; all communication goes through tokens.

---

## 2. Tokens

**File:** [src/lib/engine/token.ts](src/lib/engine/token.ts)

Tokens are typed identifiers — a phantom type carrier at compile time, a string id at runtime. They decouple producers from consumers: a prepare step declares what it `provides` and what it `reads`; the planner infers the edges.

```typescript
export interface Token<T> {
  readonly id: string
  readonly kind: 'single'
}

export interface CollectToken<T> {
  readonly id: string
  readonly kind: 'collect'
}
```

| Kind | Producers | Consumer receives |
|---|---|---|
| `Token<T>` | Exactly one prepare step (or store) | `T` |
| `CollectToken<T>` | Any number of prepare steps | `readonly T[]` in registration order |

### Built-in engine tokens

Two tokens are published by the engine itself and are always available as `sourceTokens` (they are never provided by a prepare step):

| Token | Type | Published by |
|---|---|---|
| `SettingsToken` | `Record<string, unknown>` | Engine, from merged defaults + user settings |
| `Trigger` | `TriggerInfo` | Engine, at the start of every pass |

`Trigger` always counts as changed, so any step that reads it runs on every pass.

### TriggerInfo

```typescript
export type TriggerKind =
  | 'setData' | 'updateData' | 'append'
  | 'restore' | 'mutation' | 'interaction' | 'resize'

export interface TriggerInfo {
  kind: TriggerKind
  seriesId?: string   // set when a single series caused the pass
}
```

Trigger kinds have a priority ordering used by the scheduler when multiple mutations coalesce (see [Scheduler](#6-scheduler)).

### DepsSpec and ResolvedDeps

These utility types drive the `reads` → run argument mapping:

```typescript
// What a step declares:
type DepsSpec = Record<string, Token<unknown> | CollectToken<unknown>>

// What run() receives:
type ResolvedDeps<D extends DepsSpec> = {
  readonly [K in keyof D]: TokenValue<D[K]>
  // Token<T>        → T
  // CollectToken<T> → readonly T[]
}
```

---

## 3. Stores

**File:** [src/lib/engine/store.ts](src/lib/engine/store.ts)

Stores are the mutable source nodes of the graph. Every mutation bumps a revision number and notifies the scheduler to queue a pass.

```typescript
export interface StoreHandle<S> {
  readonly token: Token<S>
  get(): S
  set(next: S, trigger?: TriggerInfo): void    // replace value, bump rev
  update(fn: (current: S) => S, trigger?: TriggerInfo): void  // functional update
  readonly rev: number
}
```

**`update` optimization:** if `fn` returns the same reference (`Object.is(next, current) === true`), the revision is not bumped and no pass is queued. This is how "no-op" mutations avoid spurious renders.

`StoreRegistry` manages all stores for a chart instance. It validates that no two modules register the same token id and calls the scheduler's `request()` on every mutation.

The engine always registers one store automatically — `SettingsToken` — initialised from the merged module defaults plus the user's `opts.settings`.

---

## 4. Computation plan

**File:** [src/lib/engine/plan.ts](src/lib/engine/plan.ts)

`resolvePlan(modules, opts)` performs a one-time topological sort over all prepare steps and produces a `ComputationPlan`:

```typescript
export interface ComputationPlan {
  readonly waves: ReadonlyArray<ReadonlyArray<AnyPrepareStep>>
  readonly renderOrder: ReadonlyArray<AnyRenderStep>
  readonly providerOf: ReadonlyMap<string, AnyPrepareStep>
  readonly contributorsOf: ReadonlyMap<string, readonly ContributorRef[]>
  explain(): string   // human-readable wave + render listing
  toDot(): string     // Graphviz DOT for visualization
}
```

### Wave assignment

The planner uses longest-path layering (Coffman–Graham style): a step's wave is `max(wave of all its transitive input providers) + 1`. Steps in the same wave have no dependency on each other and the executor runs them concurrently within a wave.

Source tokens (stores + engine tokens) are treated as wave −1; any step whose only inputs are sources lands in wave 0.

Cycles are detected during the depth-first wave traversal and reported with the full path:

```
engine: dependency cycle: labels.position → layout.merge → labels.position.
If a step both consumes a merged value and contributes to it, split the module
into two steps (contribute from an early step, consume the merge from a later one).
```

### Render order

Render steps do not participate in wave assignment (they provide no tokens). They are sorted once at plan time:

1. **Phase** — `'pre'` (0) → `'main'` (1) → `'post'` (2)
2. **Z / order** — `step.layer?.z ?? step.order ?? 0` (ascending)
3. **Registration index** — tie-break; preserves module list order

This means paint order is fully determined by declarations, not by which steps happen to run in a given pass.

### Inspecting the plan

From any chart handle:

```typescript
chart.explainPlan()
// wave 0:
//   labels.measure (settings) → labels.plan ⊕layout.marginRequests
//   series.visible (settings, axes.def, series.store) → series.visible
// wave 1:
//   layout.merge (context.size, layout.marginRequests, settings) → layout.box
//   scales.compute (series.smoothed, axes.layouts, zoom.viewTransform) → scales.bundle
// render:
//   [pre]  settings.root (no-layer)
//   [main] grid.render (scroll/grid@10)
//   [main] geometry.line (scroll/series@50)
//   …
```

---

## 5. Executor

**File:** [src/lib/engine/executor.ts](src/lib/engine/executor.ts)

The executor runs one pass end-to-end: all prepare waves in order, then all render steps.

### Dirty checking

Every step tracks the revision of each input token at the time it last ran (`lastInputRevs`). Before running a step the executor calls `dirtyReason()`:

```typescript
private dirtyReason(reads, state): string | null {
  if (!state.hasRun) return 'first run'
  for (const tok of Object.values(reads)) {
    const recorded = state.lastInputRevs.get(tok.id)
    const current = this.revOf(tok.id, tok.kind)
    if (recorded !== current) return `"${tok.id}" rev ${recorded}→${current}`
  }
  return null   // all inputs clean — skip
}
```

If `dirtyReason` returns `null`, the step is skipped and its previous output remains in effect. The `PassLogger` records `'skipped'` vs `'ran'` for every step.

Revision sources:

| Token kind | Revision lives in |
|---|---|
| Store token | `StoreEntry.rev` in `StoreRegistry` |
| Prepare output (`Token<T>`) | `TokenState.rev` in `Executor.tokens` |
| Collect token | `Executor.collectRevs` — bumped when any contribution's `select` output changes |

### Output diffing after `commitPrepare`

After a step runs, the executor compares the new output to the previous one using the step's `equals` function (defaulting to `shallowEquals`). If the output is equal, the token's revision is **not** bumped:

```typescript
const changed = !state?.hasRun || !equalsFn(prev.value, out)
if (changed) this.publish(step.provides.id, out, /* bump */ true)
```

This means a step that recomputes but returns an equal value does not wake its consumers — the revision propagation stops there.

### Contribution diffing

Each `contributes` projection is diffed independently using `shallowEquals`. The collect token's revision is only bumped when the projected value actually changes:

```typescript
if (!had || !shallowEquals(prevValue, value)) {
  this.contributions.set(key, value)
  this.collectRevs.set(contrib.to.id, rev + 1)
}
```

This is important for `MarginRequests`: a module whose settings changed but whose margin contribution is unchanged will not re-trigger layout recalculation.

### Async passes

`run()` may return a `Promise`. The executor detects this with `isThenable()`. When any step in a wave returns a promise:

1. All async steps in that wave are awaited with `Promise.all`.
2. Subsequent waves and the render phase only start after all async steps in the current wave settle.
3. Render steps remain **synchronous** — they never see a promise.

The complete pass is synchronous (no microtask) unless at least one `run()` returns a promise. This preserves the monolith's synchronous `mutate → render` contract for the common non-Blazor case.

### Cache policies

| Policy | Behaviour |
|---|---|
| `'by-revision'` (default) | Skip when no declared input token's revision changed |
| `'tracked'` | Reserved — currently identical to `'by-revision'` |
| `false` | Run on every pass regardless of input revisions |

---

## 6. Scheduler

**File:** [src/lib/engine/scheduler.ts](src/lib/engine/scheduler.ts)

The scheduler coalesces store mutations into render passes and serialises async passes.

### Trigger priority

When multiple mutations arrive before a pass runs, the scheduler keeps only the highest-priority trigger:

```
setData(6) > updateData(5) > append(4) > restore(3) > mutation(2) > resize(1) > interaction(0)
```

```typescript
export function mergeTriggers(a: TriggerInfo | null, b: TriggerInfo): TriggerInfo {
  if (a === null) return b
  return PRIORITY[b.kind] > PRIORITY[a.kind] ? b : a
}
```

The pass that eventually runs sees the most significant trigger, which allows prepare steps to fast-path on `ctx.trigger.kind`.

### Pass coalescing

Mutations arriving in the same microtask collapse into one pass:

```typescript
request(trigger): void {
  this.pendingTrigger = mergeTriggers(this.pendingTrigger, trigger)
  if (!this.microtaskQueued) {
    this.microtaskQueued = true
    queueMicrotask(() => this.flush())
  }
}
```

### `flushSync()`

Public API methods call `rt.flushSync()` (which calls `scheduler.flushSync()`) so the render lands before they return. This gives the library synchronous mutate-then-query semantics from the caller's perspective.

### Async pass serialisation

While a pass is async (`this.running === true`), new mutations still accumulate. When the async pass settles, `flush()` is called again and any accumulated work runs in a single follow-up pass.

A guard prevents render loops from running indefinitely: after 100 consecutive passes without quiescing, the scheduler throws.

---

## 7. LayerManager

**File:** [src/lib/engine/layers.ts](src/lib/engine/layers.ts)

Layers are named, z-ordered `<g>` elements inside host containers. Paint order comes from DOM structure — not execution order — so a pass that skips some render steps cannot accidentally reorder elements.

### Lifecycle

**Declaration phase (plan time):** Every render step that declares a `layer` spec calls `layers.declare_()`. The manager validates that conflicting specs (same name, different z or host) are an error.

**Realization phase (mount time):** The context module calls `layers.realize(hosts)` with a map of host name → d3 selection. The manager sorts declared layers by z within each host and appends the `<g data-layer="name">` elements in order.

**Usage (render time):** `ctx.layer` in a render step is the realized group for that step's declared layer, obtained via `layers.layer(name)`. Steps can also reach other layers via `ctx.layers.layer('other-name')`.

### Host names

The context module provides three hosts:

| Host | SVG element | Contents |
|---|---|---|
| `'scroll'` | `scrollG` inside `chartAreaG` | Grid, series geometry — scrolls during transition |
| `'inner'` | `innerG` inside the main SVG | Axes, non-scrolling chart chrome |
| `'overlay'` | `overlayG` inside a second full-size SVG on top | Tooltips, title/axis labels |

---

## 8. ChartEngine — the assembler

**File:** [src/lib/engine/engine.ts](src/lib/engine/engine.ts)

`ChartEngine` is the glue that turns a module list into a running chart.

### Construction sequence

```
1. Validate unique module ids
2. Merge module defaults → settings store initial value
3. Create Scheduler, StoreRegistry
4. Register SettingsToken store
5. Register all module stores; build sourceTokens set
6. resolvePlan() → ComputationPlan
7. Declare all render-step layers in LayerManager
8. Create Executor
9. mount() each module in registration order
   └─ context module must be first: it calls layers.realize()
      which all later mounts may depend on
10. Request an initial pass + flushSync()
    → renders the skeleton/empty state synchronously
```

Step 9 is why module ordering matters: `mount` on later modules may call `rt.layers.layer('name')` which requires the layer tree to already be realized.

### Destruction

`destroy()` is idempotent. It:
1. Sets `destroyed = true`
2. Aborts the `AbortController` — all async steps in flight see `ctx.signal.aborted` and should bail out after their next `await`
3. Calls all `mount` disposers in **reverse** registration order

Long-lived callbacks (ResizeObserver, event listeners) must guard against post-destroy invocations:

```typescript
if (rt.isDestroyed()) return
```

---

## 9. ModuleRuntime

**File:** [src/lib/engine/module.ts](src/lib/engine/module.ts) (interface), [engine.ts](src/lib/engine/engine.ts) (`runtime()` method)

`ModuleRuntime` is the object handed to `mount`, `api`, and `state`. It is the module's window into the engine.

```typescript
export interface ModuleRuntime {
  // Store access
  store<S>(tok: Token<S>): StoreHandle<S>
  peek<T>(tok: Token<T>): T | undefined
  peekCollect<T>(tok: CollectToken<T>): readonly T[]

  // Pass control
  requestRender(trigger?: TriggerInfo): void
  flushSync(): void

  // Cross-module calls
  provideCommand(name: string, fn: (...args: never[]) => unknown): void
  command<A extends unknown[]>(name: string, ...args: A): unknown

  // DOM
  readonly layers: LayerManager

  // Introspection
  readonly modules: readonly ChartModule[]
  isDestroyed(): boolean
}
```

`peek` / `peekCollect` read the last committed token value outside of a pass. Useful in `mount` or event handlers. Returns `undefined` before the first pass has committed the token.

`command` is a silent no-op when the named command has not been registered — this is intentional, so modules can fire commands at capabilities that may or may not be present (e.g. `clearData` fires `'viewport.reset'` which is only registered when the zoom module is included).

---

## 10. PassLogger

**File:** [src/lib/engine/debug.ts](src/lib/engine/debug.ts)

The pass logger is the answer to "why did / didn't step X run?"

```typescript
chart.setLoggerEnabled(true)
// or, from test/module code:
engine.logger.enabled = true
```

Output format (browser console, `debug` level):

```
[chart] pass 7 ← mutation
[chart]   prepare labels.measure: skipped (inputs clean)
[chart]   prepare scales.compute: ran ("series.store" rev 3→4)
[chart]   render grid.render: skipped (inputs clean)
[chart]   render geometry.line: ran ("scales.bundle" rev 2→3)
[chart] pass 7 done
```

Every step logs whether it `ran`, `ran-async`, or was `skipped`, along with the revision delta that caused it to run (or `'inputs clean'` / `'first run'`).

---

## 11. shallowEquals

**File:** [src/lib/engine/diff.ts](src/lib/engine/diff.ts)

The default output differ for prepare steps. One level deep by design: D3 renderers reconcile per-element through data joins, so the engine only needs to answer "did this output change at all" cheaply.

Handles: `Object.is` (primitives, reference identity), `Date` (by time), `Array` (length + leaf equals per element), plain objects (key set + leaf equals per value), `Map` (size + leaf equals per entry).

Leaf comparisons use `Object.is` plus `Date` by time — arrays/objects inside arrays are compared by reference.

Steps with more specific needs (scale bundles that compare domain/range descriptors) supply a custom `equals` function:

```typescript
prepareStep({
  …
  equals: (prev, next) => prev.desc === next.desc,
  …
})
```

---

## 12. Public API assembly

`ChartEngine.buildApi()` composes the public chart handle:

1. Iterates `modules` in registration order, calling `m.api?.(rt)` for each.
2. Merges all returned method maps; throws on name collisions.
3. Wraps every method in a liveness check that throws if called after `destroy()`.
4. Adds three engine-owned methods that modules may not shadow:
   - `destroy()` — idempotent teardown
   - `getRegisteredModules()` — returns `string[]` of module ids
   - `explainPlan()` — returns the computation plan as a string
   - `setLoggerEnabled(boolean)` — toggles the pass logger

The returned object is cast to the chart handle type (`LineChartHandle`) at the call site in `createLineChart`.

---

## 13. Lifecycle sequence diagram

```
createLineChart(divId, settings)
│
├─ new ChartEngine(LINE_MODULES(container), { settings })
│    │
│    ├─ merge defaults → settings store
│    ├─ register module stores
│    ├─ resolvePlan()            ← throws on cycle / missing provider / duplicate id
│    ├─ declare layers
│    ├─ mount modules in order
│    │    ├─ contextModule.mount()  → layers.realize() ← MUST be first
│    │    ├─ settingsModule.mount() → (no-op)
│    │    ├─ seriesModule.mount()   → rt.provideCommand('series.migrateAxis', …)
│    │    └─ …
│    └─ scheduler.request({ kind: 'mutation' }) + flushSync()
│         └─ executor.runPass()   ← initial synchronous pass
│
└─ return engine.buildApi()  →  LineChartHandle


chart.updateSettings({ title: 'Pressure' })
│
├─ settings store: update() → bump rev → scheduler.request('mutation')
├─ rt.flushSync()
│    └─ executor.runPass('mutation')
│         ├─ wave 0: labels.measure   — dirty (settings rev changed) → run
│         │          series.visible   — dirty (settings rev changed) → run
│         │          …
│         ├─ wave 1: layout.merge     — dirty (marginRequests rev changed) → run
│         │          scales.compute   — clean (no domain change) → skip
│         │          …
│         └─ render: settings.root    — dirty → ran
│                    grid.render      — clean → skipped
│                    labels.render    — dirty (labels.positions changed) → ran
│                    …
└─ returns synchronously


chart.destroy()
│
├─ destroyed = true
├─ abort.abort()   ← async steps in flight see signal.aborted
└─ disposers in reverse order
     ├─ labelsModule dispose (none)
     ├─ …
     └─ contextModule dispose → ResizeObserver.disconnect()
```
