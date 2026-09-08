/**
 * Test stub for the `server-only` package.
 *
 * `server-only` exists to make importing a server module from a Client
 * Component a build error. Vitest resolves the react-server condition and hits
 * that guard, so unit tests aliased it to this no-op — the protection still
 * applies where it matters, which is the Next.js build.
 */
export {}
