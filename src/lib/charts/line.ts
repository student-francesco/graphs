import { ChartEngine, type ChartModule } from '../engine/index.ts'
import { animationModule } from '../modules/animation.ts'
import { axesRenderModule } from '../modules/axes-render.ts'
import { axesStoreModule } from '../modules/axes-store.ts'
import { contextModule } from '../modules/context.ts'
import { decimationModule } from '../modules/decimation.ts'
import { dotsModule } from '../modules/dots.ts'
import { geometryLineModule } from '../modules/geometry-line.ts'
import { gridModule } from '../modules/grid.ts'
import { labelsModule } from '../modules/labels.ts'
import { scalesModule } from '../modules/scales.ts'
import { seriesModule } from '../modules/series.ts'
import { settingsModule } from '../modules/settings.ts'
import { skeletonModule } from '../modules/skeleton.ts'
import { smoothingModule } from '../modules/smoothing.ts'
import { KNOWN_PROVIDERS } from '../modules/tokens.ts'
import { valueLabelsModule } from '../modules/value-labels.ts'
import type { ChartSettings, LineChartHandle } from '../types.ts'

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
    seriesModule(),
    smoothingModule(),
    decimationModule(),
    animationModule(),
    scalesModule(),
    gridModule(),
    axesRenderModule(),
    geometryLineModule(),
    dotsModule(),
    valueLabelsModule(),
    skeletonModule(),
    labelsModule(),
  ]
}

/**
 * Module-engine line chart (v2). Becomes the implementation behind
 * createLineChart at full parity. The handle cast is honest only for the
 * already-implemented surface — unimplemented methods are absent until their
 * modules land.
 */
export function createLineChartV2(
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
