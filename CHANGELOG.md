# Changelog

All notable changes to this project will be documented in this file.
## Unreleased

### Fixed
- Transition (scroll) animation mode is now smooth for live charts whose series append at irregular / staggered intervals (e.g. several series updating at random times, or appends faster than `animationDuration`). Previously the strip stuttered, snapped to the right while still filling, and its lines flickered to inconsistent lengths. Changes:
  - **Roll-gated scroll.** The container scrolls only when the window is actually *rolling* — points have been trimmed off the left (pending exit points exist). While the chart is still filling (nothing trimmed yet) the domain merely grows to the right, so the container is left alone — no more snap-to-right during fill. A second series appending at an x already reached, or a restyle/resize, doesn't advance the rightmost point and no longer interrupts/restarts an in-flight scroll.
  - **Settled right edge → constant x resolution.** With a `maxDataPoints` cap, the domain's *upper* edge is held to the newest x that EVERY series has reached (min of per-series last x), not the single series that appended first. Staggered multi-series appends previously let a leading series widen the domain while the others lagged, then it narrowed when they caught up — the domain "breathed" every tick and the x-axis resolution (pixels per unit) jittered. Capping the upper edge (and leaving the lower edge at the natural minimum) makes the window a constant width that only translates. Crucially it caps the *right*, so the trailing exit points stay anchored to the natural left edge and remain correctly placed. Only a small lead (≤2 newer distinct x) is held back, so a genuinely longer series keeps its full extent; filling / aligned states are untouched.
  - **Continuous, interval-paced scroll.** When a new point advances the strip mid-animation, the scroll continues from the container's current position and eases back at a constant (linear) velocity paced to how fast points arrive (capped at `animationDuration`), so consecutive appends chain into one glide instead of re-decelerating from rest on every point.
  - **~5 exit points kept.** Trimmed-off points stay joined as ~5 pending exit points (dots + the line's leftmost segment; was 4) so the strip's left edge stays continuous as it scrolls off under the fade mask instead of popping.
  - **Exit dots fade via the mask, not opacity.** In transition mode, dots leaving the join are no longer opacity-faded — the container scroll carries them off the left into the fade *mask* (a positional gradient), which is what fades them. Previously the opacity tween ran on each staggered sub-append while the container sat still between them, so points visibly faded in place before anything scrolled. They now stay fully drawn and are simply retired once the scroll has carried them off.
  - **Line dissolves across the whole left blur instead of being clipped.** The chart-area clip and the fade mask only spanned the BASE left margin (and the clip only half of it), while the left blur overlay spans the FULL left margin (including stacked-axis rails). So the scrolling line was hard-clipped at partial opacity well before the blur and never dissolved into it — it showed a cut edge as the container shifted left. The clip and mask now span the full left margin (matching the blur overlay), their left edges coincide, and the mask fades fully to transparent there (was 0.12), so the strip dissolves smoothly across the entire left blur with no visible edge.
  - Single-series behavior, a lone append, and `updateData` transitions are unchanged.

## [1.0.1] - 2026-07-09

### Fixed
- Rebuilt the library so `createNumericChart` (the numeric line chart) is actually present in the shipped `graphs.es.js` / `graphs.umd.js`. The 1.0.0 NuGet package was packed from a stale `dist/lib` build that predated the index.ts export fix, so the export was still missing despite the changelog claiming it was fixed.

## [1.0.0] - 2026-06-29

### Added
- `createNumericChart`, `NumericChartHandle`, and `NumericDataPoint` are now exported from the package index (`index.ts` / `graphs.es.js`). The 0.4.0 bundle contained the implementation but the public surface was not wired into the entry point.

## [0.4.0] - 2026-06-26

### Added
- **Numeric line chart** (`createNumericChart`) — a second chart type for X/Y numeric data (both axes are `number`, no date parsing). Accepts `NumericDataPoint[]` (`{ x: number, y: number }`); shares the same module engine as the line chart (axes, tooltip, animation, zoom, export, snapshots). New public types: `NumericDataPoint`, `NumericChartHandle`. Surfaced in the dev harness with a dedicated Numeric tab.
- Engine performance profiler that accumulates wall-clock time spent in prepare steps vs render steps across passes. New diagnostic handle methods `setProfilerEnabled(on)`, `getProfilerStats()` (returns `{ passes, prepare: { totalMs, steps }, render: { totalMs, steps } }`), and `resetProfiler()`; enabling resets the counters. Surfaced in the dev harness Modules tab behind an "Enable profiler" toggle with a live readout. Disabled by default — timing wrappers are no-ops when off.
- Every prepare step now declares a required `description` summarizing what it computes. The computation plan (`explainPlan()`) prints the description under each step, and the dev harness Modules tab lists prepare steps with their descriptions. New diagnostic handle method `describePrepareSteps()` returns the steps (id + description) in wave order.
- Pass logger toggle exposed in the dev harness Modules tab (`engine.logger.enabled`) — prints ran/skipped steps with the revision delta that triggered each re-run.

### Fixed
- Grid no longer flashes a black full-width line across the top of the plot during animation. d3-axis emits a `.domain` spine that (because `tickSize()` also sets the outer tick size) is a full-width box; the removal of it now runs synchronously on the grid selection instead of inside the animated apply, where it was deferred to the transition's end.
- PDF export now sets an explicit chart size so the chart fully occupies the exported page rather than rendering at a smaller default size.

### Changed
- NuGet package renamed from `Graphs` to `Inficon.Graphs`.

## [0.3.0] - 2026-06-12

### Changed
- **Architecture rewritten as a module graph.** Every capability — including the chart context, series data, scales, axes, animation, zoom, annotations, tooltip, export, and snapshots — is now a self-contained module with a data-preparation step and a render step. Modules declare typed token dependencies; a computation plan resolves the module tree into cacheable execution waves (async Blazor formatter interop overlaps with other preparation work). The line chart is just a module list (`src/lib/charts/line.ts`); future chart types reuse the same context/tooltip/decimation/snapshot/export modules with different geometry modules.
- `createLineChart(divId, settings)` and the full `LineChartHandle` method surface are unchanged — Blazor consumers keep working without code changes. Artifact names (`graphs.es.js` / `graphs.umd.js`), the UMD global `GraphsLib`, and NuGet packaging are unchanged.
- Bundle size: 49.9 kB gzip UMD (was 42.5 kB) — the cost of the engine indirection and per-module separation.

### Added
- Diagnostic handle methods: `getRegisteredModules()` and `explainPlan()` (dumps the computation plan).
- Automated test suite (Vitest + jsdom): 200+ tests covering the public API surface, DOM structure, animation choreography, zoom/brush, snapshots, and Blazor delegate interop (including rejection fallbacks).
- Dev harness: split into per-tab modules with a new Modules status tab.

### Fixed
- Blazor x-axis tick labels from .NET delegate formatters now actually display — they were previously overwritten by the default formatter on every render.
- Blazor y-axis tick labels are resolved for exactly the tick values rendered — they previously mis-indexed when the resolved and rendered tick counts differed.
- Tick label resolution is awaited before the render commits — eliminates a race where exiting ticks could miss the transition scroll reshift under Blazor formatters.
- The loading skeleton is dismissed by any data ingress (it previously stayed on top of points added via `appendDataPoint`).

### BREAKING
- `getSnapshot()` / `restoreSnapshot()` use snapshot format version 2: `{ version: 2, modules: { settings, axes, series, annotations, zoom } }`, where each entry is captured/restored by the module that owns the state. Version-1 snapshots (0.2.x) are rejected with an error — re-capture after upgrading.
- The `LineChart` class is no longer exported; use the `createLineChart` factory (the documented Blazor entry point, unchanged).

---

## [0.2.1] - 2026-06-12

### Changed
- Axes fade in/out smoothly on update instead of snapping.

### Fixed
- Tick count for x and y axes now adjusts correctly when the chart is rendered at small sizes.

---

## [0.2.0] - 2026-06-09

### Changed
- Blazor `.NET` C# delegate formatters for **both** axes are now invoked asynchronously via `invokeMethodAsync`, with tick labels resolved up-front before rendering. The y-axis was brought in line with the x-axis, which already used this pattern. `renderAxes` is now `async` and returns a `Promise<void>`.

### Fixed
- Blazor Server delegate formatters on the y-axis now work — the previous synchronous `invokeMethod` path is unsupported on Blazor Server (which only allows asynchronous C# invocation). Both axes fall back to the default formatter if the interop call fails.

---

## [0.1.4] - 2026-06-08

### Changed
- Added debug logging (`console.log`) in Blazor delegate formatter catch blocks to aid diagnosis

---

## [0.1.3] - 2026-06-08

### Fixed
- Blazor delegate wrapper detection now uses `typeof formatter !== 'function'` instead of a property existence check, fixing a `JSException: yAxisFormatter is not a function` crash when a C# delegate was passed

---

## [0.1.2] - 2026-06-08

### Changed
- Renamed Blazor delegate wrapper JS method identifiers to camelCase: `executeDelegate`, `amIJsDelegateWrapper`

---

## [0.1.1] - 2026-06-08

### Changed
- `xAxisFormatter` and `yAxisFormatter` now support Blazor `.NET` delegate wrappers: if the value exposes `AmIJsDelegateWrapper`, it is invoked via `invokeMethod('ExecuteDelegate', …)` instead of as a plain JS function, enabling C# `Func<>` delegates to be passed directly from Blazor

### Removed
- Deprecated `AxisOptions` type alias (already marked `@deprecated Use AxisSettings`)

---

## [0.1.0] - 2026-05-26

### Added
- Annotation API — overlay horizontal or vertical reference lines on the chart for hysteresis indicators, thresholds, event markers, etc.
  - `setHorizontalLine(name, y, label, settings?)` — pinned to a y-axis; `y` is treated as a data point so the axis range includes it
  - `setVerticalLine(name, x, label, settings?)` — pinned to a timestamp (ISO 8601 string); not tied to any y-axis
  - `removeAnnotation(name)` and `clearAnnotations()`
  - New `AnnotationStyle`, `HorizontalAnnotationSettings`, `VerticalAnnotationSettings` types
- Snapshot API — capture and restore the chart's full mutable state for Blazor JS interop
  - `getSnapshot()` returns a JSON-safe `ChartSnapshot` (settings, axes, series, annotations, zoom + brush overrides, palette cursor)
  - `restoreSnapshot(snapshot)` tears down current state and rebuilds from the snapshot in a single re-render
  - `xAxisFormatter` / `yAxisFormatter` are silently dropped on capture and preserved from the host on restore (functions cannot survive JSON)
  - New `ChartSnapshot`, `SerializableChartSettings`, `AxisSnapshot`, `SeriesSnapshot`, `AnnotationSnapshot`, `ZoomSnapshot` types
- Dev harness gains Annotations and Snapshot tabs

### Changed
- `removeSeries('default')` is no longer a no-op — hosts can now fully clear the chart
- `setData`, `addPoint`, and `addPoints` now dismiss the skeleton and ensure the tooltip controller — any data-ingress call brings the chart out of its initial empty state (previously only `setData` did)

---

## [0.0.6] - 2026-05-22

### Added
- Pan + zoom interactions: mouse wheel zoom, drag pan, pinch zoom, double-click to reset (configurable via `zoomEnabled`, `zoomMode`, `zoomScaleExtent`)
- `zoomMode` setting — choose which axes the user can pan / zoom: `'x'` (default), `'y'`, or `'xy'`
- `zoomScaleExtent` setting — minimum / maximum scale factor for zoom (default `[1, 100]`)
- Modifier-key brush selection: Ctrl/Cmd + drag dynamically resolves to a horizontal, vertical, or rectangular brush based on gesture direction, and zooms into the selected region using per-axis domain overrides
- `resetZoom()` API — returns the chart to its natural extent (animated, no-op when already at identity)

### Changed
- Once any brush is active, both axes unlock for further panning regardless of `zoomMode`

---

## [0.0.5] - 2026-05-19

### Added
- `AxisSettings` interface — comprehensive per-axis type (renamed from `AxisOptions`; `AxisOptions` kept as a deprecated alias for backward compat)
- `AxisSettings` adds `scaleType`, `showGrid`, `gridColor`, `gridOpacity` as per-axis overrides; all cascade from `ChartSettings` when `undefined`
- `SeriesSettings` expanded with `showLabels`, `labelFormat`, `dotBorderColor` as per-series overrides; all cascade from `ChartSettings` when `undefined`
- `ChartSettings extends SeriesSettings, AxisSettings` in TypeScript — chart-wide fields serve as global defaults for every series and axis
- `updateSeriesSettings(id, Partial<SeriesSettings>)` — sparse-merge display settings into a specific series and re-render
- `updateAxisSettings(id, Partial<AxisSettings>)` — sparse-merge settings into a specific axis and re-render

### Changed
- Dev harness UI restructured: always-visible header for data actions + tabs (Line / Animation / Series / Axes / Labels)
- Harness Series tab now exposes per-series dot radius, curve type, smoothing, decimation, show labels, dot border color via `updateSeriesSettings`
- Harness Axes tab now exposes per-axis scale type, grid visibility, grid color, and grid opacity via `updateAxisSettings`
- `updateSettings({ yScaleType })` now cascades to **all** axes without an explicit `scaleType` override, not just the primary axis
- `createAxis` accepts `AxisSettings` (was `AxisOptions`) and supports `scaleType`, `showGrid`, `gridColor`, `gridOpacity` at creation time

---

## [0.0.4] - 2026-05-19

### Added
- Moving average (rolling mean) smoothing with configurable window size (`smoothing` setting)
- Logarithmic Y-axis scale (`logScale` on `AxisOptions`)
- LTTB (Largest-Triangle-Three-Buckets) data decimation for performance on dense datasets (`decimation` setting)
- `dotBorderColor` setting for marker dot stroke color
- Dense dataset loader in dev harness to exercise the decimation slider
- Smoothing slider in dev harness

### Changed
- Per-series display properties (`color`, `lineWeight`, `dotRadius`, `curveType`, `smoothing`, `decimation`) now cascade from chart-wide `ChartSettings`; `undefined` on a series falls back to the chart-wide value at render time
- `updateSettings()` propagates appearance changes to all series that have no explicit per-series override

### Fixed
- `dotRadius`, `curveType`, and `lineWeight` were not propagated to series on `updateSettings`

---

## [0.0.3] - 2026-05-18

### Added
- Multi-series support — multiple data series on a single chart
- Multi-axis support — independent Y-axes per series
- Data point labels (`showLabels` / `labelFormat` settings)
- Dark mode / light mode theming (`theme` setting; applies to skeleton, tooltip, and dots)
- PDF export via `saveToPdf()` — dependency-free SVG → canvas → PDF pipeline
- Chart title and axis label settings (`title`, `xAxisLabel`, `yAxisLabel`)
- Series name shown in tooltip

### Fixed
- Axis names repositioned to use spare space correctly

---

## [0.0.2] - 2026-04-13

### Added
- `Graphs.targets` MSBuild targets file to automate dist file placement in consuming projects
- NuGet packaging support (`graphs.nuspec`, `nuget.exe`, `build:nuget` script)
- Grid color input in dev harness

---

## [0.0.1] - 2026-04-13

### Added
- Initial release of the D3-based line chart library as an ES module and UMD bundle
- Animation system: multiple animation types (`append`, `full`, `none`), `expout` easing auto-selected for high-frequency appends
- Blur filter at chart start and end edges
- Scroll-container stability fixes during animated appends
- X-axis tick and dot placement corrected during animation
- Sourcemaps disabled for production build
