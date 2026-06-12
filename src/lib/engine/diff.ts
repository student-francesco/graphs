/**
 * Shallow structural equality for step outputs. One level deep by design: D3
 * renderers reconcile per-element through data joins, so the engine only needs to
 * answer "did this output change at all" cheaply. Steps with cleverer needs (scale
 * descriptors, formatter wrappers) supply a custom `equals`.
 */
export function shallowEquals(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (a === null || b === null || a === undefined || b === undefined) return false

  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime()

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!leafEquals(a[i], b[i])) return false
    }
    return true
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const aKeys = Object.keys(a)
    const bKeys = Object.keys(b)
    if (aKeys.length !== bKeys.length) return false
    for (const k of aKeys) {
      if (!(k in b)) return false
      if (!leafEquals(a[k], b[k])) return false
    }
    return true
  }

  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false
    for (const [k, v] of a) {
      if (!b.has(k) || !leafEquals(v, b.get(k))) return false
    }
    return true
  }

  return false
}

/** Leaf comparison: reference identity, except Dates compare by time. */
function leafEquals(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime()
  return false
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null) return false
  const proto = Object.getPrototypeOf(v) as object | null
  return proto === Object.prototype || proto === null
}
