import type * as d3 from 'd3'
import { collectToken, SettingsToken, token, type CollectToken, type Token } from '../engine/index.ts'
import type { ChartMargins, ChartSettings } from '../types.ts'

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

/** Hints for plan errors: token id → module that provides it. */
export const KNOWN_PROVIDERS: ReadonlyMap<string, string> = new Map([
  [D3Ctx.id, 'context'],
  [ContainerSize.id, 'context'],
  [Layout.id, 'context'],
  [HasData.id, 'series'],
])
