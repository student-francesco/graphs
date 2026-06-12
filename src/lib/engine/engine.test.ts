import { describe, expect, it, vi } from 'vitest'
import {
  ChartEngine,
  collectToken,
  prepareStep,
  renderStep,
  resolvePlan,
  SettingsToken,
  shallowEquals,
  storeSpec,
  token,
  type ChartModule,
} from './index.ts'

/* Each test builds tokens/modules with unique local instances — no shared state. */

describe('plan resolution', () => {
  it('orders steps into dependency waves', () => {
    const A = token<number>('a')
    const B = token<number>('b')
    const C = token<number>('c')
    const mod: ChartModule = {
      id: 'm',
      prepare: [
        prepareStep({ id: 'm.c', reads: { b: B }, provides: C, run: ({ b }) => b + 1 }),
        prepareStep({ id: 'm.a', reads: {}, provides: A, run: () => 1 }),
        prepareStep({ id: 'm.b', reads: { a: A }, provides: B, run: ({ a }) => a + 1 }),
      ],
    }
    const plan = resolvePlan([mod], { sourceTokens: new Set() })
    expect(plan.waves.map(w => w.map(s => s.id))).toEqual([['m.a'], ['m.b'], ['m.c']])
  })

  it('rejects duplicate providers with both step names', () => {
    const T = token<number>('t')
    const mod: ChartModule = {
      id: 'm',
      prepare: [
        prepareStep({ id: 'm.one', reads: {}, provides: T, run: () => 1 }),
        prepareStep({ id: 'm.two', reads: {}, provides: T, run: () => 2 }),
      ],
    }
    expect(() => resolvePlan([mod], { sourceTokens: new Set() })).toThrow(
      /"t" provided by both "m.one" and "m.two"/,
    )
  })

  it('rejects missing providers, with a module hint when known', () => {
    const Ghost = token<number>('ghost')
    const Out = token<number>('out')
    const mod: ChartModule = {
      id: 'm',
      prepare: [prepareStep({ id: 'm.s', reads: { g: Ghost }, provides: Out, run: () => 0 })],
    }
    expect(() =>
      resolvePlan([mod], {
        sourceTokens: new Set(),
        knownProviders: new Map([['ghost', 'spooky-module']]),
      }),
    ).toThrow(/reads "ghost" but nothing provides it — did you forget the "spooky-module" module\?/)
  })

  it('reports cycles with the step path and the split-pattern hint', () => {
    const A = token<number>('a')
    const B = token<number>('b')
    const mod: ChartModule = {
      id: 'm',
      prepare: [
        prepareStep({ id: 'm.a', reads: { b: B }, provides: A, run: () => 0 }),
        prepareStep({ id: 'm.b', reads: { a: A }, provides: B, run: () => 0 }),
      ],
    }
    expect(() => resolvePlan([mod], { sourceTokens: new Set() })).toThrow(/cycle.*split the module/s)
  })

  it('detects the contribute-and-consume cycle through a collect token', () => {
    const Requests = collectToken<number>('requests')
    const Merged = token<number>('merged')
    const Bad = token<number>('bad')
    const mod: ChartModule = {
      id: 'm',
      prepare: [
        prepareStep({
          id: 'm.merge',
          reads: { r: Requests },
          provides: Merged,
          run: ({ r }) => r.reduce((a, b) => a + b, 0),
        }),
        // reads the merge AND contributes to its inputs — a real cycle
        prepareStep({
          id: 'm.bad',
          reads: { merged: Merged },
          provides: Bad,
          contributes: [{ to: Requests, select: v => v as number }],
          run: ({ merged }) => merged,
        }),
      ],
    }
    expect(() => resolvePlan([mod], { sourceTokens: new Set() })).toThrow(/cycle/)
  })

  it('orders render steps by phase, then z, then registration', () => {
    const T = token<number>('t')
    const noop = (): void => {}
    const mod: ChartModule = {
      id: 'm',
      prepare: [prepareStep({ id: 'm.p', reads: {}, provides: T, run: () => 1 })],
      render: [
        renderStep({ id: 'r.late', reads: { t: T }, phase: 'post', order: 0, run: noop }),
        renderStep({ id: 'r.b', reads: { t: T }, layer: { name: 'b', z: 20, host: 'h' }, run: noop }),
        renderStep({ id: 'r.a', reads: { t: T }, layer: { name: 'a', z: 10, host: 'h' }, run: noop }),
        renderStep({ id: 'r.early', reads: { t: T }, phase: 'pre', order: 0, run: noop }),
      ],
    }
    const plan = resolvePlan([mod], { sourceTokens: new Set() })
    expect(plan.renderOrder.map(s => s.id)).toEqual(['r.early', 'r.a', 'r.b', 'r.late'])
  })
})

describe('shallowEquals', () => {
  it('compares one level of plain objects, arrays, Maps, and Dates', () => {
    expect(shallowEquals({ a: 1 }, { a: 1 })).toBe(true)
    expect(shallowEquals({ a: 1 }, { a: 2 })).toBe(false)
    expect(shallowEquals({ a: 1 }, { a: 1, b: 2 })).toBe(false)
    expect(shallowEquals([1, 2], [1, 2])).toBe(true)
    expect(shallowEquals([1, 2], [2, 1])).toBe(false)
    expect(shallowEquals(new Date(5), new Date(5))).toBe(true)
    expect(shallowEquals(new Map([['k', 1]]), new Map([['k', 1]]))).toBe(true)
    // nested objects compare by reference (shallow by design)
    const nested = { x: 1 }
    expect(shallowEquals({ a: nested }, { a: nested })).toBe(true)
    expect(shallowEquals({ a: { x: 1 } }, { a: { x: 1 } })).toBe(false)
  })
})

describe('engine execution', () => {
  function counterModule() {
    const Count = token<number>('count')
    const Doubled = token<number>('doubled')
    const runs = { doubled: 0, render: 0 }
    const rendered: number[] = []
    const mod: ChartModule = {
      id: 'counter',
      stores: [storeSpec({ token: Count, init: () => 0 })],
      prepare: [
        prepareStep({
          id: 'counter.double',
          reads: { count: Count },
          provides: Doubled,
          run: ({ count }) => {
            runs.doubled++
            return count * 2
          },
        }),
      ],
      render: [
        renderStep({
          id: 'counter.render',
          reads: { doubled: Doubled },
          run: ({ doubled }) => {
            runs.render++
            rendered.push(doubled)
          },
        }),
      ],
    }
    return { Count, Doubled, mod, runs, rendered }
  }

  it('runs the initial pass synchronously at construction', () => {
    const { mod, runs, rendered } = counterModule()
    const engine = new ChartEngine([mod])
    expect(runs.doubled).toBe(1)
    expect(rendered).toEqual([0])
    engine.destroy()
  })

  it('store mutations re-run dependents synchronously via flushSync', () => {
    const { Count, mod, rendered } = counterModule()
    const engine = new ChartEngine([mod])
    const rt = engine.runtime()
    rt.store(Count).set(5)
    rt.flushSync()
    expect(rendered).toEqual([0, 10])
    engine.destroy()
  })

  it('skips prepare and render when inputs are clean (caching)', () => {
    const { Count, mod, runs } = counterModule()
    const engine = new ChartEngine([mod])
    const rt = engine.runtime()
    // a pass triggered by an unrelated request — Count unchanged
    rt.requestRender()
    rt.flushSync()
    expect(runs.doubled).toBe(1)
    expect(runs.render).toBe(1)
    // a no-op mutation (same value) still bumps the store rev → prepare re-runs,
    // but its output is value-equal → render stays cached
    rt.store(Count).set(0)
    rt.flushSync()
    expect(runs.doubled).toBe(2)
    expect(runs.render).toBe(1)
    engine.destroy()
  })

  it('coalesces several mutations into one pass with the strongest trigger', () => {
    const { Count, mod, runs } = counterModule()
    const engine = new ChartEngine([mod])
    const rt = engine.runtime()
    const handle = rt.store(Count)
    handle.set(1, { kind: 'interaction' })
    handle.set(2, { kind: 'setData' })
    handle.set(3, { kind: 'append' })
    rt.flushSync()
    expect(runs.doubled).toBe(2) // initial + one coalesced pass
    engine.destroy()
  })

  it('contributions flow into collect tokens in registration order, diffed independently', () => {
    const Requests = collectToken<{ top: number }>('reqs')
    const Merged = token<number>('merged')
    const SourceA = token<{ top: number; noise: number }>('srcA')
    const SourceB = token<{ top: number }>('srcB')
    const Noise = token<number>('noise')
    let mergeRuns = 0

    const modA: ChartModule = {
      id: 'a',
      stores: [storeSpec({ token: Noise, init: () => 0 })],
      prepare: [
        prepareStep({
          id: 'a.measure',
          reads: { noise: Noise },
          provides: SourceA,
          contributes: [{ to: Requests, select: out => ({ top: out.top }) }],
          run: ({ noise }) => ({ top: 10, noise }),
        }),
      ],
    }
    const modB: ChartModule = {
      id: 'b',
      prepare: [
        prepareStep({
          id: 'b.measure',
          reads: {},
          provides: SourceB,
          contributes: [{ to: Requests, select: out => ({ top: out.top }) }],
          run: () => ({ top: 5 }),
        }),
      ],
    }
    const merger: ChartModule = {
      id: 'merge',
      prepare: [
        prepareStep({
          id: 'merge.run',
          reads: { reqs: Requests },
          provides: Merged,
          run: ({ reqs }) => {
            mergeRuns++
            return reqs.reduce((sum, r) => sum + r.top, 0)
          },
        }),
      ],
    }

    const engine = new ChartEngine([modA, modB, merger])
    const rt = engine.runtime()
    expect(rt.peek(Merged)).toBe(15)
    expect(mergeRuns).toBe(1)

    // noise changes a.measure's OUTPUT but not its contribution → merge stays cached
    rt.store(Noise).set(99)
    rt.flushSync()
    expect(mergeRuns).toBe(1)
    expect(rt.peek(Merged)).toBe(15)
    engine.destroy()
  })

  it('custom equals suppresses downstream wakes', () => {
    const Src = token<number>('src')
    const Wrapped = token<{ v: number }>('wrapped')
    let downstreamRuns = 0
    const mod: ChartModule = {
      id: 'm',
      stores: [storeSpec({ token: Src, init: () => 1 })],
      prepare: [
        prepareStep({
          id: 'm.wrap',
          reads: { src: Src },
          provides: Wrapped,
          // treat all even/odd-equal values as unchanged
          equals: (a, b) => a.v % 2 === b.v % 2,
          run: ({ src }) => ({ v: src }),
        }),
      ],
      render: [
        renderStep({
          id: 'm.render',
          reads: { w: Wrapped },
          run: () => {
            downstreamRuns++
          },
        }),
      ],
    }
    const engine = new ChartEngine([mod])
    const rt = engine.runtime()
    expect(downstreamRuns).toBe(1)
    rt.store(Src).set(3) // odd → odd: "equal"
    rt.flushSync()
    expect(downstreamRuns).toBe(1)
    rt.store(Src).set(4) // odd → even: changed
    rt.flushSync()
    expect(downstreamRuns).toBe(2)
    engine.destroy()
  })

  it('async prepare steps make the pass async; queued mutations run a follow-up pass', async () => {
    const Src = token<number>('src')
    const Slow = token<number>('slow')
    const rendered: number[] = []
    const mod: ChartModule = {
      id: 'm',
      stores: [storeSpec({ token: Src, init: () => 1 })],
      prepare: [
        prepareStep({
          id: 'm.slow',
          reads: { src: Src },
          provides: Slow,
          run: async ({ src }) => {
            await new Promise(resolve => setTimeout(resolve, 10))
            return src * 100
          },
        }),
      ],
      render: [
        renderStep({
          id: 'm.render',
          reads: { s: Slow },
          run: ({ s }) => {
            rendered.push(s)
          },
        }),
      ],
    }
    const engine = new ChartEngine([mod])
    const rt = engine.runtime()
    // initial pass is async — nothing rendered yet
    expect(rendered).toEqual([])
    // mutate while the pass is in flight
    rt.store(Src).set(2)
    await new Promise(resolve => setTimeout(resolve, 50))
    // first pass rendered 100, follow-up pass rendered 200
    expect(rendered).toEqual([100, 200])
    engine.destroy()
  })

  it('destroy aborts in-flight async passes before the render phase', async () => {
    const Slow = token<number>('slow')
    let rendered = 0
    const mod: ChartModule = {
      id: 'm',
      prepare: [
        prepareStep({
          id: 'm.slow',
          reads: {},
          provides: Slow,
          cache: false,
          run: async () => {
            await new Promise(resolve => setTimeout(resolve, 10))
            return 1
          },
        }),
      ],
      render: [renderStep({ id: 'm.render', reads: { s: Slow }, run: () => void rendered++ })],
    }
    const engine = new ChartEngine([mod])
    engine.destroy()
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(rendered).toBe(0)
  })

  it('merges module defaults under user settings', () => {
    const probe = vi.fn()
    const mod: ChartModule = {
      id: 'm',
      defaults: { alpha: 1, beta: 2 },
      mount(rt) {
        probe(rt.store(SettingsToken).get())
      },
    }
    const engine = new ChartEngine([mod], { settings: { beta: 99 } })
    expect(probe).toHaveBeenCalledWith({ alpha: 1, beta: 99 })
    engine.destroy()
  })

  it('buildApi merges module methods, rejects collisions, and guards destroyed charts', () => {
    const modA: ChartModule = { id: 'a', api: () => ({ ping: () => 'pong' }) }
    const modB: ChartModule = { id: 'b', api: () => ({ ping: () => 'other' }) }
    expect(() => new ChartEngine([modA, modB]).buildApi()).toThrow(/"ping" contributed twice/)

    const engine = new ChartEngine([modA])
    const api = engine.buildApi() as { ping(): string; destroy(): void }
    expect(api.ping()).toBe('pong')
    api.destroy()
    expect(() => api.ping()).toThrow(/destroyed/)
    expect(() => api.destroy()).not.toThrow()
  })

  it('mount disposers run in reverse order on destroy', () => {
    const order: string[] = []
    const modA: ChartModule = { id: 'a', mount: () => () => void order.push('a') }
    const modB: ChartModule = { id: 'b', mount: () => () => void order.push('b') }
    const engine = new ChartEngine([modA, modB])
    engine.destroy()
    expect(order).toEqual(['b', 'a'])
  })

  it('explain() renders waves and the render order', () => {
    const { mod } = counterModule()
    const engine = new ChartEngine([mod])
    const text = engine.plan.explain()
    expect(text).toContain('wave 0:')
    expect(text).toContain('counter.double')
    expect(text).toContain('render:')
    expect(text).toContain('counter.render')
    engine.destroy()
  })
})
