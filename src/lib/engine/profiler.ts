/**
 * Dev-mode performance profiler — accumulates wall-clock time spent running
 * prepare steps vs render steps, across every pass since the last reset.
 *
 * The class is the single source of truth for whether profiling is active:
 * `measure` and `markPass` are no-ops while disabled, so the executor wraps
 * every step unconditionally and the hot path carries no timing branches of its
 * own. Disabled by default; the engine exposes it as `engine.profiler`. Pair
 * with the pass logger to answer "why is rendering slow".
 */
export type ProfileBucket = 'prepare' | 'render'

export interface ProfilerStats {
  /** Passes that reached the render phase since the last reset. */
  passes: number
  /** Cumulative time inside prepare-step `run` calls. */
  prepare: { totalMs: number; steps: number }
  /** Cumulative time inside render-step `run` calls. */
  render: { totalMs: number; steps: number }
}

function isThenable(v: unknown): v is Promise<unknown> {
  return typeof v === 'object' && v !== null && typeof (v as Promise<unknown>).then === 'function'
}

export class Profiler {
  private active = false
  private prepareMs = 0
  private renderMs = 0
  private prepareSteps = 0
  private renderSteps = 0
  private passes = 0

  get enabled(): boolean {
    return this.active
  }

  /** Enabling resets the accumulators so each profiling session starts clean. */
  setEnabled(enabled: boolean): void {
    if (enabled && !this.active) this.reset()
    this.active = enabled
  }

  /**
   * Time `run` into the given bucket and return its result untouched. When the
   * step is async (Blazor interop), the bucket is credited on resolution so the
   * accounting spans the awaited work, not just the synchronous launch.
   * A no-op wrapper (calls `run`, records nothing) while disabled.
   */
  measure<T>(bucket: ProfileBucket, run: () => T): T {
    if (!this.active) return run()
    const start = performance.now()
    const out = run()
    if (isThenable(out)) {
      return out.then(value => {
        this.add(bucket, performance.now() - start)
        return value
      }) as T
    }
    this.add(bucket, performance.now() - start)
    return out
  }

  /** Count a completed pass; no-op while disabled. */
  markPass(): void {
    if (this.active) this.passes++
  }

  reset(): void {
    this.prepareMs = 0
    this.renderMs = 0
    this.prepareSteps = 0
    this.renderSteps = 0
    this.passes = 0
  }

  stats(): ProfilerStats {
    return {
      passes: this.passes,
      prepare: { totalMs: this.prepareMs, steps: this.prepareSteps },
      render: { totalMs: this.renderMs, steps: this.renderSteps },
    }
  }

  private add(bucket: ProfileBucket, ms: number): void {
    if (bucket === 'prepare') {
      this.prepareMs += ms
      this.prepareSteps++
    } else {
      this.renderMs += ms
      this.renderSteps++
    }
  }
}
