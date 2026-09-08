import * as React from 'react'

const MOBILE_BREAKPOINT = 768
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function subscribe(onStoreChange: () => void) {
  const mql = window.matchMedia(MOBILE_QUERY)
  mql.addEventListener('change', onStoreChange)
  return () => mql.removeEventListener('change', onStoreChange)
}

function getSnapshot() {
  return window.matchMedia(MOBILE_QUERY).matches
}

function getServerSnapshot() {
  // There is no viewport on the server, so render the desktop layout and let
  // hydration correct it. Matches the previous behaviour of this hook.
  return false
}

/**
 * Tracks the mobile breakpoint via `useSyncExternalStore`, which is the correct
 * primitive for subscribing to an external store such as `matchMedia`. It also
 * avoids the cascading render that a `setState`-in-effect implementation causes
 * on every mount.
 */
export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
