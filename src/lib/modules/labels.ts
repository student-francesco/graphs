import { prepareStep, renderStep, token, type ChartModule } from '@/lib/engine/index.ts'
import { TITLE_SPACE, X_LABEL_SPACE, Y_LABEL_SPACE } from '@/lib/defaults.ts'
import type { ChartMargins } from '@/lib/types.ts'
import { Layout, MarginRequests, Settings } from './tokens.ts'

interface LabelPlan {
  title: string | null
  xLabel: string | null
  yLabel: string | null
  marginRequest: Partial<ChartMargins>
}

interface Placed {
  text: string
  x: number
  y: number
  transform: string | null
}

interface LabelPositions {
  title: Placed | null
  xLabel: Placed | null
  yLabel: Placed | null
}

const LabelPlanTok = token<LabelPlan>('labels.plan')
const LabelPositions = token<LabelPositions>('labels.positions')

/**
 * Chart title + axis labels. The canonical contribute/consume example: the first
 * prepare step reads only settings and contributes a margin reservation; the
 * merged Layout (which folded that reservation in) is consumed by a second step
 * that positions the text. No cycle — the two steps sit at different graph depths.
 */
export function labelsModule(): ChartModule {
  return {
    id: 'labels',
    defaults: { title: null, xLabel: null, yLabel: null },

    prepare: [
      prepareStep({
        id: 'labels.measure',
        description: 'Read title and axis-label text and request the margins needed to fit them.',
        reads: { settings: Settings },
        provides: LabelPlanTok,
        contributes: [{ to: MarginRequests, select: plan => plan.marginRequest }],
        run: ({ settings }): LabelPlan => ({
          title: settings.title,
          xLabel: settings.xLabel,
          yLabel: settings.yLabel,
          marginRequest: {
            ...(settings.title ? { top: TITLE_SPACE } : {}),
            ...(settings.xLabel ? { bottom: X_LABEL_SPACE } : {}),
            ...(settings.yLabel ? { left: Y_LABEL_SPACE } : {}),
          },
        }),
      }),
      prepareStep({
        id: 'labels.position',
        description: 'Place the title and axis labels within the merged layout box.',
        reads: { plan: LabelPlanTok, layout: Layout },
        provides: LabelPositions,
        run: ({ plan, layout }): LabelPositions => {
          const m = layout.margins
          return {
            title: plan.title
              ? { text: plan.title, x: layout.innerWidth / 2, y: -(m.top / 2), transform: null }
              : null,
            xLabel: plan.xLabel
              ? {
                  text: plan.xLabel,
                  x: layout.innerWidth / 2,
                  y: layout.innerHeight + m.bottom - 6,
                  transform: null,
                }
              : null,
            yLabel: plan.yLabel
              ? {
                  text: plan.yLabel,
                  x: 0,
                  y: 0,
                  transform: `translate(${-(m.left - 12)},${layout.innerHeight / 2}) rotate(-90)`,
                }
              : null,
          }
        },
      }),
    ],

    render: [
      renderStep({
        id: 'labels.render',
        reads: { pos: LabelPositions },
        layer: { name: 'chrome-labels', z: 90, host: 'overlay' },
        run: ({ pos }, ctx) => {
          const g = ctx.layer!

          const title = g.selectAll<SVGTextElement, Placed>('.lc-title')
            .data(pos.title ? [pos.title] : [])
          title.exit().remove()
          title
            .enter()
            .append('text')
            .attr('class', 'lc-title')
            .attr('dy', '0.35em')
            .attr('text-anchor', 'middle')
            .attr('font-size', '14px')
            .attr('font-family', 'sans-serif')
            .attr('font-weight', '600')
            .attr('fill', 'currentColor')
            .merge(title)
            .attr('x', d => d.x)
            .attr('y', d => d.y)
            .text(d => d.text)

          const xLabel = g.selectAll<SVGTextElement, Placed>('.lc-x-label')
            .data(pos.xLabel ? [pos.xLabel] : [])
          xLabel.exit().remove()
          xLabel
            .enter()
            .append('text')
            .attr('class', 'lc-x-label')
            .attr('text-anchor', 'middle')
            .attr('font-size', '12px')
            .attr('font-family', 'sans-serif')
            .attr('fill', 'currentColor')
            .merge(xLabel)
            .attr('x', d => d.x)
            .attr('y', d => d.y)
            .text(d => d.text)

          const yLabel = g.selectAll<SVGTextElement, Placed>('.lc-y-label')
            .data(pos.yLabel ? [pos.yLabel] : [])
          yLabel.exit().remove()
          yLabel
            .enter()
            .append('text')
            .attr('class', 'lc-y-label')
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em')
            .attr('font-size', '12px')
            .attr('font-family', 'sans-serif')
            .attr('fill', 'currentColor')
            .merge(yLabel)
            .attr('transform', d => d.transform)
            .text(d => d.text)
        },
      }),
    ],
  }
}
