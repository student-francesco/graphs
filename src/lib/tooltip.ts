import type { TooltipContent } from './types.ts'

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)

/**
 * The tooltip popup: a fixed div on document.body, themed, edge-aware. Chart-
 * agnostic — it renders pre-formatted content (title / label / value, optional
 * colour swatch) supplied by whichever hover target the pointer is over.
 */
export class TooltipController {
  private readonly el: HTMLDivElement

  constructor(theme: 'light' | 'dark') {
    this.el = document.createElement('div')
    this.el.setAttribute('role', 'tooltip')
    this.el.setAttribute('aria-live', 'polite')
    Object.assign(this.el.style, {
      position: 'fixed',
      pointerEvents: 'none',
      opacity: '0',
      transition: 'opacity 0.15s',
      background: theme === 'dark'
        ? 'rgba(245,243,238,0.95)'
        : 'rgba(17,24,39,0.9)',
      color: theme === 'dark' ? '#1a1815' : '#f9fafb',
      padding: '6px 10px',
      borderRadius: '6px',
      fontSize: '13px',
      lineHeight: '1.4',
      whiteSpace: 'nowrap',
      zIndex: '9999',
    })
    document.body.appendChild(this.el)
  }

  show(event: MouseEvent, content: TooltipContent): void {
    const titlePart = content.title
      ? `<div style="font-size:11px;opacity:0.75;margin-bottom:2px">${escapeHtml(content.title)}</div>`
      : ''
    const swatch = content.color
      ? `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px;background:${escapeHtml(content.color)}"></span>`
      : ''
    const labelPart = content.label !== undefined || swatch
      ? `<div style="font-size:11px;opacity:0.75">${swatch}${escapeHtml(content.label ?? '')}</div>`
      : ''
    this.el.innerHTML =
      titlePart + labelPart + `<div style="font-weight:600">${escapeHtml(content.value)}</div>`
    this.el.style.opacity = '1'
    this.position(event)
  }

  move(event: MouseEvent): void {
    this.position(event)
  }

  hide(): void {
    this.el.style.opacity = '0'
  }

  destroy(): void {
    this.el.remove()
  }

  private position(event: MouseEvent): void {
    const padding = 12
    const rect = this.el.getBoundingClientRect()
    let x = event.clientX + padding
    let y = event.clientY - rect.height / 2

    if (x + rect.width > window.innerWidth) x = event.clientX - rect.width - padding
    if (y < 0) y = 0
    if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height

    this.el.style.left = `${x}px`
    this.el.style.top = `${y}px`
  }
}
