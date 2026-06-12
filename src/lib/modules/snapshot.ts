import { type ChartModule } from '../engine/index.ts'

export interface ChartSnapshotV2 {
  version: 2
  modules: Record<string, unknown>
}

/**
 * Snapshot as a module: getSnapshot() walks the registry collecting every
 * module's declared state slice; restoreSnapshot() dispatches each slice back
 * in registration order (settings → axes → series → annotations → zoom — the
 * module list already encodes the dependency order), then runs one pass.
 *
 * Slices without a registered module are warned and skipped; modules absent
 * from a snapshot keep their current state. The same module drops into any
 * chart type and captures whatever that chart's modules declare.
 */
export function snapshotModule(): ChartModule {
  return {
    id: 'snapshot',

    api(rt) {
      return {
        getSnapshot: (): ChartSnapshotV2 => {
          const modules: Record<string, unknown> = {}
          for (const mod of rt.modules) {
            const slice = mod.state?.(rt)
            if (slice) modules[slice.key] = slice.capture()
          }
          return { version: 2, modules }
        },

        restoreSnapshot: (snapshot: ChartSnapshotV2): void => {
          if (snapshot?.version !== 2) {
            throw new Error(
              `LineChart: unsupported snapshot version ${String(
                (snapshot as { version?: unknown })?.version,
              )} — this build reads version 2 snapshots only`,
            )
          }
          const slices = { ...snapshot.modules }
          for (const mod of rt.modules) {
            const slice = mod.state?.(rt)
            if (!slice) continue
            if (slice.key in slices) {
              slice.restore(slices[slice.key])
              delete slices[slice.key]
            }
          }
          for (const orphan of Object.keys(slices)) {
            console.warn(`LineChart: snapshot slice "${orphan}" has no registered module — skipped`)
          }
          rt.requestRender({ kind: 'restore' })
          rt.flushSync()
        },
      }
    },
  }
}
