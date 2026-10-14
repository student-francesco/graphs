# graphs

D3-based chart library shipped as an ES module and UMD bundle, consumed primarily via Blazor JS interop. Built as a **module graph**: every capability is a self-contained module with data-preparation and render steps; charts are module lists. Three charts ship: temporal line (`createLineChart`), numeric line (`createNumericChart`) and pie (`createPieChart`) — they share the engine and every chart-agnostic module.

## Build & test

```
npm run build:lib   # TypeScript check + Vite bundle → dist/lib/
npm run dev         # Dev server at http://localhost:5173
npm test            # Vitest (jsdom) — must stay green on every commit
```

**Standing rule:** the test suite stays green through every commit. Changing a characterization expectation means observable behavior changed — call it out explicitly in the commit message.

## Architecture

```
src/lib/
  engine/      chart-agnostic framework — tokens, stores, plan, executor, scheduler, layers
  modules/     one file per feature; modules NEVER import sibling modules (tokens.ts is the
               shared token declarations, not a module)
  charts/      chart definitions, one folder per chart: <chart>.ts = XXX_MODULES list + factory,
               types.ts = handle. line/ (LINE_MODULES, createLineChart), numeric-line/
               (NUMERIC_LINE_MODULES, createNumericChart), pie/ (PIE_MODULES, createPieChart)
  types.ts     public types (BaseChartSettings, ChartSettings, PieChartSettings, ChartSnapshot v2, …)
  defaults.ts  DEFAULT_SETTINGS / DEFAULT_PIE_SETTINGS (complete, no optional fields), PALETTE,
               layout constants
  index.ts     public surface: types, defaults, transforms, createLineChart / createNumericChart /
               createPieChart
```

### Engine concepts (src/lib/engine/)

- **Tokens** (`token<T>(id)` / `collectToken<T>(id)`) are the dependency currency. A module's steps declare the tokens they `read` and the token they `provide`; nobody imports anybody. Collect tokens gather contributions from any number of modules (margin requests, domain values, hover targets) — this is also how chart types substitute capabilities: the generic tooltip renders whatever `HoverTargets` it gets (line: one circle per point from `hover-points`; pie: one arc path per slice from `pie-slices`).
- **Prepare steps** compute data: pure given their inputs (use `ctx.now`, never `Date.now()`), cached by input revisions, outputs diffed (custom `equals` for closure-carrying values like scales). May return a Promise ONLY when genuinely async (Blazor interop) — an `async` function on the sync path would break the synchronous mutate→render contract.
- **Render steps** apply prepared data to the DOM: always synchronous, run in `(phase, layer z, registration)` order, skipped when all inputs are clean. Layers are declared `{name, z, host}` and materialized z-sorted by the context module — paint order comes from DOM structure, never from execution order.
- **Stores** are revisioned source nodes (settings, series, axes, annotations, viewport). Mutations replace values (clone-and-set), bump revisions, and queue a pass; public API methods call `rt.flushSync()` so the render lands before they return.
- **The computation plan** (`chart.explainPlan()` on any handle, or the harness Modules tab) shows waves, edges, and the render order. The pass logger (`engine.logger.enabled = true`) prints ran/skipped per step with the revision delta that caused it — the answer to "why did/didn't X re-render".
- **Commands** (`rt.provideCommand` / `rt.command`) are the sanctioned cross-module call: named capabilities, silent no-op when unregistered (e.g. `clearData` fires `'viewport.reset'`; `removeAxis` fires `'series.migrateAxis'` and `'annotations.dropAxis'`).

### The contribute/consume split (read this before adding layout-affecting modules)

A step may not read a merged value it also contributes to — that's a cycle, and the planner rejects it with a hint. Split the module into two steps at different graph depths: contribute from an early step (reads only stores/settings), consume the merged result from a later one. Canonical example: `labels.measure` contributes `MarginRequests`; `layout.merge` (context module) folds them into `Layout`; `labels.position` consumes `Layout`.

### Sharing modules across chart types

A module is shared when it reads only chart-agnostic tokens: `BaseSettings` (the settings store typed as `BaseChartSettings`), `D3Ctx`, `Layout`, `MarginRequests`, `HasData`, `AnimationCtx`, `HoverTargets`. Line modules read `Settings` (`ChartSettings`), pie modules `PieSettings` — all three are aliases of the same store, so the plan is identical. Shared modules that need per-chart variation take factory options instead of forking: `contextModule(container, { scrollChrome })`, `settingsModule({ defaults, transient })`, `animationModule({ scroll })`, `skeletonModule({ shape })`. `ChartEngine` takes a `name` ('LineChart' / 'PieChart') used as the error prefix (`rt.chartName`). The plan rejects a chart whose modules read a token nothing provides — that is what keeps line-only modules out of the pie.

### Settings cascade

Per-series display properties are optional on the series slice; `undefined` falls back to the chart-wide `ChartSettings` value (axis color > series color > lineColor for strokes). The cascade is resolved ONCE per pass in `series.visible`; renderers consume the resolved values. Per-axis fields cascade the same way in `axes.layout`. `updateSettings()` changes the chart-wide value and automatically affects all series without an explicit override.

### Animation

`AnimationCtx` (provided by the animation module) carries the per-pass mode/duration/ease plus the helpers every renderer uses: `position(sel, role, apply)` (role-based tween policy: 'scrolled' snaps in transition mode, 'marker' tweens only in morph, 'free' tweens whenever animated), `renderPath` (drawOn dasharray / morph exit-point tween / transition snap), `fadeIn`, and `fadeOutExit` (renames out of joins, marks `data-lc-exiting` + a reshift spec). The transition scroll choreography lives entirely in the animation module's `scrollPre`/`scrollPost` steps — renderers never touch the scroll container transform (`animationModule({ scroll: false })` omits them for charts that never scroll). Renderers that need a custom tween (pie arcs) use `shouldTween`, `mode`, `duration` and `ease` directly, on a *named* transition so `fadeOutExit`'s fade can run alongside.

## Adding a new module (checklist)

1. Create `src/lib/modules/<name>.ts` exporting a **factory** `xxxModule(): ChartModule` (factories keep per-chart state in closures — module objects are never shared between charts).
2. Declare the settings keys the module owns in `defaults` (the settings module ships the complete `DEFAULT_SETTINGS`; per-module declarations are visible duplicates of ownership).
3. Shared tokens go in `modules/tokens.ts` (+ a `KNOWN_PROVIDERS` hint); module-private tokens stay in the module file.
4. Register it in the chart's module list (`LINE_MODULES` in `src/lib/charts/line/temporal-line.ts` and `NUMERIC_LINE_MODULES` in `src/lib/charts/numeric-line/numeric-line.ts`, and/or `PIE_MODULES` in `src/lib/charts/pie/pie.ts`) — the ONLY central files a new feature touches. Ordering matters: context first; series host before geometry modules (shared layer ⇒ registration order is element order inside each series group).
5. **Every chart feature must have a corresponding control in the dev harness** (`src/harness/`, one file per tab).
6. Add tests: unit tests for module internals + at least one public-API test in `tests/`.
7. If the module owns restorable state, implement `state(rt)` — it becomes a snapshot v2 slice automatically.
8. CHANGELOG entry.

## Dev harness

`index.html` + `src/main.ts` + `src/harness/` is the manual test harness. The Modules tab lists registered modules and dumps the computation plan to the console. The chart-type toggle switches between `?chart=temporal|numeric|pie`; pie mode hides the line-only header row and tabs and shows the Pie tab (shared tabs take a `BaseHarness`). Pie coverage: sweep-in / morph / add / remove / clear, per-slice colour override + reset, palette presets, slice border, donut ratio, slice label content + inside/outside, value format, tooltip, dark/light theme. Line coverage: curve type, line color/weight, dot radius, grid, tooltip, animation (mode + duration + easing), dot border color, rolling window (`maxDataPoints`), multi-series, multi-axis, PDF export, chart title + axis labels, log scale + exponential data loader, moving average smoothing, LTTB decimation, annotations (incl. draggable horizontal lines + drag bounds), snapshot capture/restore, zoom modes.

## Blazor interop notes

- The factory returns own-property bound methods (IJSObjectReference compatibility).
- `xAxisFormatter`/`yAxisFormatter` accept .NET delegate wrapper objects; labels are resolved via awaited `invokeMethodAsync('executeDelegate', …)` for exactly the rendered tick values, with default-formatter fallback (+ console.warn) on interop failure.
- Snapshot format is version 2 (`{ version: 2, modules: {…} }`); version-1 snapshots are rejected.
- NuGet packaging (`graphs.nuspec` + `Graphs.targets`) copies `graphs.es.js` into the consuming wwwroot; artifact names must not change. `build:nuget` reads the version from package.json — bump package.json AND graphs.nuspec together.
