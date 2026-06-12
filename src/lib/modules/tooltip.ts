import { renderStep, type ChartModule } from '../engine/index.ts'
import { TooltipController } from '../tooltip.ts'
import type { DataPoint } from '../types.ts'
import { HasData, Scales, Settings, VisibleSeries } from './tokens.ts'

interface HoverDatum extends DataPoint {
  seriesId: string
  /** Precomputed pixel y — uses the series' own axis scale. */
  _y: number
}

/**
 * Tooltip + invisible hover zones. One hit circle per RAW data point per series
 * (each datum carries its own axis's pixel y, so multi-axis charts hit
 * accurately). The controller div lives on document.body and is rebuilt when
 * the theme or format settings change.
 */
export function tooltipModule(): ChartModule {
  let controller: TooltipController | null = null
  let controllerKey = ''

  return {
    id: 'tooltip',
    defaults: { showTooltip: true, tooltipDateFormat: '%b %d, %Y', tooltipValueFormat: '.2f' },

    render: [
      renderStep({
        id: 'tooltip.zones',
        reads: {
          visible: VisibleSeries,
          scales: Scales,
          settings: Settings,
          hasData: HasData,
        },
        layer: { name: 'hover', z: 80, host: 'scroll' },
        run: ({ visible, scales, settings, hasData }, ctx) => {
          const layer = ctx.layer!.classed('lc-hover-zones', true)

          const active = settings.showTooltip && hasData
          if (!active) {
            controller?.destroy()
            controller = null
            layer.selectAll('.lc-hover-zone').remove()
            return
          }

          // Rebuild the controller when its inputs change (theme, formats).
          const key = `${settings.theme}|${settings.tooltipDateFormat}|${settings.tooltipValueFormat}`
          if (controller === null || controllerKey !== key) {
            controller?.destroy()
            controller = new TooltipController(settings)
            controllerKey = key
          }

          const hitRadius = Math.max(
            Math.max(...Array.from(visible.values()).map(s => s.resolved.dotRadius)),
            8,
          )
          const multiSeries = visible.size > 1

          const allData: HoverDatum[] = []
          for (const s of visible.values()) {
            const yScale = scales.y.get(s.resolved.axisId) ?? scales.y.values().next().value!
            for (const d of s.raw) {
              allData.push({ ...d, seriesId: s.id, _y: yScale(d.value) })
            }
          }

          const zones = layer
            .selectAll<SVGCircleElement, HoverDatum>('.lc-hover-zone')
            .data(allData, d => `${d.date.getTime()}-${d.seriesId}`)

          zones
            .enter()
            .append('circle')
            .attr('class', 'lc-hover-zone')
            .attr('fill', 'transparent')
            .attr('stroke', 'none')
            .attr('cursor', 'crosshair')
            .merge(zones)
            .attr('r', hitRadius)
            .attr('cx', d => scales.x(d.date))
            .attr('cy', d => d._y)
            .on('mouseenter', (event: MouseEvent, d: HoverDatum) => {
              controller?.show(event, d, multiSeries ? d.seriesId : undefined)
            })
            .on('mousemove', (event: MouseEvent) => {
              controller?.move(event)
            })
            .on('mouseleave', () => {
              controller?.hide()
            })

          zones.exit().remove()
        },
      }),
    ],

    mount() {
      return () => {
        controller?.destroy()
        controller = null
      }
    },
  }
}
