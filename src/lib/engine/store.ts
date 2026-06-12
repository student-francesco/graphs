import type { Token, TriggerInfo } from './token.ts'

/**
 * Stores are the mutable source nodes of the module graph. Every mutation bumps the
 * revision (the backbone of by-revision caching) and queues a render pass through
 * the scheduler. Values are replaced, not mutated in place — `update` must return
 * a new value when anything changed, or the same reference to signal "no change".
 */
export interface StoreHandle<S> {
  readonly token: Token<S>
  get(): S
  /** Replace the value. Bumps the revision and queues a pass unless silent. */
  set(next: S, trigger?: TriggerInfo): void
  /** Functional update. Returning the current reference skips revision/pass. */
  update(fn: (current: S) => S, trigger?: TriggerInfo): void
  readonly rev: number
}

export interface StoreEntry {
  readonly token: Token<unknown>
  value: unknown
  rev: number
}

export class StoreRegistry {
  private readonly entries = new Map<string, StoreEntry>()

  private readonly onMutate: (trigger: TriggerInfo) => void

  constructor(onMutate: (trigger: TriggerInfo) => void) {
    this.onMutate = onMutate
  }

  register<S>(token: Token<S>, initial: S): void {
    if (this.entries.has(token.id)) {
      throw new Error(`engine: duplicate store registration for token "${token.id}"`)
    }
    this.entries.set(token.id, { token: token as Token<unknown>, value: initial, rev: 1 })
  }

  has(tokenId: string): boolean {
    return this.entries.has(tokenId)
  }

  entry(tokenId: string): StoreEntry {
    const e = this.entries.get(tokenId)
    if (!e) throw new Error(`engine: unknown store token "${tokenId}"`)
    return e
  }

  handle<S>(token: Token<S>): StoreHandle<S> {
    const registry = this
    const entry = this.entry(token.id)
    return {
      token,
      get: () => entry.value as S,
      set: (next: S, trigger?: TriggerInfo) => {
        entry.value = next
        entry.rev++
        registry.onMutate(trigger ?? { kind: 'mutation' })
      },
      update: (fn: (current: S) => S, trigger?: TriggerInfo) => {
        const next = fn(entry.value as S)
        if (Object.is(next, entry.value)) return
        entry.value = next
        entry.rev++
        registry.onMutate(trigger ?? { kind: 'mutation' })
      },
      get rev() {
        return entry.rev
      },
    }
  }
}
