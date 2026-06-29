/**
 * Guardrail: feature modules never import sibling modules — only the engine,
 * shared token declarations, and lib-level utilities. This is what keeps the
 * codebase growable: adding module N+1 cannot couple to modules 1..N.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const MODULES_DIR = 'src/lib/modules'
const ALLOWED = [
  /^d3$/,
  /^\.\.\/engine\//, // the framework
  /^\.\/tokens\.ts$/, // shared token declarations (types + ids, no logic)
  /^\.\.\/types\.ts$/,
  /^\.\.\/defaults\.ts$/,
  /^\.\.\/d3-maps\.ts$/,
  /^\.\.\/transforms\.ts$/, // pure utilities
  /^\.\.\/skeleton\.ts$/,
  /^\.\.\/tooltip\.ts$/,
  /^\.\.\/pdf\.ts$/,
  // @/ alias equivalents (@ → src/)
  /^@\/lib\/engine\//,
  /^@\/lib\/modules\/tokens\.ts$/,
  /^@\/lib\/types\.ts$/,
  /^@\/lib\/defaults\.ts$/,
  /^@\/lib\/d3-maps\.ts$/,
  /^@\/lib\/transforms\.ts$/,
  /^@\/lib\/skeleton\.ts$/,
  /^@\/lib\/tooltip\.ts$/,
  /^@\/lib\/pdf\.ts$/,
]

let failures = 0
for (const file of readdirSync(MODULES_DIR)) {
  if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue
  const source = readFileSync(join(MODULES_DIR, file), 'utf8')
  for (const match of source.matchAll(/from\s+'([^']+)'/g)) {
    const specifier = match[1]
    if (!ALLOWED.some(re => re.test(specifier))) {
      console.error(`✗ ${MODULES_DIR}/${file} imports "${specifier}" — modules may only import the engine, tokens.ts, and lib utilities`)
      failures++
    }
  }
}

if (failures > 0) {
  process.exit(1)
}
console.log('✓ module isolation holds: no sibling-module imports')
