import { prepareStep, storeSpec, token, type ChartModule, type Token } from '../engine/index.ts'
import { AXIS_WIDTH } from '../defaults.ts'
import type { AxisSettings, ChartMargins } from '../types.ts'
import {
  AxesDef,
  AxisLayouts,
  Layout,
  MarginRequests,
  Settings,
  type AxisDef,
  type AxisLayoutEntry,
} from './tokens.ts'

export const DEFAULT_AXIS_ID = 'default'

interface AxesStoreState {
  readonly axes: ReadonlyMap<string, AxisDef>
}

export const AxesStore: Token<AxesStoreState> = token('axes.store')

function defaultAxis(id: string): AxisDef {
  return {
    id,
    name: id,
    color: null,
    range: null,
    limits: null,
    scaleType: undefined,
    showGrid: undefined,
    gridColor: undefined,
    gridOpacity: undefined,
    yTickCount: undefined,
  }
}

interface DefsAndMargins {
  defs: readonly AxisDef[]
  marginRequest: Partial<ChartMargins>
}

const DefsAndMarginsTok = token<DefsAndMargins>('axes.defsAndMargins')

/**
 * Owns the axis data model (≥ 1 axis invariant) and the multi-axis API. Two
 * prepare steps at different graph depths: 'axes.reserve' contributes the
 * stacked-rail margin reservation from the raw store; 'axes.layout' consumes the
 * merged Layout to resolve per-axis positions and cascades. Cross-store effects
 * (series migration, annotation cascade-removal) go through named commands so no
 * sibling module is imported.
 */
export function axesStoreModule(): ChartModule {
  return {
    id: 'axes-store',

    stores: [
      storeSpec({
        token: AxesStore,
        init: (): AxesStoreState => ({
          axes: new Map([[DEFAULT_AXIS_ID, defaultAxis(DEFAULT_AXIS_ID)]]),
        }),
      }),
    ],

    prepare: [
      prepareStep({
        id: 'axes.reserve',
        reads: { store: AxesStore },
        provides: DefsAndMarginsTok,
        contributes: [{ to: MarginRequests, select: out => out.marginRequest }],
        run: ({ store }): DefsAndMargins => {
          const defs = Array.from(store.axes.values())
          const count = defs.length
          const marginRequest: Partial<ChartMargins> =
            count <= 1
              ? {}
              : count === 2
                ? { right: AXIS_WIDTH }
                : { left: (count - 1) * AXIS_WIDTH }
          return { defs, marginRequest }
        },
      }),
      prepareStep({
        id: 'axes.defs',
        reads: { dm: DefsAndMarginsTok },
        provides: AxesDef,
        run: ({ dm }) => dm.defs,
      }),
      prepareStep({
        id: 'axes.layout',
        reads: { defs: AxesDef, settings: Settings, layout: Layout },
        provides: AxisLayouts,
        run: ({ defs, settings, layout }): readonly AxisLayoutEntry[] => {
          const resolve = (
            a: AxisDef,
            position: 'left' | 'right',
            offsetX: number,
          ): AxisLayoutEntry => ({
            id: a.id,
            name: a.name,
            color: a.color,
            position,
            offsetX,
            scaleType: a.scaleType ?? settings.yScaleType,
            showGrid: a.showGrid ?? settings.showGrid,
            gridColor: a.gridColor ?? settings.gridColor,
            gridOpacity: a.gridOpacity ?? settings.gridOpacity,
            yTickCount: a.yTickCount !== undefined ? a.yTickCount : settings.yTickCount,
            range: a.range,
            limits: a.limits,
          })
          if (defs.length === 1) return [resolve(defs[0]!, 'left', 0)]
          if (defs.length === 2) {
            return [
              resolve(defs[0]!, 'left', 0),
              resolve(defs[1]!, 'right', layout.innerWidth),
            ]
          }
          // 3+ axes: all left; first innermost at 0, then -AXIS_WIDTH, -2·AXIS_WIDTH, …
          return defs.map((a, i) => resolve(a, 'left', -i * AXIS_WIDTH))
        },
      }),
    ],

    mount(rt) {
      const store = rt.store(AxesStore)
      rt.provideCommand('axes.resolveId', (requested: string) => {
        const axes = store.get().axes
        return axes.has(requested) ? requested : axes.keys().next().value
      })
    },

    api(rt) {
      const store = rt.store(AxesStore)

      const mutate = (fn: (axes: Map<string, AxisDef>) => void): void => {
        const axes = new Map(store.get().axes)
        fn(axes)
        store.set({ axes })
        rt.flushSync()
      }

      const applySparse = (base: AxisDef, options: AxisSettings): AxisDef => {
        const next = { ...base } as {
          -readonly [K in keyof AxisDef]: AxisDef[K]
        }
        if ('name' in options && options.name !== undefined) next.name = options.name
        if ('color' in options) next.color = options.color ?? null
        if ('range' in options) next.range = options.range ?? null
        if ('limits' in options) next.limits = options.limits ?? null
        if ('scaleType' in options) next.scaleType = options.scaleType
        if ('showGrid' in options) next.showGrid = options.showGrid
        if ('gridColor' in options) next.gridColor = options.gridColor
        if ('gridOpacity' in options) next.gridOpacity = options.gridOpacity
        if ('yTickCount' in options) next.yTickCount = options.yTickCount
        return next
      }

      return {
        createAxis: (name: string, options?: AxisSettings): void => {
          mutate(axes => {
            const existing = axes.get(name)
            if (existing) {
              if (options) axes.set(name, applySparse(existing, options))
              return
            }
            axes.set(name, {
              id: name,
              name: options?.name ?? name,
              color: options?.color ?? null,
              range: options?.range ?? null,
              limits: options?.limits ?? null,
              scaleType: options?.scaleType,
              showGrid: options?.showGrid,
              gridColor: options?.gridColor,
              gridOpacity: options?.gridOpacity,
              yTickCount: options?.yTickCount,
            })
          })
        },

        removeAxis: (name: string): void => {
          const axes = store.get().axes
          if (!axes.has(name)) return
          // Must guarantee one axis remains.
          if (axes.size <= 1) return
          mutate(map => {
            map.delete(name)
            const fallback = map.keys().next().value as string
            // Orphaned series migrate; bound horizontal annotations are dropped.
            rt.command('series.migrateAxis', name, fallback)
            rt.command('annotations.dropAxis', name)
          })
        },

        associateSeries: (seriesName: string, axisName: string): void => {
          if (!store.get().axes.has(axisName)) {
            console.warn(`LineChart: associateSeries — unknown axis "${axisName}"`)
            return
          }
          rt.command('series.associate', seriesName, axisName)
          rt.flushSync()
        },

        updateAxisSettings: (id: string, settings: Partial<AxisSettings>): void => {
          const existing = store.get().axes.get(id)
          if (!existing) return
          mutate(axes => {
            axes.set(id, applySparse(existing, settings))
          })
        },
      }
    },

    state(rt) {
      const store = rt.store(AxesStore)
      return {
        key: 'axes',
        capture: () => Array.from(store.get().axes.values()).map(a => ({ ...a })),
        restore: value => {
          const axes = new Map<string, AxisDef>()
          for (const raw of (value as AxisDef[]) ?? []) {
            axes.set(raw.id, { ...raw })
          }
          // Chart invariant: at least one axis must exist.
          if (axes.size === 0) {
            axes.set(DEFAULT_AXIS_ID, defaultAxis(DEFAULT_AXIS_ID))
          }
          store.set({ axes })
        },
      }
    },
  }
}
