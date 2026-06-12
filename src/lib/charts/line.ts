import type { ChartSettings, LineChartHandle } from '../types.ts'

/**
 * Module-engine line chart (v2). Built out module by module alongside the
 * monolith (strangler migration); becomes the implementation behind
 * createLineChart at full parity.
 */
export function createLineChartV2(
  divId: string,
  settings?: Partial<ChartSettings>,
): LineChartHandle {
  void divId
  void settings
  throw new Error('createLineChartV2: no modules implemented yet — coming in the next step')
}
