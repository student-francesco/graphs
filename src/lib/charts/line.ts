import { ChartEngine, type ChartModule } from '../engine/index.ts'
import { contextModule } from '../modules/context.ts'
import { labelsModule } from '../modules/labels.ts'
import { seriesModule } from '../modules/series.ts'
import { settingsModule } from '../modules/settings.ts'
import { skeletonModule } from '../modules/skeleton.ts'
import { KNOWN_PROVIDERS } from '../modules/tokens.ts'
import type { ChartSettings, LineChartHandle } from '../types.ts'

/**
 * Module list for the line chart — the only place a feature is registered.
 * Build-out status (strangler migration): context/settings/series-data/skeleton/
 * labels are live; geometry, axes, scales, annotations, tooltip, zoom, export,
 * snapshot and animation land step by step. The context module must stay first.
 */
export function LINE_MODULES(container: HTMLElement): ChartModule[] {
  return [
    contextModule(container),
    settingsModule(),
    seriesModule(),
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
