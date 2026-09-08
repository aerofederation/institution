import { z } from 'zod'

/**
 * Client-safe environment.
 *
 * Validated lazily rather than at module load. A top-level throw would fire
 * while `next build` collects page data — before any request exists — turning a
 * missing variable into a broken build instead of a clear runtime error, and
 * making the build depend on deployment configuration it should not need.
 *
 * Next.js only inlines `process.env.NEXT_PUBLIC_*` where the property is read
 * as a static literal, so every value below is referenced explicitly rather
 * than spread from `process.env`.
 */
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.url(),
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default('Aero Federation of India'),
})

export type PublicEnv = z.infer<typeof schema>

let cached: PublicEnv | null = null

export function publicEnv(): PublicEnv {
  if (cached) return cached

  const parsed = schema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  })

  if (!parsed.success) {
    throw new Error(
      `Invalid public environment:\n${z.prettifyError(parsed.error)}\n` +
        'Copy .env.example to .env.local and fill in the missing values.',
    )
  }

  cached = parsed.data
  return cached
}
