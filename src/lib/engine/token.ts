/**
 * Tokens are the dependency currency of the module graph. Modules never import each
 * other — a module's steps declare the tokens they read and the token they provide,
 * and the computation plan wires producers to consumers.
 *
 * - `Token<T>`: exactly one producer per assembled chart (a prepare step or a store).
 * - `CollectToken<T>`: any number of contributors; consumers receive `readonly T[]`
 *   in module-registration order. This is both the configuration-alteration primitive
 *   (margin requests) and the capability-substitution primitive (hover targets).
 */

declare const TYPE: unique symbol

export interface Token<T> {
  readonly id: string
  readonly kind: 'single'
  /** Phantom type carrier — never set at runtime. */
  readonly [TYPE]?: T
}

export interface CollectToken<T> {
  readonly id: string
  readonly kind: 'collect'
  readonly [TYPE]?: T
}

export type AnyToken = Token<unknown> | CollectToken<unknown>

export function token<T>(id: string): Token<T> {
  return { id, kind: 'single' }
}

export function collectToken<T>(id: string): CollectToken<T> {
  return { id, kind: 'collect' }
}

export type TokenValue<Tk> =
  Tk extends Token<infer T> ? T : Tk extends CollectToken<infer T> ? readonly T[] : never

export type DepsSpec = Record<string, Token<unknown> | CollectToken<unknown>>

export type ResolvedDeps<D extends DepsSpec> = { readonly [K in keyof D]: TokenValue<D[K]> }

/**
 * Well-known engine tokens. The settings token is intentionally untyped here — the
 * engine is chart-agnostic; chart-level code re-exports it under the concrete
 * settings interface (same id, narrowed type).
 */
export const SettingsToken: Token<Record<string, unknown>> = token('settings')

export type TriggerKind =
  | 'setData'
  | 'updateData'
  | 'append'
  | 'restore'
  | 'mutation'
  | 'interaction'
  | 'resize'

export interface TriggerInfo {
  kind: TriggerKind
  /** Set when a single series caused the pass (append/update fast paths). */
  seriesId?: string
}

/** Published by the engine at the start of every pass; always counts as changed. */
export const Trigger: Token<TriggerInfo> = token('engine.trigger')
