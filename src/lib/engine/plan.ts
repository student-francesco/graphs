import type { AnyPrepareStep, AnyRenderStep, ChartModule, RenderPhase } from './module.ts'
import type { AnyToken } from './token.ts'

export interface ContributorRef {
  step: AnyPrepareStep
  /** Index into step.contributes */
  index: number
  /** Registration order across the whole chart — collect values keep this order. */
  order: number
}

export interface ComputationPlan {
  /** Prepare steps grouped into dependency waves; wave N only reads waves < N and stores. */
  readonly waves: ReadonlyArray<ReadonlyArray<AnyPrepareStep>>
  /** All render steps in execution order: phase, then layer z (or order), then registration. */
  readonly renderOrder: ReadonlyArray<AnyRenderStep>
  /** Single-token id → producing prepare step (absent for store/engine tokens). */
  readonly providerOf: ReadonlyMap<string, AnyPrepareStep>
  /** Collect-token id → contributors in registration order. */
  readonly contributorsOf: ReadonlyMap<string, readonly ContributorRef[]>
  explain(): string
  toDot(): string
}

const PHASE_RANK: Record<RenderPhase, number> = { pre: 0, main: 1, post: 2 }

interface ResolveOptions {
  /** Token ids satisfied outside the step graph: stores + engine-published tokens. */
  sourceTokens: ReadonlySet<string>
  /** module id per known token, for "did you forget module X?" hints. */
  knownProviders?: ReadonlyMap<string, string>
}

export function resolvePlan(modules: readonly ChartModule[], opts: ResolveOptions): ComputationPlan {
  const prepareSteps: AnyPrepareStep[] = []
  const renderSteps: AnyRenderStep[] = []
  const moduleOfStep = new Map<string, string>()

  for (const mod of modules) {
    for (const step of mod.prepare ?? []) {
      if (moduleOfStep.has(step.id)) {
        throw new Error(`engine: duplicate step id "${step.id}" (module "${mod.id}")`)
      }
      moduleOfStep.set(step.id, mod.id)
      prepareSteps.push(step)
    }
    for (const step of mod.render ?? []) {
      if (moduleOfStep.has(step.id)) {
        throw new Error(`engine: duplicate step id "${step.id}" (module "${mod.id}")`)
      }
      moduleOfStep.set(step.id, mod.id)
      renderSteps.push(step)
    }
  }

  // ---- Index providers ----
  const providerOf = new Map<string, AnyPrepareStep>()
  const contributorsOf = new Map<string, ContributorRef[]>()
  let contributionOrder = 0

  for (const step of prepareSteps) {
    if (opts.sourceTokens.has(step.provides.id)) {
      throw new Error(
        `engine: step "${step.id}" provides "${step.provides.id}" which is already a store/engine token`,
      )
    }
    const existing = providerOf.get(step.provides.id)
    if (existing) {
      throw new Error(
        `engine: token "${step.provides.id}" provided by both "${existing.id}" and "${step.id}"`,
      )
    }
    providerOf.set(step.provides.id, step)
    for (const [index, c] of (step.contributes ?? []).entries()) {
      const list = contributorsOf.get(c.to.id) ?? []
      list.push({ step, index, order: contributionOrder++ })
      contributorsOf.set(c.to.id, list)
    }
  }

  // ---- Dependency edges (step → producing steps) ----
  const missingHint = (tokenId: string): string => {
    const hint = opts.knownProviders?.get(tokenId)
    return hint ? ` — did you forget the "${hint}" module?` : ''
  }

  const depsOf = (step: AnyPrepareStep | AnyRenderStep): AnyPrepareStep[] => {
    const producers: AnyPrepareStep[] = []
    for (const tok of Object.values(step.reads) as AnyToken[]) {
      if (tok.kind === 'collect') {
        for (const ref of contributorsOf.get(tok.id) ?? []) producers.push(ref.step)
        continue
      }
      if (opts.sourceTokens.has(tok.id)) continue
      const provider = providerOf.get(tok.id)
      if (!provider) {
        throw new Error(
          `engine: step "${step.id}" reads "${tok.id}" but nothing provides it${missingHint(tok.id)}`,
        )
      }
      producers.push(provider)
    }
    return producers
  }

  // ---- Wave assignment (longest-path layering) with cycle reporting ----
  const waveOf = new Map<string, number>()
  const visiting = new Set<string>()

  const assignWave = (step: AnyPrepareStep, path: string[]): number => {
    const known = waveOf.get(step.id)
    if (known !== undefined) return known
    if (visiting.has(step.id)) {
      const cycle = [...path.slice(path.indexOf(step.id)), step.id].join(' → ')
      throw new Error(
        `engine: dependency cycle: ${cycle}. If a step both consumes a merged value ` +
          `and contributes to it, split the module into two steps (contribute from an ` +
          `early step, consume the merge from a later one).`,
      )
    }
    visiting.add(step.id)
    let wave = 0
    for (const dep of depsOf(step)) {
      wave = Math.max(wave, assignWave(dep, [...path, step.id]) + 1)
    }
    visiting.delete(step.id)
    waveOf.set(step.id, wave)
    return wave
  }

  for (const step of prepareSteps) assignWave(step, [])

  // Validate render reads (cycle-free by construction — render provides nothing).
  for (const step of renderSteps) depsOf(step)

  const waveCount = prepareSteps.length === 0 ? 0 : Math.max(...waveOf.values()) + 1
  const waves: AnyPrepareStep[][] = Array.from({ length: waveCount }, () => [])
  for (const step of prepareSteps) waves[waveOf.get(step.id)!]!.push(step)

  // ---- Render order: phase → layer z (or order) → registration ----
  const registrationIndex = new Map<string, number>(renderSteps.map((s, i) => [s.id, i]))
  const renderOrder = [...renderSteps].sort((a, b) => {
    const phase = PHASE_RANK[a.phase ?? 'main'] - PHASE_RANK[b.phase ?? 'main']
    if (phase !== 0) return phase
    const za = a.layer?.z ?? a.order ?? 0
    const zb = b.layer?.z ?? b.order ?? 0
    if (za !== zb) return za - zb
    return registrationIndex.get(a.id)! - registrationIndex.get(b.id)!
  })

  const explain = (): string => {
    const lines: string[] = []
    waves.forEach((wave, i) => {
      lines.push(`wave ${i}:`)
      for (const step of wave) {
        const reads = (Object.values(step.reads) as AnyToken[]).map(t => t.id).join(', ')
        const contributes = (step.contributes ?? []).map(c => ` ⊕${c.to.id}`).join('')
        lines.push(`  ${step.id} (${reads || '∅'}) → ${step.provides.id}${contributes}`)
        lines.push(`      ${step.description}`)
      }
    })
    lines.push('render:')
    for (const step of renderOrder) {
      const where = step.layer ? `${step.layer.host}/${step.layer.name}@${step.layer.z}` : 'no-layer'
      lines.push(`  [${step.phase ?? 'main'}] ${step.id} (${where})`)
    }
    return lines.join('\n')
  }

  const toDot = (): string => {
    const lines = ['digraph plan {', '  rankdir=LR;']
    for (const step of prepareSteps) {
      lines.push(`  "${step.id}" [shape=box];`)
      for (const dep of depsOf(step)) lines.push(`  "${dep.id}" -> "${step.id}";`)
    }
    for (const step of renderSteps) {
      lines.push(`  "${step.id}" [shape=ellipse,style=dashed];`)
      for (const dep of depsOf(step)) lines.push(`  "${dep.id}" -> "${step.id}";`)
    }
    lines.push('}')
    return lines.join('\n')
  }

  return { waves, renderOrder, providerOf, contributorsOf, explain, toDot }
}
