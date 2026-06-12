import * as d3 from 'd3'
import type { LayerSpec } from './module.ts'

type GSelection = d3.Selection<SVGGElement, unknown, null, undefined>

/**
 * Z-ordered, named layer groups. Render steps declare `{name, z, host}`; the plan
 * collects every declaration, and the context module materializes one
 * `<g data-layer="name">` per layer inside each host container, sorted by z in DOM
 * order. Paint order therefore comes from DOM structure and is insertion-order
 * independent — a pass that skips some render steps cannot change stacking.
 */
export class LayerManager {
  private readonly declared = new Map<string, LayerSpec>()
  private readonly realized = new Map<string, GSelection>()
  private hostNames: readonly string[] = []

  declare_(spec: LayerSpec): void {
    const existing = this.declared.get(spec.name)
    if (existing) {
      if (existing.z !== spec.z || existing.host !== spec.host) {
        throw new Error(
          `engine: layer "${spec.name}" declared twice with conflicting placement ` +
            `(${existing.host}@${existing.z} vs ${spec.host}@${spec.z})`,
        )
      }
      return
    }
    this.declared.set(spec.name, spec)
  }

  /**
   * Materialize all declared layers. Called once by the context module's mount with
   * its host containers; hosts missing a declared layer's name fail loudly.
   */
  realize(hosts: Record<string, GSelection>): void {
    this.hostNames = Object.keys(hosts)
    const byHost = new Map<string, LayerSpec[]>()
    for (const spec of this.declared.values()) {
      const host = hosts[spec.host]
      if (!host) {
        throw new Error(
          `engine: layer "${spec.name}" wants host "${spec.host}" but the context ` +
            `module only provides [${this.hostNames.join(', ')}]`,
        )
      }
      const list = byHost.get(spec.host) ?? []
      list.push(spec)
      byHost.set(spec.host, list)
    }
    for (const [hostName, specs] of byHost) {
      specs.sort((a, b) => a.z - b.z)
      const host = hosts[hostName]!
      for (const spec of specs) {
        const g = host.append('g').attr('data-layer', spec.name)
        this.realized.set(spec.name, g as GSelection)
      }
    }
  }

  layer(name: string): GSelection {
    const sel = this.realized.get(name)
    if (!sel) {
      throw new Error(
        `engine: layer "${name}" is not realized — declared layers: ` +
          `[${Array.from(this.realized.keys()).join(', ')}]`,
      )
    }
    return sel
  }

  isRealized(): boolean {
    return this.realized.size > 0 || this.declared.size === 0
  }

  specs(): readonly LayerSpec[] {
    return Array.from(this.declared.values())
  }
}
