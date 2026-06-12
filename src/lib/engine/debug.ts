import type { TriggerInfo } from './token.ts'

/**
 * Dev-mode pass logger — the answer to "why did/didn't X re-render". Disabled by
 * default; the engine exposes it as `engine.logger.enabled`. Every step records
 * ran/skipped with the revision delta that caused it.
 */
export class PassLogger {
  enabled = false

  passStart(passId: number, trigger: TriggerInfo): void {
    if (!this.enabled) return
    console.debug(`[chart] pass ${passId} ← ${trigger.kind}${trigger.seriesId ? `(${trigger.seriesId})` : ''}`)
  }

  step(passId: number, stepId: string, action: 'ran' | 'ran-async' | 'skipped', reason: string): void {
    if (!this.enabled) return
    console.debug(`[chart]   prepare ${stepId}: ${action} (${reason})`)
    void passId
  }

  render(passId: number, stepId: string, ran: boolean, reason: string): void {
    if (!this.enabled) return
    console.debug(`[chart]   render ${stepId}: ${ran ? 'ran' : 'skipped'} (${reason})`)
    void passId
  }

  passEnd(passId: number): void {
    if (!this.enabled) return
    console.debug(`[chart] pass ${passId} done`)
  }
}
