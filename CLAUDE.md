# graphs

D3-based chart library shipped as an ES module and UMD bundle, consumed primarily via Blazor JS interop. Built as a **module graph**: every capability is a self-contained module with data-preparation and render steps; charts are module lists.

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
  charts/      chart definitions — line.ts = LINE_MODULES list + createLineChart factory
  types.ts     public types (ChartSettings, LineChartHandle, ChartSnapshot v2, …)
  defaults.ts  DEFAULT_SETTINGS (complete, no optional fields) + layout constants
  index.ts     public surface: types, DEFAULT_SETTINGS, transforms, createLineChart
```

### Engine concepts (src/lib/engine/)

- **Tokens** (`token<T>(id)` / `collectToken<T>(id)`) are the dependency currency. A module's steps declare the tokens they `read` and the token they `provide`; nobody imports anybody. Collect tokens gather contributions from any number of modules (margin requests, domain values, hover targets) — this is also how future chart types substitute capabilities (a pie slice module can provide the same hover-target token the tooltip consumes).
- **Prepare steps** compute data: pure given their inputs (use `ctx.now`, never `Date.now()`), cached by input revisions, outputs diffed (custom `equals` for closure-carrying values like scales). May return a Promise ONLY when genuinely async (Blazor interop) — an `async` function on the sync path would break the synchronous mutate→render contract.
- **Render steps** apply prepared data to the DOM: always synchronous, run in `(phase, layer z, registration)` order, skipped when all inputs are clean. Layers are declared `{name, z, host}` and materialized z-sorted by the context module — paint order comes from DOM structure, never from execution order.
- **Stores** are revisioned source nodes (settings, series, axes, annotations, viewport). Mutations replace values (clone-and-set), bump revisions, and queue a pass; public API methods call `rt.flushSync()` so the render lands before they return.
- **The computation plan** (`chart.explainPlan()` on any handle, or the harness Modules tab) shows waves, edges, and the render order. The pass logger (`engine.logger.enabled = true`) prints ran/skipped per step with the revision delta that caused it — the answer to "why did/didn't X re-render".
- **Commands** (`rt.provideCommand` / `rt.command`) are the sanctioned cross-module call: named capabilities, silent no-op when unregistered (e.g. `clearData` fires `'viewport.reset'`; `removeAxis` fires `'series.migrateAxis'` and `'annotations.dropAxis'`).

### The contribute/consume split (read this before adding layout-affecting modules)

A step may not read a merged value it also contributes to — that's a cycle, and the planner rejects it with a hint. Split the module into two steps at different graph depths: contribute from an early step (reads only stores/settings), consume the merged result from a later one. Canonical example: `labels.measure` contributes `MarginRequests`; `layout.merge` (context module) folds them into `Layout`; `labels.position` consumes `Layout`.

### Settings cascade

Per-series display properties are optional on the series slice; `undefined` falls back to the chart-wide `ChartSettings` value (axis color > series color > lineColor for strokes). The cascade is resolved ONCE per pass in `series.visible`; renderers consume the resolved values. Per-axis fields cascade the same way in `axes.layout`. `updateSettings()` changes the chart-wide value and automatically affects all series without an explicit override.

### Animation

`AnimationCtx` (provided by the animation module) carries the per-pass mode/duration/ease plus the helpers every renderer uses: `position(sel, role, apply)` (role-based tween policy: 'scrolled' snaps in transition mode, 'marker' tweens only in morph, 'free' tweens whenever animated), `renderPath` (drawOn dasharray / morph exit-point tween / transition snap), `fadeIn`, and `fadeOutExit` (renames out of joins, marks `data-lc-exiting` + a reshift spec). The transition scroll choreography lives entirely in the animation module's `scrollPre`/`scrollPost` steps — renderers never touch the scroll container transform.

## Adding a new module (checklist)

1. Create `src/lib/modules/<name>.ts` exporting a **factory** `xxxModule(): ChartModule` (factories keep per-chart state in closures — module objects are never shared between charts).
2. Declare the settings keys the module owns in `defaults` (the settings module ships the complete `DEFAULT_SETTINGS`; per-module declarations are visible duplicates of ownership).
3. Shared tokens go in `modules/tokens.ts` (+ a `KNOWN_PROVIDERS` hint); module-private tokens stay in the module file.
4. Register it in `LINE_MODULES` (`src/lib/charts/line.ts`) — the ONLY central file a new feature touches. Ordering matters: context first; series host before geometry modules (shared layer ⇒ registration order is element order inside each series group).
5. **Every chart feature must have a corresponding control in the dev harness** (`src/harness/`, one file per tab).
6. Add tests: unit tests for module internals + at least one public-API test in `tests/`.
7. If the module owns restorable state, implement `state(rt)` — it becomes a snapshot v2 slice automatically.
8. CHANGELOG entry.

## Dev harness

`index.html` + `src/main.ts` + `src/harness/` is the manual test harness. The Modules tab lists registered modules and dumps the computation plan to the console. Current coverage: curve type, line color/weight, dot radius, grid, tooltip, animation (mode + duration + easing), dark/light theme, dot border color, rolling window (`maxDataPoints`), multi-series, multi-axis, PDF export, chart title + axis labels, log scale + exponential data loader, moving average smoothing, LTTB decimation, annotations, snapshot capture/restore, zoom modes.

## Blazor interop notes

- The factory returns own-property bound methods (IJSObjectReference compatibility).
- `xAxisFormatter`/`yAxisFormatter` accept .NET delegate wrapper objects; labels are resolved via awaited `invokeMethodAsync('executeDelegate', …)` for exactly the rendered tick values, with default-formatter fallback (+ console.warn) on interop failure.
- Snapshot format is version 2 (`{ version: 2, modules: {…} }`); version-1 snapshots are rejected.
- NuGet packaging (`graphs.nuspec` + `Graphs.targets`) copies `graphs.es.js` into the consuming wwwroot; artifact names must not change. `build:nuget` reads the version from package.json — bump package.json AND graphs.nuspec together.
