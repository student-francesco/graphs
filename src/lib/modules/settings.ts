import { renderStep, type ChartModule } from '@/lib/engine/index.ts'
import { DEFAULT_SETTINGS } from '@/lib/defaults.ts'
import type { ChartSettings } from '@/lib/types.ts'
import { D3Ctx, Settings } from './tokens.ts'

/**
 * Owns the settings store: contributes the chart-wide defaults and the
 * updateSettings API, and keeps root-element attributes (theme dataset,
 * aria-label) in sync. Feature-specific reactions to settings changes (tooltip
 * rebuild, zoom extent sync, …) live in the modules that own those features.
 *
 * Note: every chart-wide default currently ships from here; modules that own
 * settings keys also declare them (identical values) so ownership is visible at
 * the module site. The duplication disappears when the monolith is deleted and
 * the completeness assertion lands.
 */
export function settingsModule(): ChartModule {
  return {
    id: 'settings',
    defaults: { ...DEFAULT_SETTINGS },

    render: [
      renderStep({
        id: 'settings.root',
        reads: { settings: Settings, ctx: D3Ctx },
        phase: 'pre',
        order: -200,
        run: ({ settings, ctx }) => {
          ctx.svg.node()!.dataset.theme = settings.theme
          ctx.svg.attr('aria-label', settings.ariaLabel)
        },
      }),
    ],

    api(rt) {
      const settings = rt.store(Settings)
      return {
        updateSettings: (partial: Partial<ChartSettings>): void => {
          settings.update(current => ({ ...current, ...partial }))
          rt.flushSync()
        },
      }
    },

    state(rt) {
      const settings = rt.store(Settings)
      return {
        key: 'settings',
        capture: () => {
          // Function-valued fields cannot survive JSON.
          const { xAxisFormatter: _xf, yAxisFormatter: _yf, ...serializable } = settings.get()
          return serializable
        },
        restore: value => {
          settings.update(current => ({
            ...current,
            ...(value as Partial<ChartSettings>),
            // Formatters aren't carried in snapshots — keep the live ones.
            xAxisFormatter: current.xAxisFormatter,
            yAxisFormatter: current.yAxisFormatter,
          }))
        },
      }
    },
  }
}
