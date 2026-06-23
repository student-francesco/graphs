import * as d3 from 'd3'
import type { InternalDataPoint, ChartSettings } from './types.ts'

export class TooltipController {
  private readonly el: HTMLDivElement
  private readonly dateFormat: (date: Date) => string
  private readonly valueFormat: (value: number) => string

  constructor(settings: ChartSettings) {
    this.dateFormat = d3.timeFormat(settings.tooltipDateFormat)
    this.valueFormat = d3.format(settings.tooltipValueFormat)

    this.el = document.createElement('div')
    this.el.setAttribute('role', 'tooltip')
    this.el.setAttribute('aria-live', 'polite')
    Object.assign(this.el.style, {
      position: 'fixed',
      pointerEvents: 'none',
      opacity: '0',
      transition: 'opacity 0.15s',
      background: settings.theme === 'dark'
        ? 'rgba(245,243,238,0.95)'
        : 'rgba(17,24,39,0.9)',
      color: settings.theme === 'dark' ? '#1a1815' : '#f9fafb',
      padding: '6px 10px',
      borderRadius: '6px',
      fontSize: '13px',
      lineHeight: '1.4',
      whiteSpace: 'nowrap',
      zIndex: '9999',
    })
    document.body.appendChild(this.el)
  }

  show(event: MouseEvent, point: InternalDataPoint, seriesName?: string): void {
    const namePart = seriesName
      ? `<div style="font-size:11px;opacity:0.75;margin-bottom:2px">${seriesName}</div>`
      : ''
    // x is polymorphic (Date | number); the date formatter needs a Date.
    this.el.innerHTML =
      namePart +
      `<div style="font-size:11px;opacity:0.75">${typeof point.x === 'number' ? this.valueFormat(point.x) : this.dateFormat(point.x)}</div>` +
      `<div style="font-weight:600">${this.valueFormat(point.y)}</div>`
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
