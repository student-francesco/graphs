import { renderStep, type ChartModule } from '@/lib/engine/index.ts'
import { removeSkeleton, renderSkeleton, type SkeletonShape } from '@/lib/skeleton.ts'
import { BaseSettings, D3Ctx, HasData, Layout } from './tokens.ts'

/**
 * Shimmer placeholder while the chart has no data. Shows on mount and after
 * clearData; dismissed the moment any series holds a point. Re-renders when the
 * layout or theme changes while visible (the monolith kept a stale skeleton —
 * deliberate small improvement, identical when data is present). `shape` picks the
 * placeholder silhouette: axes + plot box (cartesian, default) or a disc (radial).
 */
export function skeletonModule(opts: { readonly shape?: SkeletonShape } = {}): ChartModule {
  const shape = opts.shape ?? 'cartesian'
  let shown = false

  return {
    id: 'skeleton',

    render: [
      renderStep({
        id: 'skeleton.render',
        reads: { hasData: HasData, ctx: D3Ctx, layout: Layout, settings: BaseSettings },
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
          renderSkeleton(ctx.svg, layout.width, layout.height, layout.margins, shape)
          shown = true
        },
      }),
    ],
  }
}
