import type { NextConfig } from 'next'

/**
 * `distDir` is overridable so a verification build cannot clobber a running dev
 * server.
 *
 * `next dev` and `next build` both write to `.next` by default, and a build run
 * while the dev server is up replaces the route manifest underneath it. The dev
 * server then serves 404s for routes that plainly exist — including
 * `/auth/confirm` — and every Server Action fails with no error anywhere,
 * because the request never reaches the action. It looks exactly like a bug in
 * whatever you happened to be clicking.
 *
 * `npm run build:check` sets this to a separate directory, so checking that the
 * project compiles is safe while somebody is using the app.
 */
const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
}

export default nextConfig
