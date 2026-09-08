import 'server-only'

import { z } from 'zod'

/**
 * Server-only environment.
 *
 * The `server-only` import above makes it a build error to reach this module
 * from a Client Component, which is the mechanism that keeps the service role
 * key and SMTP credentials out of the browser bundle.
 *
 * Validation is lazy: a missing SMTP host should not stop the app from booting
 * during early phases, but it must fail loudly at the point of use rather than
 * silently sending nothing.
 */
const schema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  SMTP_USER: z.string().min(1),
  SMTP_PASSWORD: z.string().min(1),
  SMTP_FROM: z.email(),
  SMTP_FROM_NAME: z.string().min(1),

  WORKER_SECRET: z.string().min(16),

  AI_PROVIDER: z.enum(['anthropic', 'openai']).default('anthropic'),
  AI_API_KEY: z.string().min(1),
  AI_MODEL_CHAT: z.string().min(1),
  AI_MODEL_REASONING: z.string().min(1),
  AI_MODEL_FAST: z.string().min(1),
  AI_EMBEDDING_MODEL: z.string().min(1),

  TOKEN_SIGNING_SECRET: z.string().min(32),
})

export type ServerEnv = z.infer<typeof schema>

let cached: ServerEnv | null = null

/**
 * Reads and validates the server environment. Throws a readable error naming
 * every missing or malformed variable, so a misconfigured deployment fails at
 * the first request rather than halfway through a workflow.
 */
export function serverEnv(): ServerEnv {
  if (cached) return cached

  const parsed = schema.safeParse(process.env)
  if (!parsed.success) {
    throw new Error(
      `Invalid server environment:\n${z.prettifyError(parsed.error)}\n` +
        'Copy .env.example to .env.local and fill in the missing values.',
    )
  }

  cached = parsed.data
  return cached
}

/**
 * Test seam: drops the cached environment so the next call re-reads
 * `process.env`.
 *
 * Without this, a test that stubs an environment variable would be silently
 * ignored whenever some earlier code path had already populated the cache —
 * and the test would pass or fail depending on execution order rather than on
 * what it asserts.
 */
export function resetServerEnv(): void {
  cached = null
}
