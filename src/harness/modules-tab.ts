import type { Harness } from './state.ts'

/**
 * Modules tab: shows which implementation serves the chart and, on the module
 * engine, the registered modules and a computation-plan dump. Confirms at a
 * glance that each migration step landed.
 */
export function initModulesTab(h: Harness): void {
  const implEl = document.getElementById('modules-impl')!
  const listEl = document.getElementById('modules-list')!
  const btnPlan = document.getElementById('btn-dump-plan')!

  implEl.textContent = `module engine — ${h.impl}`

  const modular = h.chart as unknown as { getRegisteredModules(): string[] }
  listEl.innerHTML = ''
  for (const id of modular.getRegisteredModules()) {
    const li = document.createElement('li')
    li.textContent = `${id} ✓`
    listEl.appendChild(li)
  }

  btnPlan.addEventListener('click', () => {
    const withPlan = h.chart as unknown as { explainPlan(): string }
    console.log(withPlan.explainPlan())
    h.setLog('Computation plan dumped to the console.')
  })
}
