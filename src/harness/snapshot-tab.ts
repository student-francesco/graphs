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
      `getSnapshot() — ${snap.series.length} series, ${snap.axes.length} axes, ` +
        `${snap.annotations.length} annotations`,
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
        `restoreSnapshot(…) — ${snap.series?.length ?? 0} series, ${snap.axes?.length ?? 0} axes, ` +
          `${snap.annotations?.length ?? 0} annotations`,
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
