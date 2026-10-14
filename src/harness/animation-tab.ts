import type { AnimationMode, EasingType } from '@/lib/types.ts'
import type { BaseHarness } from './state.ts'

/** Animation tab: mode per operation, duration, easing — shared by every chart type. */
export function initAnimationTab(h: BaseHarness): void {
  const { chart, setLog } = h

  const animDurationInput = document.getElementById('anim-duration') as HTMLInputElement
  const animSetDataSelect = document.getElementById('anim-set-data') as HTMLSelectElement
  const animUpdateDataSelect = document.getElementById('anim-update-data') as HTMLSelectElement
  const animAppendSelect = document.getElementById('anim-append') as HTMLSelectElement
  const animEasingSelect = document.getElementById('anim-easing') as HTMLSelectElement

  function syncAnimationSettings(): void {
    const duration = Math.max(0, parseInt(animDurationInput.value, 10) || 0)
    const setDataAnimation = animSetDataSelect.value as AnimationMode
    const updateDataAnimation = animUpdateDataSelect.value as AnimationMode
    const appendAnimation = animAppendSelect.value as AnimationMode
    const easingType = animEasingSelect.value as EasingType
    chart.updateSettings({
      animationDuration: duration,
      setDataAnimation,
      updateDataAnimation,
      appendAnimation,
      easingType,
    })
    setLog(
      `updateSettings({ animationDuration: ${duration}, setDataAnimation: "${setDataAnimation}", ` +
        `updateDataAnimation: "${updateDataAnimation}", appendAnimation: "${appendAnimation}", ` +
        `easingType: "${easingType}" })`,
    )
  }

  animDurationInput.addEventListener('change', syncAnimationSettings)
  animSetDataSelect.addEventListener('change', syncAnimationSettings)
  animUpdateDataSelect.addEventListener('change', syncAnimationSettings)
  animAppendSelect.addEventListener('change', syncAnimationSettings)
  animEasingSelect.addEventListener('change', syncAnimationSettings)
}
