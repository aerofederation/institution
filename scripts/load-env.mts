import path from 'node:path'

/**
 * Loads local environment files for scripts run outside Next.js.
 *
 * Order matters: `.env.local` is read first and wins, because Node's
 * `loadEnvFile` (like `--env-file`) never overwrites a variable that is already
 * set. `.env` then fills in anything the local file did not define. A variable
 * exported in the shell beats both, which is what you want in CI.
 *
 * Missing files are not an error — a developer may keep everything in one file
 * or in the shell. Uses the built-in loader rather than a dependency.
 *
 * Import this FIRST in any script that reads process.env.
 */
const ROOT = path.resolve(import.meta.dirname, '..')

for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(path.join(ROOT, file))
  } catch {
    // Absent or unreadable. Both are legitimate.
  }
}

export {}
