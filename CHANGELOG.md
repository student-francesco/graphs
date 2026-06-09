# Changelog

All notable changes to this project will be documented in this file.

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
