import type * as d3 from 'd3'
import { collectToken, SettingsToken, token, type CollectToken, type Token } from '../engine/index.ts'
import type {
  AnimationMode,
  ChartMargins,
  ChartSettings,
  CurveType,
  SeriesDataPoint,
} from '../types.ts'

/**
 * Cross-module tokens. A token is just an id plus a type — listing the shared ones
 * here couples nobody to nobody: providers and consumers still only know the token.
 * Module-private tokens live in their owning module files.
 */

/** Typed alias of the engine's settings store (same id, chart-level type). */
export const Settings = SettingsToken as unknown as Token<ChartSettings>

export interface D3Context {
  readonly container: HTMLElement
  readonly svg: d3.Selection<SVGSVGElement, unknown, null, undefined>
  readonly overlaySvg: d3.Selection<SVGSVGElement, unknown, null, undefined>
  readonly defs: d3.Selection<SVGDefsElement, unknown, null, undefined>
  readonly innerG: d3.Selection<SVGGElement, unknown, null, undefined>
  readonly overlayG: d3.Selection<SVGGElement, unknown, null, undefined>
  readonly chartAreaG: d3.Selection<SVGGElement, unknown, null, undefined>
  readonly scrollG: d3.Selection<SVGGElement, unknown, null, undefined>
  readonly clipRect: d3.Selection<SVGRectElement, unknown, null, undefined>
  readonly fadeMaskRect: d3.Selection<SVGRectElement, unknown, null, undefined>
  readonly fadeStopLeft: d3.Selection<SVGStopElement, unknown, null, undefined>
  readonly fadeStopLeft2: d3.Selection<SVGStopElement, unknown, null, undefined>
  readonly blurDiv: HTMLDivElement
}

/** The D3 scaffold every renderer transitively depends on — provided by the context module. */
export const D3Ctx: Token<D3Context> = token('context.d3')

/** Live container size, updated by the context module's ResizeObserver. */
export const ContainerSize: Token<{ width: number; height: number }> = token('context.size')

export interface LayoutBox {
  readonly width: number
  readonly height: number
  /** Effective margins: settings.margins plus all merged contributions. */
  readonly margins: ChartMargins
  /** settings.margins only — the clip rect and fade mask are sized against these. */
  readonly baseMargins: ChartMargins
  readonly innerWidth: number
  readonly innerHeight: number
}

/** Merged layout — produced by the context module's layout.merge step. */
export const Layout: Token<LayoutBox> = token('layout.box')

/**
 * Additive margin reservations (title space, stacked axis rails, …). Contribute from
 * a prepare step that does NOT read Layout — consume the merged Layout from a
 * separate, later step.
 */
export const MarginRequests: CollectToken<Partial<ChartMargins>> =
  collectToken('layout.marginRequests')

/** True when any series holds at least one point — provided by the series module. */
export const HasData: Token<boolean> = token('series.hasData')

// ---------------------------------------------------------------------------
// Series data pipeline
// ---------------------------------------------------------------------------

/** Fully cascade-resolved display values for one series (no undefineds left). */
export interface ResolvedSeriesStyle {
  readonly axisId: string
  readonly color: string
  readonly lineWeight: number
  readonly dotRadius: number
  readonly curveType: CurveType
  readonly smoothing: number
  readonly decimation: number
  readonly showLabels: boolean
  /** Final d3-format string for point labels (labelFormat ?? tooltipValueFormat). */
  readonly labelFormat: string
  /** Final dot border color, theme fallback applied. */
  readonly dotBorderColor: string
}

export interface VisibleSeriesEntry {
  readonly id: string
  readonly raw: readonly SeriesDataPoint[]
  readonly dataRev: number
  /** Bumped when the series must be reborn (renderers clear its elements). */
  readonly rebirth: number
  readonly exit: readonly SeriesDataPoint[]
  readonly resolved: ResolvedSeriesStyle
}

/** Cascade-resolved series map — entry identity stable while a series is unchanged. */
export const VisibleSeries: Token<ReadonlyMap<string, VisibleSeriesEntry>> =
  token('series.visible')

/** id → points after the smoothing transform (these define the y auto-extent). */
export const SmoothedSeries: Token<ReadonlyMap<string, readonly SeriesDataPoint[]>> =
  token('series.smoothed')

/** id → points after all display transforms (smoothing → decimation). */
export const DisplaySeries: Token<ReadonlyMap<string, readonly SeriesDataPoint[]>> =
  token('series.display')

// ---------------------------------------------------------------------------
// Axes + scales
// ---------------------------------------------------------------------------

/** Raw per-axis state (sparse — undefined cascades to chart settings). */
export interface AxisDef {
  readonly id: string
  readonly name: string
  readonly color: string | null
  readonly range: readonly [number, number] | null
  readonly limits: readonly [number, number] | null
  readonly scaleType: 'linear' | 'log' | undefined
  readonly showGrid: boolean | undefined
  readonly gridColor: string | undefined
  readonly gridOpacity: number | undefined
  readonly yTickCount: number | null | undefined
}

/** Ordered axis definitions — provided by the axes-store module. */
export const AxesDef: Token<readonly AxisDef[]> = token('axes.def')

/** Cascade-resolved per-axis layout (position, offset, grid styling, tick count). */
export interface AxisLayoutEntry {
  readonly id: string
  readonly name: string
  readonly color: string | null
  readonly position: 'left' | 'right'
  readonly offsetX: number
  readonly scaleType: 'linear' | 'log'
  readonly showGrid: boolean
  readonly gridColor: string
  readonly gridOpacity: number
  readonly yTickCount: number | null
  /** Verbatim domain pins (no cascade) — carried through for the scales module. */
  readonly range: readonly [number, number] | null
  readonly limits: readonly [number, number] | null
}

export const AxisLayouts: Token<readonly AxisLayoutEntry[]> = token('axes.layouts')

export type YScale =
  | d3.ScaleLinear<number, number>
  | d3.ScaleLogarithmic<number, number>

export interface ScaleBundle {
  readonly x: d3.ScaleTime<number, number>
  readonly y: ReadonlyMap<string, YScale>
  /** Resolved tick values — axis chrome, grid, and Blazor label resolution all
   *  consume the SAME arrays, so they can never disagree. */
  readonly xTicks: readonly Date[]
  readonly yTicks: ReadonlyMap<string, readonly number[]>
  /** Plain-value descriptor for change detection (scale instances are closures). */
  readonly desc: string
}

export const Scales: Token<ScaleBundle> = token('scales.bundle')

/**
 * The two-layer viewport state owned by the zoom module: brush-set domain
 * overrides replace the auto extent; the d3.zoom transform stacks on top via
 * rescale. Plain diffable data — never a d3.ZoomTransform instance.
 */
export interface ViewTransformState {
  readonly k: number
  readonly x: number
  readonly y: number
  readonly xDomainOverride: readonly [Date, Date] | null
  readonly yDomainOverrides: ReadonlyMap<string, readonly [number, number]>
}

export const ViewTransform: Token<ViewTransformState> = token('zoom.viewTransform')

/** Dates folded into the x auto-extent (series raw data; future: vertical annotations). */
export const XDomainValues: CollectToken<readonly Date[]> = collectToken('scales.xDomain')

/** Values folded into per-axis y auto-extents (smoothed series data, annotation ys). */
export const YDomainValues: CollectToken<ReadonlyArray<{ axisId: string; values: readonly number[] }>> =
  collectToken('scales.yDomain')

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------

/**
 * Geometry roles drive the tween policy table:
 * - 'scrolled': tween in drawOn/morph, SNAP in transition (the container carries
 *   the motion) and none — x ticks, grid.
 * - 'marker':   tween only in morph — dots.
 * - 'free':     tween whenever the pass animates — labels, y rails, annotations.
 */
export type GeomRole = 'scrolled' | 'marker' | 'free'

export interface PathSpec {
  readonly gen: d3.Line<SeriesDataPoint>
  readonly display: readonly SeriesDataPoint[]
  readonly exit: readonly SeriesDataPoint[]
  /** Brand-new paths fall back to a drawOn reveal in morph/transition modes. */
  readonly isNew: boolean
}

export type ReshiftSpec =
  | { readonly kind: 'attr-x'; readonly attr: 'cx' | 'x' }
  | { readonly kind: 'translate-x'; readonly fixedY: number }

/* eslint-disable @typescript-eslint/no-explicit-any */
export type AnySelection = d3.Selection<any, any, any, any>
export type AnyTransition = d3.Transition<any, any, any, any>

export interface AnimationCtxValue {
  readonly mode: AnimationMode
  readonly duration: number
  readonly ease: (t: number) => number
  /** Entering-element fades run whenever the chart is configured to animate at
   *  all (settings.animationDuration > 0), independent of this pass's mode. */
  readonly fadeEnters: boolean
  shouldTween(role: GeomRole): boolean
  /**
   * Apply geometry through a selection or a transition, per the role table.
   * The callback's parameter is deliberately untyped: d3's Selection and
   * Transition share the chainable attr/style surface but not a common type.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  position(sel: AnySelection, role: GeomRole, apply: (s: any) => void): void
  /** Path rendering incl. drawOn dasharray reveal, morph tween, exit-point rules. */
  renderPath(path: d3.Selection<SVGPathElement, unknown, null, undefined>, spec: PathSpec): void
  /** Entering-element fade (x ticks) — only when the chart animates at all. */
  fadeIn(sel: AnySelection): void
  /**
   * Exit lifecycle: rename out of future joins, fade out, remove. The reshift
   * spec marks elements for the transition driver's scroll-delta adjustment.
   */
  fadeOutExit(sel: AnySelection, exitingClass: string, reshift?: ReshiftSpec): void
}

export const AnimationCtx: Token<AnimationCtxValue> = token('animation.ctx')

/** Hints for plan errors: token id → module that provides it. */
export const KNOWN_PROVIDERS: ReadonlyMap<string, string> = new Map([
  [D3Ctx.id, 'context'],
  [ContainerSize.id, 'context'],
  [Layout.id, 'context'],
  [HasData.id, 'series'],
  [VisibleSeries.id, 'series'],
  [SmoothedSeries.id, 'smoothing'],
  [DisplaySeries.id, 'decimation'],
  [AxesDef.id, 'axes-store'],
  [AxisLayouts.id, 'axes-store'],
  [Scales.id, 'scales'],
  [AnimationCtx.id, 'animation'],
  [ViewTransform.id, 'zoom'],
])
