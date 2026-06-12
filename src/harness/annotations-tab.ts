import type { HorizontalAnnotationSettings, VerticalAnnotationSettings } from '../lib/index.ts'
import type { Harness } from './state.ts'

export interface AnnotationsTabApi {
  /** Refresh the axis dropdown — called after axis changes and snapshot restore. */
  syncAnnoAxisOptions(): void
}

/** Annotations tab: horizontal/vertical lines with styling, bound to axes. */
export function initAnnotationsTab(h: Harness): AnnotationsTabApi {
  const { chart, setLog } = h

  const annoName = document.getElementById('anno-name') as HTMLInputElement
  const annoType = document.getElementById('anno-type') as HTMLSelectElement
  const annoYInput = document.getElementById('anno-y') as HTMLInputElement
  const annoXInput = document.getElementById('anno-x') as HTMLInputElement
  const annoAxis = document.getElementById('anno-axis') as HTMLSelectElement
  const annoLabel = document.getElementById('anno-label') as HTMLInputElement
  const annoColor = document.getElementById('anno-color') as HTMLInputElement
  const annoThickness = document.getElementById('anno-thickness') as HTMLInputElement
  const annoDashed = document.getElementById('anno-dashed') as HTMLInputElement
  let annoCounter = 1

  function syncAnnoTypeVisibility(): void {
    const isHorizontal = annoType.value === 'horizontal'
    ;(annoYInput.parentElement as HTMLElement).style.display = isHorizontal ? '' : 'none'
    ;(annoXInput.parentElement as HTMLElement).style.display = isHorizontal ? 'none' : ''
    ;(annoAxis.parentElement as HTMLElement).style.display = isHorizontal ? '' : 'none'
  }

  function syncAnnoAxisOptions(): void {
    const current = annoAxis.value
    annoAxis.innerHTML = ''
    for (const id of h.axisRecords.keys()) {
      const opt = document.createElement('option')
      opt.value = id
      opt.textContent = id
      annoAxis.appendChild(opt)
    }
    if (h.axisRecords.has(current)) annoAxis.value = current
  }

  annoType.addEventListener('change', syncAnnoTypeVisibility)
  // Refresh the axis dropdown after any axis-tab action that could have added/removed axes.
  for (const btnId of ['btn-create-axis', 'btn-remove-axis']) {
    document.getElementById(btnId)!.addEventListener('click', () => setTimeout(syncAnnoAxisOptions, 0))
  }
  syncAnnoTypeVisibility()
  syncAnnoAxisOptions()

  document.getElementById('btn-anno-add')!.addEventListener('click', () => {
    const name = annoName.value.trim() || `anno-${annoCounter}`
    const label = annoLabel.value
    if (annoType.value === 'horizontal') {
      const y = parseFloat(annoYInput.value)
      if (isNaN(y)) {
        setLog('Annotation: Y value required for horizontal')
        return
      }
      const settings: HorizontalAnnotationSettings = {
        axis: annoAxis.value,
        color: annoColor.value,
        thickness: parseFloat(annoThickness.value) || 1.5,
        dashed: annoDashed.checked,
      }
      chart.setHorizontalLine(name, y, label, settings)
      setLog(`setHorizontalLine("${name}", ${y}, "${label}", ${JSON.stringify(settings)})`)
    } else {
      const x = annoXInput.value.trim()
      if (!x) {
        setLog('Annotation: X (ISO date) required for vertical')
        return
      }
      const settings: VerticalAnnotationSettings = {
        color: annoColor.value,
        thickness: parseFloat(annoThickness.value) || 1.5,
        dashed: annoDashed.checked,
      }
      chart.setVerticalLine(name, x, label, settings)
      setLog(`setVerticalLine("${name}", "${x}", "${label}", ${JSON.stringify(settings)})`)
    }
    annoCounter++
    annoName.value = `anno-${annoCounter}`
  })

  document.getElementById('btn-anno-remove')!.addEventListener('click', () => {
    const name = annoName.value.trim()
    if (!name) return
    chart.removeAnnotation(name)
    setLog(`removeAnnotation("${name}")`)
  })

  document.getElementById('btn-anno-clear')!.addEventListener('click', () => {
    chart.clearAnnotations()
    setLog('clearAnnotations()')
  })

  return { syncAnnoAxisOptions }
}
