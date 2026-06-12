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

  implEl.textContent =
    h.impl === 'modules'
      ? 'module engine (v2) — append ?impl=monolith to switch back'
      : 'monolith (v1) — append ?impl=v2 to the URL for the module engine'

  const maybeModular = h.chart as unknown as { getRegisteredModules?: () => string[] }
  if (typeof maybeModular.getRegisteredModules === 'function') {
    listEl.innerHTML = ''
    for (const id of maybeModular.getRegisteredModules()) {
      const li = document.createElement('li')
      li.textContent = `${id} ✓`
      listEl.appendChild(li)
    }
  } else {
    listEl.innerHTML = '<li>(module list available on the v2 engine only)</li>'
  }

  btnPlan.addEventListener('click', () => {
    const maybePlan = h.chart as unknown as { explainPlan?: () => string }
    if (typeof maybePlan.explainPlan === 'function') {
      console.log(maybePlan.explainPlan())
      h.setLog('Computation plan dumped to the console.')
    } else {
      h.setLog('No computation plan — run with ?impl=v2.')
    }
  })
}
