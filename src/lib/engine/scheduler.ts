import type { TriggerInfo, TriggerKind } from './token.ts'

/** Higher wins when multiple mutations coalesce into one pass. */
const PRIORITY: Record<TriggerKind, number> = {
  setData: 6,
  updateData: 5,
  append: 4,
  restore: 3,
  mutation: 2,
  resize: 1,
  interaction: 0,
}

export function mergeTriggers(a: TriggerInfo | null, b: TriggerInfo): TriggerInfo {
  if (a === null) return b
  return PRIORITY[b.kind] > PRIORITY[a.kind] ? b : a
}

/**
 * Coalesces store mutations into render passes. Mutations arriving in the same
 * microtask collapse into one pass with the highest-priority trigger; public API
 * methods call flushSync() so the pass runs before they return (monolith parity).
 * Passes are serialized: while an async pass is awaiting interop, new mutations
 * queue and a follow-up pass runs after it settles.
 */
export class Scheduler {
  private pendingTrigger: TriggerInfo | null = null
  private microtaskQueued = false
  private running = false

  private readonly runPass: (trigger: TriggerInfo) => void | Promise<void>

  constructor(runPass: (trigger: TriggerInfo) => void | Promise<void>) {
    this.runPass = runPass
  }

  request(trigger: TriggerInfo): void {
    this.pendingTrigger = mergeTriggers(this.pendingTrigger, trigger)
    if (!this.microtaskQueued) {
      this.microtaskQueued = true
      queueMicrotask(() => {
        this.microtaskQueued = false
        this.flush()
      })
    }
  }

  flushSync(): void {
    this.flush()
  }

  hasPending(): boolean {
    return this.pendingTrigger !== null || this.running
  }

  private flush(): void {
    if (this.running) return
    let guard = 0
    while (this.pendingTrigger !== null) {
      if (++guard > 100) {
        throw new Error('engine: render loop did not settle after 100 passes')
      }
      const trigger = this.pendingTrigger
      this.pendingTrigger = null
      this.running = true
      let result: void | Promise<void>
      try {
        result = this.runPass(trigger)
      } catch (err) {
        this.running = false
        throw err
      }
      if (result !== undefined) {
        void result.then(
          () => {
            this.running = false
            this.flush()
          },
          (err: unknown) => {
            this.running = false
            console.error('chart: render pass failed', err)
            this.flush()
          },
        )
        return
      }
      this.running = false
    }
  }
}
