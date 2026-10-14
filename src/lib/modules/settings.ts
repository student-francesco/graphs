import { renderStep, type ChartModule } from '@/lib/engine/index.ts'
import { DEFAULT_SETTINGS } from '@/lib/defaults.ts'
import { BaseSettings, D3Ctx } from './tokens.ts'

export interface SettingsModuleOptions {
  /** The chart's complete defaults (default: the line chart's DEFAULT_SETTINGS). */
  readonly defaults?: object
  /**
   * Keys that cannot survive JSON (function / .NET delegate formatters): dropped
   * from snapshots, and kept at their live value on restore. Default: the line
   * chart's two axis formatters.
   */
  readonly transient?: readonly string[]
}

/**
 * Owns the settings store: contributes the chart-wide defaults and the
 * updateSettings API, and keeps root-element attributes (theme dataset,
 * aria-label) in sync. Feature-specific reactions to settings changes (tooltip
 * rebuild, zoom extent sync, …) live in the modules that own those features.
 * Chart-agnostic: each chart passes its own complete defaults.
 *
 * Note: every chart-wide default currently ships from here; modules that own
 * settings keys also declare them (identical values) so ownership is visible at
 * the module site. The duplication disappears when the monolith is deleted and
 * the completeness assertion lands.
 */
export function settingsModule(opts: SettingsModuleOptions = {}): ChartModule {
  const defaults = opts.defaults ?? DEFAULT_SETTINGS
  const transient = opts.transient ?? ['xAxisFormatter', 'yAxisFormatter']

  return {
    id: 'settings',
    defaults: { ...(defaults as Record<string, unknown>) },

    render: [
      renderStep({
        id: 'settings.root',
        reads: { settings: BaseSettings, ctx: D3Ctx },
        phase: 'pre',
        order: -200,
        run: ({ settings, ctx }) => {
          ctx.svg.node()!.dataset.theme = settings.theme
          ctx.svg.attr('aria-label', settings.ariaLabel)
        },
      }),
    ],

    api(rt) {
      const settings = rt.store(BaseSettings)
      return {
        updateSettings: (partial: Record<string, unknown>): void => {
          settings.update(current => ({ ...current, ...partial }))
          rt.flushSync()
        },
      }
    },

    state(rt) {
      const settings = rt.store(BaseSettings)
      return {
        key: 'settings',
        capture: () => {
          // Function-valued fields cannot survive JSON.
          const serializable: Record<string, unknown> = { ...settings.get() }
          for (const key of transient) delete serializable[key]
          return serializable
        },
        restore: value => {
          settings.update(current => {
            const next: Record<string, unknown> = { ...current, ...(value as object) }
            // Transient fields aren't carried in snapshots — keep the live ones.
            for (const key of transient) next[key] = (current as unknown as Record<string, unknown>)[key]
            return next as unknown as typeof current
          })
        },
      }
    },
  }
}
