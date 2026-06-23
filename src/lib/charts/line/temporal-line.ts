import { ChartEngine, type ChartModule } from '@/lib/engine/index.ts'
import { animationModule } from '@/lib/modules/animation.ts'
import { annotationsModule } from '@/lib/modules/annotations.ts'
import { axesRenderModule } from '@/lib/modules/axes-render.ts'
import { axesStoreModule } from '@/lib/modules/axes-store.ts'
import { contextModule } from '@/lib/modules/context.ts'
import { decimationModule } from '@/lib/modules/decimation.ts'
import { dotsModule } from '@/lib/modules/dots.ts'
import { exportModule } from '@/lib/modules/export.ts'
import { geometryLineModule } from '@/lib/modules/geometry-line.ts'
import { gridModule } from '@/lib/modules/grid.ts'
import { labelsModule } from '@/lib/modules/labels.ts'
import { scalesModule } from '@/lib/modules/scales.ts'
import { seriesModule } from '@/lib/modules/series.ts'
import { settingsModule } from '@/lib/modules/settings.ts'
import { skeletonModule } from '@/lib/modules/skeleton.ts'
import { smoothingModule } from '@/lib/modules/smoothing.ts'
import { snapshotModule } from '@/lib/modules/snapshot.ts'
import { KNOWN_PROVIDERS } from '@/lib/modules/tokens.ts'
import { tooltipModule } from '@/lib/modules/tooltip.ts'
import { valueLabelsModule } from '@/lib/modules/value-labels.ts'
import { zoomModule } from '@/lib/modules/zoom.ts'
import type { ChartSettings } from '@/lib/types.ts'
import type { LineChartHandle } from './types.ts'
import { temporalAdapter } from '@/lib/adapter.ts'

/**
 * Module list for the line chart — the only place a feature is registered.
 * Ordering rules: the context module must stay first (it realizes the layer
 * tree); the series host must precede the geometry modules (shared 'series'
 * layer — registration order is element order inside each series group:
 * line under dots under labels).
 *
 * Build-out status (strangler migration): annotations, tooltip, zoom, export,
 * snapshot and the transition scroll choreography land in the next steps.
 */
export function LINE_MODULES(container: HTMLElement): ChartModule[] {
  return [
    contextModule(container),
    settingsModule(),
    axesStoreModule(),
    seriesModule(temporalAdapter({
      parse: (raw) => {
        const d = new Date(raw.date)
        if (isNaN(d.getTime())) throw new Error(`LineChart: invalid date "${raw.date}"`)
        return { x: d, y: raw.value }
      },
      dump: (p) => ({
        date: (p.x as Date).toISOString(),
        value: p.y
      })
    })),
    smoothingModule(),
    decimationModule(),
    animationModule(),
    scalesModule(),
    gridModule(),
    axesRenderModule(),
    geometryLineModule(),
    dotsModule(),
    valueLabelsModule(),
    annotationsModule(),
    tooltipModule(),
    exportModule(),
    zoomModule(),
    snapshotModule(),
    skeletonModule(),
    labelsModule(),
  ]
}

/**
 * Factory for Blazor JS interop — assembles the line chart from its module list
 * and returns the handle with own-property bound methods (unambiguous
 * IJSObjectReference compatibility).
 *
 * Blazor usage:
 *   var module = await JS.InvokeAsync<IJSObjectReference>("import", "./graphs.es.js");
 *   var chart  = await module.InvokeAsync<IJSObjectReference>("createLineChart", divId, settings);
 *   await chart.InvokeVoidAsync("setData", data);
 */
export function createLineChart(
  divId: string,
  settings?: Partial<ChartSettings>,
): LineChartHandle {
  const container = document.getElementById(divId)
  if (container === null) throw new Error(`LineChart: no element with id "${divId}"`)
  const engine = new ChartEngine(LINE_MODULES(container), {
    settings,
    knownProviders: KNOWN_PROVIDERS,
  })
  return engine.buildApi() as unknown as LineChartHandle
}
