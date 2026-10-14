import { ChartEngine, type ChartModule } from '@/lib/engine/index.ts'
import { DEFAULT_PIE_SETTINGS } from '@/lib/defaults.ts'
import { animationModule } from '@/lib/modules/animation.ts'
import { contextModule } from '@/lib/modules/context.ts'
import { exportModule } from '@/lib/modules/export.ts'
import { labelsModule } from '@/lib/modules/labels.ts'
import { pieDataModule } from '@/lib/modules/pie-data.ts'
import { pieLabelsModule } from '@/lib/modules/pie-labels.ts'
import { pieSlicesModule } from '@/lib/modules/pie-slices.ts'
import { settingsModule } from '@/lib/modules/settings.ts'
import { skeletonModule } from '@/lib/modules/skeleton.ts'
import { snapshotModule } from '@/lib/modules/snapshot.ts'
import { KNOWN_PROVIDERS } from '@/lib/modules/tokens.ts'
import { tooltipModule } from '@/lib/modules/tooltip.ts'
import type { PieChartSettings } from '@/lib/types.ts'
import type { PieChartHandle } from './types.ts'

/**
 * Module list for the pie chart. Everything chart-agnostic is shared with the
 * line chart (context, settings, animation clock, tooltip, export, snapshot,
 * skeleton, title labels); the pie adds its data, slice and slice-label modules.
 * The context module stays first (it realizes the layer tree); the pie never
 * scrolls, so the scroll chrome and the animation scroll steps are left out.
 */
export function PIE_MODULES(container: HTMLElement): ChartModule[] {
  return [
    contextModule(container, { scrollChrome: false }),
    settingsModule({ defaults: DEFAULT_PIE_SETTINGS, transient: [] }),
    pieDataModule(),
    animationModule({ scroll: false }),
    pieSlicesModule(),
    pieLabelsModule(),
    tooltipModule(),
    exportModule(),
    snapshotModule(),
    skeletonModule({ shape: 'radial' }),
    labelsModule(),
  ]
}

/**
 * Factory for Blazor JS interop — assembles the pie chart from its module list
 * and returns the handle with own-property bound methods.
 *
 * Blazor usage:
 *   var module = await JS.InvokeAsync<IJSObjectReference>("import", "./graphs.es.js");
 *   var chart  = await module.InvokeAsync<IJSObjectReference>("createPieChart", divId, settings);
 *   await chart.InvokeVoidAsync("setData", new[] { new { label = "A", value = 3 } });
 */
export function createPieChart(
  divId: string,
  settings?: Partial<PieChartSettings>,
): PieChartHandle {
  const container = document.getElementById(divId)
  if (container === null) throw new Error(`PieChart: no element with id "${divId}"`)
  const engine = new ChartEngine(PIE_MODULES(container), {
    settings,
    knownProviders: KNOWN_PROVIDERS,
    name: 'PieChart',
  })
  return engine.buildApi() as unknown as PieChartHandle
}
