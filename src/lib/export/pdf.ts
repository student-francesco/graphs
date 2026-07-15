import html2canvas from 'html2canvas'
import { buildPdf } from '../pdf.ts'
import type { ExportProps } from '.'
import { LOGO_DARK, LOGO_LIGHT } from './assets.ts'

// A4 landscape, in points (matches the MediaBox buildPdf produces: 1pt == 1 CSS px here).
const PAGE_WIDTH = 841.89
const PAGE_HEIGHT = 595.28

// html2canvas's own `scale` option controls source resolution independently of the page's
// display size in points, so the exported image stays crisp at print size rather than
// matching the 1:1 pixel density of the on-screen DOM it was captured from.
const RENDER_SCALE = 3

// Loaded once per page; @font-face-only (no <link>) keeps this self-contained to this module
// rather than depending on the consuming page's own <head>.
const FONT_CSS = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
`

// Chart-to-page proportions lifted from the Claude Design proposal (Chart Export Page.dc.html:
// 1100x850 document, 1020x430 chart), reapplied to the current page size. Width isn't capped
// explicitly — the flex column's own padding already leaves less room than this ratio would.
const CHART_MAX_HEIGHT = (430 / 850) * PAGE_HEIGHT

const THEME = {
    light: { pageBg: '#ffffff', text: '#1a1a20', sub: '#65656f', muted: '#7a7a84', hairline: '#e8e8e8', logo: LOGO_LIGHT },
    dark: { pageBg: '#17171c', text: '#ececf0', sub: '#9a9aa6', muted: '#8a8a96', hairline: '#2e2e33', logo: LOGO_DARK },
} as const

let fontStyleInjected = false
function ensureFontStyleInjected() {
    if (fontStyleInjected) return
    fontStyleInjected = true
    const style = document.createElement('style')
    style.textContent = FONT_CSS
    document.head.appendChild(style)
}

function escapeHtml(value: string): string {
    const div = document.createElement('div')
    div.textContent = value
    return div.innerHTML
}

function buildDocumentElement(props: ExportProps): HTMLDivElement {
    const C = THEME[props.theme === 'dark' ? 'dark' : 'light']

    const root = document.createElement('div')
    root.style.cssText = `
        position: fixed; left: -10000px; top: 0;
        width: ${PAGE_WIDTH}px; height: ${PAGE_HEIGHT}px;
        display: flex; flex-direction: column;
        background: ${C.pageBg}; color: ${C.text};
        font-family: 'IBM Plex Sans', system-ui, sans-serif;
        box-sizing: border-box;
    `

    root.innerHTML = `
        <header style="flex: 0 0 auto; height: 52px; display: flex; align-items: center; padding: 0 40px; border-bottom: 1px solid ${C.hairline}; box-sizing: border-box;">
            <img src="${C.logo}" style="height: 20px; width: auto; display: block;" />
        </header>
        <main style="flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0 32px; box-sizing: border-box;">
            <div style="display: flex; flex-direction: column; align-items: center; transform: translateY(-8px);">
                <div style="font-weight: 700; font-size: 18px; letter-spacing: -0.1px; text-align: center; margin: 0 0 3px;">${escapeHtml(props.title ?? '')}</div>
                <div style="font-weight: 500; font-size: 10px; text-align: center; color: ${C.sub}; margin: 0 0 16px;">${escapeHtml(props.subtitle ?? '')}</div>
            </div>
            <img src="${props.chartImgData}" style="width: auto; height: auto; max-width: 100%; max-height: ${CHART_MAX_HEIGHT}px; display: block;" />
        </main>
        <footer style="flex: 0 0 auto; display: flex; justify-content: space-between; align-items: center; padding: 12px 40px 16px; border-top: 1px solid ${C.hairline}; box-sizing: border-box;">
            <div style="font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 8px; color: ${C.muted};">${escapeHtml(props.footerLeft ?? '')}</div>
            <div style="font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 7.5px; color: ${C.muted};">${escapeHtml(props.footerRight ?? '')}</div>
        </footer>
    `
    return root
}

function canvasToJpegBytes(canvas: HTMLCanvasElement, quality = 0.95): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
            if (!blob) { reject(new Error('Failed to encode the export canvas as JPEG')); return }
            blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf))).catch(reject)
        }, 'image/jpeg', quality)
    })
}

export default async function renderPdf(props: ExportProps): Promise<Blob> {
    ensureFontStyleInjected()
    try {
        await document.fonts?.ready
    } catch {
        // Best-effort — proceed with whatever fonts are available if the wait itself fails.
    }

    const root = buildDocumentElement(props)
    document.body.appendChild(root)
    try {
        const canvas = await html2canvas(root, {
            scale: RENDER_SCALE,
            useCORS: true,
            width: PAGE_WIDTH,
            height: PAGE_HEIGHT,
        })
        const jpegBytes = await canvasToJpegBytes(canvas)
        const pdfBytes = buildPdf(jpegBytes, PAGE_WIDTH, PAGE_HEIGHT)
        // .slice() always yields a plain ArrayBuffer (never SharedArrayBuffer), which is what
        // BlobPart requires — pdfBytes itself is typed over the broader ArrayBufferLike.
        const pdfArrayBuffer = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer
        return new Blob([pdfArrayBuffer], { type: 'application/pdf' })
    } finally {
        document.body.removeChild(root)
    }
}
