import type { AnySnapshot, BaseHarness } from './state.ts'

/** Chart-specific hooks: how to summarize a snapshot, what to sync after restore, how to wipe. */
export interface SnapshotTabHooks {
  summarize(snap: AnySnapshot): string
  afterRestore?(): void
  /** Clears the chart; returns the log line. */
  wipe(): string
}

/** Snapshot tab: capture / restore the full chart state as JSON. */
export function initSnapshotTab(h: BaseHarness, hooks: SnapshotTabHooks): void {
  const { chart, setLog } = h
  const snapshotJson = document.getElementById('snapshot-json') as HTMLTextAreaElement

  document.getElementById('btn-snapshot-capture')!.addEventListener('click', () => {
    const snap = chart.getSnapshot()
    snapshotJson.value = JSON.stringify(snap, null, 2)
    setLog(`getSnapshot() — v${snap.version}: ${hooks.summarize(snap)}`)
  })

  document.getElementById('btn-snapshot-restore')!.addEventListener('click', () => {
    const raw = snapshotJson.value.trim()
    if (!raw) {
      setLog('Snapshot: textarea is empty — click Capture first or paste JSON')
      return
    }
    try {
      const snap = JSON.parse(raw) as AnySnapshot
      chart.restoreSnapshot(snap)
      hooks.afterRestore?.()
      setLog(`restoreSnapshot(…) — ${hooks.summarize(snap)}`)
    } catch (e) {
      setLog(`Snapshot: ${(e as Error).message}`)
    }
  })

  document.getElementById('btn-snapshot-wipe')!.addEventListener('click', () => {
    setLog(hooks.wipe())
  })
}
