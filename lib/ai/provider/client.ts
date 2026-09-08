import 'server-only'

import Anthropic from '@anthropic-ai/sdk'

import { serverEnv } from '@/lib/env/server'

/**
 * The single seam every model call passes through.
 *
 * One place that holds the key, one place that picks a model, one place to add
 * a timeout or a retry policy. Callers ask for a *role* — reasoning, chat,
 * fast — rather than naming a model, so changing which model does the grading
 * is an environment change rather than a code change.
 *
 * `AI_PROVIDER` is validated as `anthropic | openai` by the environment schema.
 * Only Anthropic is implemented; an OpenAI value fails loudly here rather than
 * silently falling back to a provider the caller did not ask for.
 */

let cached: Anthropic | null = null

export function aiClient(): Anthropic {
  if (cached) return cached

  const env = serverEnv()

  if (env.AI_PROVIDER !== 'anthropic') {
    throw new Error(
      `AI_PROVIDER is "${env.AI_PROVIDER}", but only "anthropic" is implemented. ` +
        'Set AI_PROVIDER=anthropic or add the provider.',
    )
  }

  cached = new Anthropic({
    apiKey: env.AI_API_KEY,
    // Grading a long essay with thinking on can take a while; the SDK default
    // is ten minutes, which is longer than any request here should live.
    timeout: 120_000,
    maxRetries: 2,
  })

  return cached
}

/** Which model does what. Named by role so the choice lives in the environment. */
export type ModelRole = 'reasoning' | 'chat' | 'fast'

export function modelFor(role: ModelRole): string {
  const env = serverEnv()

  switch (role) {
    case 'reasoning':
      return env.AI_MODEL_REASONING
    case 'chat':
      return env.AI_MODEL_CHAT
    case 'fast':
      return env.AI_MODEL_FAST
  }
}
