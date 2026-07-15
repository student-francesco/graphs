import { type ChartModule } from '@/lib/engine/index.ts'
import { ContainerSize, D3Ctx, Settings } from './tokens.ts'
import {renderExport} from '../export/index.ts'
import type { PdfExportOptions } from '../types.ts'

/**
 * PDF export: clones both svgs into one document, rasterizes to JPEG via a
 * canvas, wraps the bytes in a single-page PDF, and triggers a download.
 * Pure API module — no pipeline participation.
 */
// Rasterizing 1:1 with the on-screen container leaves the exported chart soft once it's
// scaled up to print/PDF size. Rendering the SVG into a larger canvas (same aspect ratio,
// more pixels) keeps it crisp — this is the resolution multiplier used for that.
const EXPORT_SCALE = 3

export function exportModule(): ChartModule {
  return {
    id: 'export',

    api(rt) {
      return {
        saveToPdf: async (filename = 'chart', options?: PdfExportOptions): Promise<void> => {
          const ctx = rt.store(D3Ctx).get()
          const { width, height } = rt.store(ContainerSize).get()
          const renderWidth = width * EXPORT_SCALE
          const renderHeight = height * EXPORT_SCALE

          // PDF-only axis label override: xLabel/yLabel in PdfExportOptions replace the
          // chart's current axis labels only when explicitly provided (leaving the other
          // axis alone otherwise), applied through the same Settings store updateSettings
          // writes to. Restored once the SVG has been rasterized so the live, on-screen
          // chart's labels are unaffected by the export.
          const settings = rt.store(Settings)
          const { xLabel: previousXLabel, yLabel: previousYLabel } = settings.get()
          const overridesXLabel = options?.xLabel !== undefined
          const overridesYLabel = options?.yLabel !== undefined

          let jpegDataUrl: string
          try {
            if (overridesXLabel || overridesYLabel) {
              settings.update(current => ({
                ...current,
                ...(overridesXLabel ? { xLabel: options!.xLabel! } : {}),
                ...(overridesYLabel ? { yLabel: options!.yLabel! } : {}),
              }))
              rt.flushSync()
            }

            // 1. Clone and compose both SVGs into one for export
            const mainSvg = ctx.svg.node()!
            const overlaySvg = ctx.overlaySvg.node()

            const mainClone = mainSvg.cloneNode(true) as SVGSVGElement

            // Replace dimensions with explicit (upscaled) values so the SVG rasterizes at
            // export resolution instead of being stretched up from its on-screen size.
            mainClone.setAttribute('width', String(renderWidth))
            mainClone.setAttribute('height', String(renderHeight))
            if (overlaySvg) {
              const overlayClone = overlaySvg.cloneNode(true) as SVGSVGElement
              const overlayG = document.createElementNS('http://www.w3.org/2000/svg', 'g')
              while (overlayClone.firstChild) overlayG.appendChild(overlayClone.firstChild)
              mainClone.appendChild(overlayG)
            }

            // Fix currentColor → resolved color
            const containerColor = getComputedStyle(ctx.container).color || '#374151'
            const svgStr = new XMLSerializer()
              .serializeToString(mainClone)
              .replace(/currentColor/g, containerColor)

            // 2. Rasterize SVG → canvas → JPEG
            const canvas = document.createElement('canvas')
            canvas.width = renderWidth
            canvas.height = renderHeight
            const canvasCtx = canvas.getContext('2d')!
            canvasCtx.fillStyle = '#ffffff'
            canvasCtx.fillRect(0, 0, renderWidth, renderHeight)

            const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
            const url = URL.createObjectURL(blob)
            await new Promise<void>((resolve, reject) => {
              const img = new Image()
              img.onload = () => {
                canvasCtx.drawImage(img, 0, 0, renderWidth, renderHeight)
                URL.revokeObjectURL(url)
                resolve()
              }
              img.onerror = e => {
                URL.revokeObjectURL(url)
                reject(e instanceof Error ? e : new Error(String(e)))
              }
              img.src = url
            })

            // 3. Render to JPEG
            jpegDataUrl = canvas.toDataURL('image/jpeg', 0.95)
          } finally {
            if (overridesXLabel || overridesYLabel) {
              settings.update(current => ({ ...current, xLabel: previousXLabel, yLabel: previousYLabel }))
              rt.flushSync()
            }
          }

          // 4. Render with html2canvas + buildPdf
          renderExport('pdf', {
            chartImgData: jpegDataUrl,
            ...(options ?? {})
          })
          .then(pdfBlob => {
            const a = document.createElement('a')
            a.href = URL.createObjectURL(pdfBlob)
            a.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(a.href)
          })
          .catch(err => console.error("Failed to render PDF", err))
        },
      }
    },
  }
}
