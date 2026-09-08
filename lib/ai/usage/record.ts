import 'server-only'

import { createClient } from '@/lib/supabase/server'

/**
 * Records what a model call cost.
 *
 * Tokens only. Never the prompt, never the response, never the student's work —
 * a usage log that quotes an essay is a second copy of that essay in a table
 * nobody thinks of as holding student data.
 *
 * Best-effort by design: a failure to write a usage row must not fail the thing
 * the teacher actually asked for. It is logged and dropped.
 */
export type UsageEvent = {
  institutionId: string
  /**
   * Who made the call.
   *
   * Required, not optional: `ai_usage_insert` checks `actor_id = auth.uid()`,
   * so a row without it is refused. Leaving it out made every write fail — and
   * because this function swallows its errors, it failed silently for as long
   * as nobody looked at the table.
   */
  actorId: string
  feature: string
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  succeeded: boolean
  errorCode?: string | null
}

export async function recordUsage(event: UsageEvent): Promise<void> {
  try {
    const supabase = await createClient()

    const { error } = await supabase.from('ai_usage_events').insert({
      institution_id: event.institutionId,
      actor_id: event.actorId,
      feature: event.feature,
      model: event.model,
      input_tokens: Math.max(0, Math.round(event.inputTokens)),
      output_tokens: Math.max(0, Math.round(event.outputTokens)),
      cache_read_tokens: Math.max(0, Math.round(event.cacheReadTokens ?? 0)),
      succeeded: event.succeeded,
      error_code: event.errorCode ?? null,
    })

    /*
     * Reported rather than discarded. A usage log that cannot be written is a
     * billing record quietly going missing, and the whole point of swallowing
     * the throw is that the teacher's request still succeeds — not that nobody
     * finds out.
     */
    if (error) {
      console.error('[afi:ai] usage row refused', {
        feature: event.feature,
        reason: error.message,
      })
    }
  } catch (error) {
    console.error(
      '[afi:ai] could not record usage',
      error instanceof Error ? error.message : 'unknown',
    )
  }
}
