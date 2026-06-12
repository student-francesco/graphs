import { renderStep, type ChartModule } from '../engine/index.ts'
import { removeSkeleton, renderSkeleton } from '../skeleton.ts'
import { D3Ctx, HasData, Layout, Settings } from './tokens.ts'

/**
 * Shimmer placeholder while the chart has no data. Shows on mount and after
 * clearData; dismissed the moment any series holds a point. Re-renders when the
 * layout or theme changes while visible (the monolith kept a stale skeleton —
 * deliberate small improvement, identical when data is present).
 */
export function skeletonModule(): ChartModule {
  let shown = false

  return {
    id: 'skeleton',

    render: [
      renderStep({
        id: 'skeleton.render',
        reads: { hasData: HasData, ctx: D3Ctx, layout: Layout, settings: Settings },
        // paints directly on the root svg, above the (empty) chart layers
        order: 5,
        run: ({ hasData, ctx, layout }) => {
          if (hasData) {
            if (shown) {
              removeSkeleton(ctx.svg)
              shown = false
            }
            return
          }
          if (shown) removeSkeleton(ctx.svg)
          renderSkeleton(ctx.svg, layout.width, layout.height, layout.margins)
          shown = true
        },
      }),
    ],
  }
}
