# Graphs

A TypeScript charting library built with [D3.js](https://d3js.org/). Designed for seamless integration into modern web projects and optimized for **Blazor JS interop** scenarios.

## Features

- **Blazor-Ready**: Factory functions tailored for `IJSObjectReference` compatibility.
- **Smart Updates**: Delta-aware `updateData` for efficient live/streaming data visualization.
- **Fluid Animations**: Support for path morphing, stroke drawing, and sliding container transitions.
- **Responsive & Interactive**: Built-in tooltips, grid lines, and adaptive layouts.
- **Customizable**: Extensive settings for curves, colors, weights, and easing functions.

## Installation

### Via NuGet (for Blazor/ASP.NET Core)
The library is distributed as a NuGet package for easy inclusion in `wwwroot`:
```powershell
.\nuget.exe pack graphs.nuspec
```
(Or use your preferred NuGet package manager).

### Via npm (Development)
```bash
npm install
```

## Quick Start

### Basic Usage
```typescript
import { createLineChart } from './lib/index'

// Initialize the chart
const chart = createLineChart('chart-container', {
  lineColor: '#4f46e5',
  dotRadius: 4,
  showTooltip: true,
  animationDuration: 1000,
})

// Load data
const data = [
  { date: '2024-01-01T00:00:00Z', value: 100 },
  { date: '2024-01-02T00:00:00Z', value: 105 },
  { date: '2024-01-03T00:00:00Z', value: 98 },
]
chart.setData(data)
```

### Blazor Interop Example
```csharp
var module = await JS.InvokeAsync<IJSObjectReference>("import", "./graphs.es.js");
var chart  = await module.InvokeAsync<IJSObjectReference>("createLineChart", "my-div-id", settings);
await chart.InvokeVoidAsync("setData", data);
```

-> There is an interop library in the INFICON.FT solution.

## API Reference

### `createLineChart(divId, settings?)`
Factory function that returns a `LineChartHandle` object.
- **`divId`**: ID of the container element.
- **`settings`**: (Optional) Configuration object for the chart.

### `LineChartHandle` Methods
- `setData(data)`: Load initial data (hides skeleton, animates in).
- `updateData(data)`: Smart delta update (transitions if data overlaps).
- `appendDataPoint(point)`: Add a single point and re-render.
- `updateSettings(settings)`: Live-update chart configuration.
- `setLineColor(color)`: Fast-path color change without full re-render.
- `destroy()`: Cleanup DOM and listeners.

## Development

- **Start Dev Server**: `npm run dev`
- **Build Library**: `npm run build:lib`
- **Pack NuGet**: `.\nuget.exe pack graphs.nuspec`

## TODO
- Support iterators (infinite C# IEnumerables)
- Support multiple lines
- Add more chart types