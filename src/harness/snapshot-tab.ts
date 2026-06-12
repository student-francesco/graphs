import type { AnnotationsTabApi } from './annotations-tab.ts'
import type { Harness } from './state.ts'

/** Snapshot tab: capture / restore the full chart state as JSON. */
export function initSnapshotTab(h: Harness, annotations: AnnotationsTabApi): void {
  const { chart, setLog } = h
  const snapshotJson = document.getElementById('snapshot-json') as HTMLTextAreaElement

  document.getElementById('btn-snapshot-capture')!.addEventListener('click', () => {
    const snap = chart.getSnapshot()
    snapshotJson.value = JSON.stringify(snap, null, 2)
    setLog(
      `getSnapshot() — v${snap.version}: ${snap.modules.series.series.length} series, ` +
        `${snap.modules.axes.length} axes, ${snap.modules.annotations.length} annotations`,
    )
  })

  document.getElementById('btn-snapshot-restore')!.addEventListener('click', () => {
    const raw = snapshotJson.value.trim()
    if (!raw) {
      setLog('Snapshot: textarea is empty — click Capture first or paste JSON')
      return
    }
    try {
      const snap = JSON.parse(raw)
      chart.restoreSnapshot(snap)
      annotations.syncAnnoAxisOptions()
      setLog(
        `restoreSnapshot(…) — ${snap.modules?.series?.series?.length ?? 0} series, ` +
          `${snap.modules?.axes?.length ?? 0} axes, ` +
          `${snap.modules?.annotations?.length ?? 0} annotations`,
      )
    } catch (e) {
      setLog(`Snapshot: ${(e as Error).message}`)
    }
  })

  document.getElementById('btn-snapshot-wipe')!.addEventListener('click', () => {
    chart.clearAnnotations()
    chart.clearData()
    setLog('Wiped chart — clearAnnotations() + clearData(). Click Restore to rebuild.')
  })
}
