import { type ChartModule } from '../engine/index.ts'
import { buildPdf } from '../pdf.ts'
import { ContainerSize, D3Ctx } from './tokens.ts'

/**
 * PDF export: clones both svgs into one document, rasterizes to JPEG via a
 * canvas, wraps the bytes in a single-page PDF, and triggers a download.
 * Pure API module — no pipeline participation.
 */
export function exportModule(): ChartModule {
  return {
    id: 'export',

    api(rt) {
      return {
        saveToPdf: async (filename = 'chart'): Promise<void> => {
          const ctx = rt.store(D3Ctx).get()
          const { width, height } = rt.store(ContainerSize).get()

          // 1. Clone and compose both SVGs into one for export
          const mainSvg = ctx.svg.node()!
          const overlaySvg = ctx.overlaySvg.node()

          const mainClone = mainSvg.cloneNode(true) as SVGSVGElement
          if (overlaySvg) {
            const overlayClone = overlaySvg.cloneNode(true) as SVGSVGElement
            const overlayG = document.createElementNS('http://www.w3.org/2000/svg', 'g')
            while (overlayClone.firstChild) overlayG.appendChild(overlayClone.firstChild)
            mainClone.appendChild(overlayG)
          }

          // Fix currentColor → resolved color so the canvas render looks correct
          const containerColor = getComputedStyle(ctx.container).color || '#374151'
          const svgStr = new XMLSerializer()
            .serializeToString(mainClone)
            .replace(/currentColor/g, containerColor)

          // 2. Rasterize SVG → canvas → JPEG
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const canvasCtx = canvas.getContext('2d')!
          canvasCtx.fillStyle = '#ffffff'
          canvasCtx.fillRect(0, 0, width, height)

          const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
          const url = URL.createObjectURL(blob)
          await new Promise<void>((resolve, reject) => {
            const img = new Image()
            img.onload = () => {
              canvasCtx.drawImage(img, 0, 0)
              URL.revokeObjectURL(url)
              resolve()
            }
            img.onerror = e => {
              URL.revokeObjectURL(url)
              reject(e instanceof Error ? e : new Error(String(e)))
            }
            img.src = url
          })

          // 3. JPEG bytes
          const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.95)
          const jpegBase64 = jpegDataUrl.slice('data:image/jpeg;base64,'.length)
          const jpegBinary = atob(jpegBase64)
          const jpegBytes = new Uint8Array(jpegBinary.length)
          for (let i = 0; i < jpegBinary.length; i++) jpegBytes[i] = jpegBinary.charCodeAt(i)

          // 4. Build PDF (pixels → points: 1px ≈ 0.75pt at 96 DPI)
          const pdfBytes = buildPdf(jpegBytes, Math.round(width * 0.75), Math.round(height * 0.75))

          // 5. Trigger download (copy into a fresh ArrayBuffer for BlobPart typing)
          const pdfBuffer = new ArrayBuffer(pdfBytes.byteLength)
          new Uint8Array(pdfBuffer).set(pdfBytes)
          const pdfBlob = new Blob([pdfBuffer], { type: 'application/pdf' })
          const a = document.createElement('a')
          a.href = URL.createObjectURL(pdfBlob)
          a.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          URL.revokeObjectURL(a.href)
        },
      }
    },
  }
}
