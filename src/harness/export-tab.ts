import type { PdfExportOptions } from '@/lib/types.ts'
import type { Harness } from './state.ts'

/** Export tab: PDF filename, footer bands, PDF-only title/axis-title overrides. */
export function initExportTab(h: Harness): void {
  const { chart, setLog } = h

  const filenameInput = document.getElementById('pdf-filename') as HTMLInputElement
  const footerLeftInput = document.getElementById('pdf-footer-left') as HTMLInputElement
  const footerRightInput = document.getElementById('pdf-footer-right') as HTMLInputElement
  const titleInput = document.getElementById('pdf-title') as HTMLInputElement
  const titleCaptionInput = document.getElementById('pdf-title-caption') as HTMLInputElement
  const xLabelInput = document.getElementById('pdf-x-label') as HTMLInputElement
  const yLabelInput = document.getElementById('pdf-y-label') as HTMLInputElement

  if (!footerRightInput.value) {
    footerRightInput.value = new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
  }

  const orUndefined = (input: HTMLInputElement): string | undefined => input.value.trim() || undefined

  const readOptions = (): PdfExportOptions => ({
    footerLeft: orUndefined(footerLeftInput),
    footerRight: orUndefined(footerRightInput),
    title: titleInput.value.trim() === '' ? undefined : titleInput.value.trim(),
    subtitle: titleCaptionInput.value.trim() === '' ? undefined : titleCaptionInput.value.trim(),
    xLabel: xLabelInput.value.trim() === '' ? undefined : xLabelInput.value.trim(),
    yLabel: yLabelInput.value.trim() === '' ? undefined : yLabelInput.value.trim(),
  })

  document.getElementById('btn-export-pdf')!.addEventListener('click', () => {
    const filename = filenameInput.value.trim() || 'chart'
    const options = readOptions()
    chart.saveToPdf(filename, options)
    setLog(`saveToPdf(${JSON.stringify(filename)}, ${JSON.stringify(options)})`)
  })
}
