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
  const btnLogger = document.getElementById('btn-toggle-logger')!

  implEl.textContent = `module engine — ${h.impl}`

  const modular = h.chart as unknown as {
    getRegisteredModules(): string[]
    describePrepareSteps(): ReadonlyArray<{ id: string; description: string }>
  }
  listEl.innerHTML = ''
  for (const id of modular.getRegisteredModules()) {
    const li = document.createElement('li')
    li.textContent = `${id} ✓`
    listEl.appendChild(li)
  }

  const stepsEl = document.getElementById('modules-steps')!
  stepsEl.innerHTML = ''
  for (const step of modular.describePrepareSteps()) {
    const dt = document.createElement('dt')
    dt.textContent = step.id
    dt.style.cssText = 'font-weight:600;margin-top:6px'
    const dd = document.createElement('dd')
    dd.textContent = step.description
    dd.style.cssText = 'margin:0 0 0 0;color:#6b7280'
    stepsEl.append(dt, dd)
  }

  btnPlan.addEventListener('click', () => {
    const withPlan = h.chart as unknown as { explainPlan(): string }
    console.log(withPlan.explainPlan())
    h.setLog('Computation plan dumped to the console.')
  })

  let loggerOn = false
  const withLogger = h.chart as unknown as { setLoggerEnabled(on: boolean): void }
  btnLogger.addEventListener('click', () => {
    loggerOn = !loggerOn
    withLogger.setLoggerEnabled(loggerOn)
    btnLogger.textContent = loggerOn ? 'Disable pass logger' : 'Enable pass logger'
    btnLogger.classList.toggle('active', loggerOn)
    h.setLog(`Pass logger ${loggerOn ? 'enabled' : 'disabled'}.`)
  })

  initProfiler(h)
}

interface ProfilerStats {
  passes: number
  prepare: { totalMs: number; steps: number }
  render: { totalMs: number; steps: number }
}

/**
 * Profiler debug toggle: while enabled, polls accumulated prepare/render timings
 * and renders them. The numbers grow as passes run, so a live poll beats a
 * one-shot read on toggle.
 */
function initProfiler(h: Harness): void {
  const btnProfiler = document.getElementById('btn-toggle-profiler')!
  const btnReset = document.getElementById('btn-reset-profiler')!
  const outEl = document.getElementById('profiler-output')!

  const chart = h.chart as unknown as {
    setProfilerEnabled(on: boolean): void
    getProfilerStats(): ProfilerStats
    resetProfiler(): void
  }

  let on = false
  let timer: ReturnType<typeof setInterval> | undefined

  const fmt = (ms: number): string => `${ms.toFixed(2)} ms`
  const avg = (ms: number, n: number): string => (n === 0 ? '—' : `${(ms / n).toFixed(3)} ms`)

  const refresh = (): void => {
    const s = chart.getProfilerStats()
    outEl.textContent =
      `passes:  ${s.passes}\n` +
      `prepare: ${fmt(s.prepare.totalMs)} over ${s.prepare.steps} steps (avg ${avg(s.prepare.totalMs, s.prepare.steps)})\n` +
      `render:  ${fmt(s.render.totalMs)} over ${s.render.steps} steps (avg ${avg(s.render.totalMs, s.render.steps)})\n` +
      `total:   ${fmt(s.prepare.totalMs + s.render.totalMs)}`
  }

  btnProfiler.addEventListener('click', () => {
    on = !on
    chart.setProfilerEnabled(on)
    btnProfiler.textContent = on ? 'Disable profiler' : 'Enable profiler'
    btnProfiler.classList.toggle('active', on)
    if (on) {
      refresh()
      timer = setInterval(refresh, 500)
    } else {
      if (timer !== undefined) clearInterval(timer)
      timer = undefined
      outEl.textContent = ''
    }
    h.setLog(`Profiler ${on ? 'enabled' : 'disabled'}.`)
  })

  btnReset.addEventListener('click', () => {
    chart.resetProfiler()
    if (on) refresh()
    h.setLog('Profiler counters reset.')
  })
}
