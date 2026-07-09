# How to Create a Module

A **module** is the unit of capability in this chart library. Charts are nothing more than ordered lists of modules; the engine wires them together through tokens, with no module ever importing another.

---

## Table of Contents

1. [Concepts](#1-concepts)
2. [The ChartModule interface](#2-the-chartmodule-interface)
3. [Tokens](#3-tokens)
4. [Prepare steps](#4-prepare-steps)
5. [Render steps](#5-render-steps)
6. [Stores](#6-stores)
7. [Mount lifecycle](#7-mount-lifecycle)
8. [API contribution](#8-api-contribution)
9. [Snapshot state](#9-snapshot-state)
10. [Commands — cross-module calls](#10-commands--cross-module-calls)
11. [The contribute/consume split](#11-the-contributeconsume-split)
12. [Registering in a chart](#12-registering-in-a-chart)
13. [Full checklist](#13-full-checklist)
14. [Worked examples](#14-worked-examples)

---

## 1. Concepts

**Tokens** are the dependency currency. Every piece of data that flows between modules travels as a token — a typed identifier. No module imports data from another; it only reads tokens.

**Prepare steps** compute data from tokens, producing a new token as output. The engine runs them in dependency waves; within a wave, steps whose inputs are all clean are skipped.

**Render steps** consume prepared tokens and write to the DOM. They are always synchronous and run in `(phase, layer z, registration)` order.

**Stores** are the mutable roots of the graph. Calling `store.set(…)` bumps a revision and queues a render pass.

**Layers** are z-ordered SVG groups managed by the context module. A render step declares the layer it paints into; DOM paint order comes from this, never from execution order.

**Commands** are named capabilities one module can invoke on another without importing it.

---

## 2. The ChartModule interface

```typescript
// src/lib/engine/module.ts
export interface ChartModule {
  readonly id: string
  readonly defaults?: Record<string, unknown>   // settings keys this module owns
  readonly stores?: readonly StoreSpec[]
  readonly prepare?: readonly AnyPrepareStep[]
  readonly render?: readonly AnyRenderStep[]
  mount?(rt: ModuleRuntime): (() => void) | void
  api?(rt: ModuleRuntime): Record<string, (...args: never[]) => unknown>
  state?(rt: ModuleRuntime): StateSlice
}
```

All fields are optional except `id`. A module that only renders (no computation) needs just `id`, `defaults`, and `render`.

**Convention:** modules are always exported as a factory function — `fooModule(): ChartModule` — so per-chart closure state lives in the factory, not in a shared object.

---

## 3. Tokens

### `token<T>(id)` — single-producer

One prepare step (or store) provides the value; consumers receive `T`.

```typescript
import { token } from '../engine/index.ts'

const MyResult = token<MyType>('mymodule.result')
```

Module-private tokens are declared in the module file. Cross-module tokens are declared in [src/lib/modules/tokens.ts](src/lib/modules/tokens.ts) and added to `KNOWN_PROVIDERS`.

### `collectToken<T>(id)` — many-contributors

Any number of modules can contribute a value; consumers receive `readonly T[]` in registration order. Used for margin reservations, domain values, and hover targets.

```typescript
import { collectToken } from '../engine/index.ts'

const MarginRequests: CollectToken<Partial<ChartMargins>> =
  collectToken('layout.marginRequests')
```

### Shared tokens quick reference

| Token | Type | Provided by |
|---|---|---|
| `Settings` | `ChartSettings` | `settings` module |
| `D3Ctx` | `D3Context` | `context` module |
| `ContainerSize` | `{ width, height }` | `context` module |
| `Layout` | `LayoutBox` | `context` module |
| `MarginRequests` | `CollectToken<Partial<ChartMargins>>` | any module |
| `HasData` | `boolean` | `series` module |
| `VisibleSeries` | `ReadonlyMap<string, VisibleSeriesEntry>` | `series` module |
| `SmoothedSeries` | `ReadonlyMap<string, readonly DataPoint[]>` | `smoothing` module |
| `DisplaySeries` | `ReadonlyMap<string, readonly DataPoint[]>` | `decimation` module |
| `AxesDef` | `readonly AxisDef[]` | `axes-store` module |
| `AxisLayouts` | `readonly AxisLayoutEntry[]` | `axes-store` module |
| `Scales` | `ScaleBundle` | `scales` module |
| `ViewTransform` | `ViewTransformState` | `zoom` module |
| `AnimationCtx` | `AnimationCtxValue` | `animation` module |

---

## 4. Prepare steps

Prepare steps compute derived data. They are cached by input revision — if none of the declared `reads` changed, the step is skipped and the previous output reused.

```typescript
import { prepareStep } from '../engine/index.ts'

prepareStep({
  id: 'mymodule.compute',      // unique per chart; convention: '<module>.<step>'
  reads: {
    settings: Settings,        // token → resolved value in run()
    scales: Scales,
  },
  provides: MyResultToken,     // output token

  // Optional: contribute a slice of the output to a CollectToken.
  // The projection is diffed independently — consumers of MarginRequests
  // only wake when the margin itself changes, not when the full output does.
  contributes: [
    { to: MarginRequests, select: out => out.marginRequest },
  ],

  // Optional: custom output differ (default is strict equality).
  equals: (prev, next) => prev.desc === next.desc,

  // Optional cache policy (default 'by-revision'):
  // 'by-revision' — skip when no input rev changed (default)
  // 'tracked'     — reserved for future proxy tracking; behaves like 'by-revision' today
  // false         — run every pass
  cache: 'by-revision',

  run({ settings, scales }, ctx): MyType {
    // ctx.now   — timestamp captured at pass start; NEVER call Date.now() here
    // ctx.signal — AbortSignal; bail after awaits if aborted (chart destroyed)
    // ctx.trigger — { kind, seriesId? } — what caused this pass
    return computeSomething(settings, scales)
  },
})
```

**Async steps:** `run` may return a `Promise` when genuinely async (e.g. Blazor interop). Avoid `async` on the synchronous path — it turns a sync pass async and delays rendering.

---

## 5. Render steps

Render steps write to the DOM. They **must be synchronous** — an `await` inside a render step would interleave mutations with a half-painted DOM.

```typescript
import { renderStep } from '../engine/index.ts'

renderStep({
  id: 'mymodule.render',
  reads: {
    layout: Layout,
    data: MyResultToken,
  },

  // Declare a z-ordered layer group in one of the SVG hosts:
  //   host 'scroll'  — scrollable chart area (series content, grid)
  //   host 'inner'   — non-scrolling inner group
  //   host 'overlay' — top-level overlay SVG (tooltips, chrome labels)
  layer: { name: 'my-layer', z: 50, host: 'inner' },

  // Optional: 'pre' runs before all 'main' steps; 'post' after. Default 'main'.
  phase: 'main',

  // Optional: ordering key for steps without a layer (default 0).
  order: 0,

  // Optional: run even when all inputs are clean (rare).
  alwaysRun: false,

  run({ layout, data }, ctx) {
    const g = ctx.layer!   // this step's SVG group (null when no layer declared)

    // ctx.changed(tok) — true when tok's value changed since this step last ran
    if (!ctx.changed(MyResultToken)) return  // skip expensive DOM work

    // ctx.layers — access any other layer group:
    //   ctx.layers.get('grid')  → d3 selection for that group

    // Standard D3 enter/update/exit pattern:
    const sel = g.selectAll<SVGCircleElement, Datum>('.my-el').data(data.items)
    sel.exit().remove()
    sel.enter().append('circle').attr('class', 'my-el').merge(sel)
      .attr('cx', d => d.x)
      .attr('cy', d => d.y)
  },
})
```

### Animation

When a render step should animate, use `AnimationCtx` instead of applying attrs directly:

```typescript
reads: { ..., anim: AnimationCtx },

run({ layout, data, anim }, ctx) {
  // position() applies through a transition or selection depending on the role:
  //   'scrolled' — snaps in transition mode (the scroll container carries motion)
  //   'marker'   — tweens only in morph mode (dots, point markers)
  //   'free'     — tweens whenever the pass is animated (labels, annotations)
  anim.position(myGroup, 'free', s => s.attr('transform', `translate(${x},${y})`))

  // Entering elements:
  anim.fadeIn(entering)

  // Exiting elements:
  anim.fadeOutExit(exiting, 'my-exiting-class')
}
```

---

## 6. Stores

A store is a mutable source node. Every mutation bumps a revision and queues a pass.

```typescript
import { storeSpec, token } from '../engine/index.ts'

const MyState = token<MyStateType>('mymodule.state')

// Declare the store in the module:
stores: [
  storeSpec({
    token: MyState,
    init: (): MyStateType => ({ value: 0 }),
  }),
],

// Access the store in mount / api / state:
mount(rt) {
  const store = rt.store(MyState)
  store.get()                              // read current value
  store.set(newValue, { kind: 'interaction' })   // replace value
  store.update(s => ({ ...s, value: 42 }), { kind: 'mutation' })  // functional update
  store.rev                                // current revision number
},
```

**TriggerInfo kinds:** `'setData' | 'updateData' | 'append' | 'restore' | 'mutation' | 'interaction' | 'resize'`

---

## 7. Mount lifecycle

`mount` runs once after the DOM scaffold exists. Return a cleanup function for any resources that need disposing when the chart is destroyed.

```typescript
mount(rt) {
  const observer = new ResizeObserver(entries => {
    if (rt.isDestroyed()) return        // long-lived callbacks must guard this
    const { width, height } = entries[0].contentRect
    rt.requestRender({ kind: 'resize' })
  })
  observer.observe(someElement)

  return () => observer.disconnect()   // called on chart destroy
},
```

---

## 8. API contribution

`api` returns an object whose methods are merged onto the public chart handle. Name collisions across modules throw at construction time.

```typescript
api(rt) {
  const store = rt.store(MyState)
  return {
    setMyValue: (value: number): void => {
      store.update(s => ({ ...s, value }))
      rt.flushSync()   // renders synchronously before returning — callers see the update
    },
  }
},
```

`rt.flushSync()` runs any pending pass synchronously (when no async step is in flight). All public mutating API methods should call it so the DOM is updated before they return.

---

## 9. Snapshot state

Implement `state` to participate in `getSnapshot()` / `restoreSnapshot()`. The slice must be JSON-serializable — drop function-valued fields.

```typescript
state(rt) {
  const store = rt.store(MyState)
  return {
    key: 'mymodule',          // unique key in the snapshot object
    capture: () => {
      const { fn: _fn, ...safe } = store.get()  // drop non-serializable fields
      return safe
    },
    restore: value => {
      store.update(current => ({
        ...current,
        ...(value as Partial<MyStateType>),
        fn: current.fn,       // keep live references that aren't in the snapshot
      }))
      // No need to call flushSync — the snapshot module triggers a single pass
      // after all slices are restored.
    },
  }
},
```

---

## 10. Commands — cross-module calls

Commands let one module invoke a capability of another without importing it. An unregistered command is a silent no-op.

```typescript
// Providing a command (in the owning module's mount or api):
rt.provideCommand('mymodule.reset', () => {
  store.set(initialState)
})

// Calling a command (from any module):
rt.command('mymodule.reset')
rt.command('axes.resolveId', requestedId)   // returns unknown; cast if needed
```

Existing commands: `'viewport.reset'`, `'series.migrateAxis'`, `'annotations.dropAxis'`, `'axes.resolveId'`.

---

## 11. The contribute/consume split

A prepare step cannot read a token it also contributes to — that would be a cycle, and the planner rejects it with an error.

**The pattern:** split into two steps at different graph depths.

```
Step A  reads: Settings            →  provides: PlanToken
                                      contributes: { to: MarginRequests, select: … }

(context module's layout.merge step folds all MarginRequests into Layout)

Step B  reads: PlanToken + Layout  →  provides: PositionsToken
```

Step A reads only stores/settings (no Layout). Step B reads Layout (which has already absorbed Step A's contribution). No cycle.

This is the canonical example in [src/lib/modules/labels.ts](src/lib/modules/labels.ts). Apply it whenever your module needs to both reserve layout space and consume the final layout.

---

## 12. Registering in a chart

Add the module factory call to `LINE_MODULES` in [src/lib/charts/line.ts](src/lib/charts/line.ts). This is the only central file a new feature touches.

```typescript
export function LINE_MODULES(container: HTMLElement): ChartModule[] {
  return [
    contextModule(container),   // MUST be first — realizes the layer tree
    settingsModule(),
    axesStoreModule(),
    seriesModule(),             // series host must precede geometry modules
    smoothingModule(),
    decimationModule(),
    animationModule(),
    scalesModule(),
    gridModule(),
    axesRenderModule(),
    geometryLineModule(),       // geometry order within series group:
    dotsModule(),               //   line → dots → value labels
    valueLabelsModule(),
    myNewModule(),              // ← add here, after its dependencies
    annotationsModule(),
    tooltipModule(),
    exportModule(),
    zoomModule(),
    snapshotModule(),
    skeletonModule(),
    labelsModule(),
  ]
}
```

**Ordering rules:**
- `contextModule` must be first — it builds the layer tree everything else paints into.
- The series host (`seriesModule`) must precede all geometry modules that paint into the shared `'series'` layer — registration order is DOM element order within each series group.
- A module must appear after all modules that provide tokens it reads.

If you add a cross-module token to `tokens.ts`, also add it to the `KNOWN_PROVIDERS` map so error messages identify the missing module.

---

## 13. Full checklist

- [ ] Create `src/lib/modules/<name>.ts` exporting `nameModule(): ChartModule`
- [ ] Declare owned settings keys in `defaults` (matching values in `defaults.ts`)
- [ ] Add shared tokens to `tokens.ts` + `KNOWN_PROVIDERS`; keep private tokens in the module file
- [ ] Register in `LINE_MODULES` — the only central file to touch
- [ ] Add a corresponding control to the dev harness (`src/harness/`, one file per tab)
- [ ] Add tests: unit tests for module internals + at least one public-API test in `tests/`
- [ ] If the module owns restorable state, implement `state(rt)` — it becomes a snapshot v2 slice automatically
- [ ] Add a CHANGELOG entry

---

## 14. Worked examples

### Minimal render-only module — grid

[src/lib/modules/grid.ts](src/lib/modules/grid.ts) is the simplest real module: no stores, no prepare steps, just a single render step that reads tokens from other modules and draws grid lines.

```typescript
export function gridModule(): ChartModule {
  return {
    id: 'grid',
    defaults: { showGrid: true, gridColor: '#e5e7eb', gridOpacity: 0.7 },

    render: [
      renderStep({
        id: 'grid.render',
        reads: { scales: Scales, axisLayouts: AxisLayouts, layout: Layout,
                 anim: AnimationCtx, hasData: HasData },
        layer: { name: 'grid', z: 10, host: 'scroll' },
        run: ({ scales, axisLayouts, layout, anim, hasData }, ctx) => {
          const g = ctx.layer!
          const primary = axisLayouts[0]!
          if (!hasData || !primary.showGrid) {
            g.selectAll('.lc-grid-x,.lc-grid-y').remove()
            return
          }
          // … d3 axis calls to draw grid lines …
          anim.position(yGridEl, 'scrolled', s => applyYGrid(s))
          // Drop the d3-axis `.domain` spine on the plain selection (not inside
          // position() — a transition would defer .remove() and flash the line).
          yGridEl.select('.domain').remove()
        },
      }),
    ],
  }
}
```

Key points:
- `host: 'scroll'` — the grid lives below series content in the scrollable area.
- `'scrolled'` role — the scroll container carries x-motion in transition mode; the grid snaps rather than tweening.
- The `.domain` removal must happen on the real selection, not inside `anim.position`, because a transition would defer it.

---

### Contribute/consume split — labels

[src/lib/modules/labels.ts](src/lib/modules/labels.ts) demonstrates the canonical two-step pattern for modules that need to reserve layout space and then use the final layout.

```typescript
export function labelsModule(): ChartModule {
  return {
    id: 'labels',
    defaults: { title: null, xLabel: null, yLabel: null },

    prepare: [
      // Step 1 — reads only settings; contributes a margin reservation.
      // Must NOT read Layout here — that would be a cycle.
      prepareStep({
        id: 'labels.measure',
        reads: { settings: Settings },
        provides: LabelPlanTok,
        contributes: [{ to: MarginRequests, select: plan => plan.marginRequest }],
        run: ({ settings }): LabelPlan => ({
          title: settings.title,
          marginRequest: {
            ...(settings.title   ? { top:    TITLE_SPACE   } : {}),
            ...(settings.xLabel  ? { bottom: X_LABEL_SPACE } : {}),
            ...(settings.yLabel  ? { left:   Y_LABEL_SPACE } : {}),
          },
        }),
      }),

      // Step 2 — reads the merged Layout (which already absorbed the margin
      // contributed above) plus the plan token from Step 1.
      prepareStep({
        id: 'labels.position',
        reads: { plan: LabelPlanTok, layout: Layout },
        provides: LabelPositionsTok,
        run: ({ plan, layout }): LabelPositions => {
          const m = layout.margins
          return {
            title: plan.title
              ? { text: plan.title, x: layout.innerWidth / 2, y: -(m.top / 2) }
              : null,
            // … xLabel, yLabel …
          }
        },
      }),
    ],

    render: [
      renderStep({
        id: 'labels.render',
        reads: { pos: LabelPositionsTok },
        layer: { name: 'chrome-labels', z: 90, host: 'overlay' },
        run: ({ pos }, ctx) => { /* d3 enter/update/exit for title, xLabel, yLabel */ },
      }),
    ],
  }
}
```

The `contributes` projection (`select: plan => plan.marginRequest`) means the `MarginRequests` collect token only sees a revision bump when the margin itself changes — not every time settings change.

---

### Settings/store/api/state — settings module

[src/lib/modules/settings.ts](src/lib/modules/settings.ts) shows how a store, API, and snapshot state all fit together in one module.

```typescript
export function settingsModule(): ChartModule {
  return {
    id: 'settings',
    defaults: { ...DEFAULT_SETTINGS },

    render: [
      renderStep({
        id: 'settings.root',
        reads: { settings: Settings, ctx: D3Ctx },
        phase: 'pre', order: -200,          // runs before all 'main' render steps
        run: ({ settings, ctx }) => {
          ctx.svg.node()!.dataset.theme = settings.theme
          ctx.svg.attr('aria-label', settings.ariaLabel)
        },
      }),
    ],

    api(rt) {
      const settings = rt.store(Settings)
      return {
        updateSettings: (partial: Partial<ChartSettings>): void => {
          settings.update(current => ({ ...current, ...partial }))
          rt.flushSync()
        },
      }
    },

    state(rt) {
      const settings = rt.store(Settings)
      return {
        key: 'settings',
        capture: () => {
          const { xAxisFormatter: _xf, yAxisFormatter: _yf, ...serializable } = settings.get()
          return serializable   // formatters are functions — not JSON-safe
        },
        restore: value => {
          settings.update(current => ({
            ...current,
            ...(value as Partial<ChartSettings>),
            xAxisFormatter: current.xAxisFormatter,  // keep live formatters
            yAxisFormatter: current.yAxisFormatter,
          }))
        },
      }
    },
  }
}
```
