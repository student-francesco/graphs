import { renderStep, type ChartModule } from '@/lib/engine/index.ts'
import { TooltipController } from '@/lib/tooltip.ts'
import { BaseSettings, HoverTargets, type HoverTarget } from './tokens.ts'

/**
 * Tooltip + invisible hover zones, chart-agnostic. Geometry modules contribute
 * their hit targets to HoverTargets (line: a circle per raw point via the
 * hover-points module; pie: an arc path per slice); this module renders one
 * transparent zone per target and shows the target's content on hover. The
 * controller div lives on document.body and is rebuilt when the theme changes.
 */
export function tooltipModule(): ChartModule {
  let controller: TooltipController | null = null
  let controllerTheme = ''

  return {
    id: 'tooltip',
    defaults: { showTooltip: true },

    render: [
      renderStep({
        id: 'tooltip.zones',
        reads: { targets: HoverTargets, settings: BaseSettings },
        layer: { name: 'hover', z: 80, host: 'scroll' },
        run: ({ targets, settings }, ctx) => {
          const layer = ctx.layer!.classed('lc-hover-zones', true)
          const all: HoverTarget[] = targets.flat()

          const active = settings.showTooltip && all.length > 0
          if (!active) {
            controller?.destroy()
            controller = null
            layer.selectAll('.lc-hover-zone').remove()
            return
          }

          // Rebuild the controller when its theme changes.
          if (controller === null || controllerTheme !== settings.theme) {
            controller?.destroy()
            controller = new TooltipController(settings.theme)
            controllerTheme = settings.theme
          }

          const zones = layer
            .selectAll<SVGElement, HoverTarget>('.lc-hover-zone')
            .data(all, d => d.key)

          zones
            .enter()
            .append<SVGElement>(d => document.createElementNS('http://www.w3.org/2000/svg', tagFor(d)))
            .attr('class', 'lc-hover-zone')
            .attr('fill', 'transparent')
            .attr('stroke', 'none')
            .attr('cursor', 'crosshair')
            .merge(zones)
            .each(function (d) {
              const el = this as SVGElement
              const s = d.shape
              if (s.kind === 'circle') {
                el.setAttribute('r', String(s.r))
                el.setAttribute('cx', String(s.cx))
                el.setAttribute('cy', String(s.cy))
              } else {
                el.setAttribute('d', s.d)
                if (s.transform) el.setAttribute('transform', s.transform)
                else el.removeAttribute('transform')
              }
            })
            .on('mouseenter', (event: MouseEvent, d: HoverTarget) => {
              controller?.show(event, d.content())
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

/** A target's key never changes shape kind (line → circles, pie → paths). */
const tagFor = (t: HoverTarget): 'circle' | 'path' => (t.shape.kind === 'circle' ? 'circle' : 'path')
