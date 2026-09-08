/**
 * A production build that cannot disturb a running dev server.
 *
 *     npm run build:check
 *
 * `next dev` and `next build` both write to `.next`. Running a build while the
 * dev server is up replaces its route manifest, after which the dev server
 * serves 404s for routes that plainly exist and every Server Action fails
 * silently — the request never reaches the action, so nothing is logged and
 * nothing throws. It presents as a bug in whatever you were clicking.
 *
 * This points the build at its own directory instead, so "does it still
 * compile" is safe to ask while somebody is using the app.
 *
 * `npm run build` is unchanged and still writes to `.next` — that is what a
 * deploy expects.
 */

import { execSync } from 'node:child_process'

execSync('npx next build', {
  stdio: 'inherit',
  env: { ...process.env, NEXT_DIST_DIR: '.next-build' },
})
