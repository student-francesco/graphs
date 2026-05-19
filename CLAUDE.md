# graphs

D3-based line-chart library shipped as an ES module and UMD bundle, consumed primarily via Blazor JS interop.

## Build

```
npm run build:lib   # TypeScript check + Vite bundle → dist/lib/
npm run dev         # Dev server at http://localhost:5173
```

## Dev harness

`index.html` + `src/main.ts` is the manual test harness. **Every chart feature must have a corresponding control in the harness.** When adding a new `ChartSettings` field, `SeriesSettings` option, or public API method, add a matching UI control so it can be exercised without writing throwaway code.

Current harness coverage: curve type, line color/weight, dot radius, grid, tooltip, animation (mode + duration + easing), dark/light theme, dot border color, rolling window (`maxDataPoints`), multi-series, multi-axis, PDF export, chart title + axis labels, log scale + exponential data loader, moving average smoothing, LTTB decimation.

## Architecture

- `src/lib/types.ts` — all public types (`ChartSettings`, `SeriesSettings`, `AxisOptions`, `DataPoint`, …)
- `src/lib/defaults.ts` — `DEFAULT_SETTINGS` (must stay complete — no optional fields)
- `src/lib/LineChart.ts` — main class; rendering pipeline, data lifecycle, scale building
- `src/lib/axes.ts` — axis + grid rendering; exports `YScale` type
- `src/lib/transforms.ts` — pure data functions: `movingAverage`, `lttb`
- `src/lib/index.ts` — public API re-exports + `createLineChart()` factory

## Settings cascade

Per-series display properties (`color`, `lineWeight`, `dotRadius`, `curveType`, `smoothing`, `decimation`) are optional on `SeriesState`. `undefined` means fall back to the chart-wide `ChartSettings` value at render time. Explicit per-series overrides are set via `SeriesSettings` (at `addSeries` time) or the `setSeriesColor` / `setSeriesWeight` fast-path methods. `updateSettings()` changes the chart-wide value and automatically affects all series without an explicit override.
