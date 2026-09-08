'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type SaveState = 'idle' | 'saving' | 'saved' | 'failed'

/**
 * Debounced autosave with a reportable state.
 *
 * Two things it deliberately does not do.
 *
 * It does not write on every keystroke — `delay` collapses a burst of typing
 * into one request. A teacher writing a paragraph of instructions should cause
 * one write, not two hundred.
 *
 * It does not report success it has not had. `failed` stays until a later save
 * succeeds, so a teacher whose connection dropped sees that their last change
 * did not land rather than a stale "Saved".
 *
 * The save function is held in a ref so `trigger` is stable across renders —
 * otherwise every render would replace the callback, and an in-flight debounce
 * would be discarded. That is the usual way autosave quietly stops working.
 */
export function useAutosave(
  save: () => Promise<{ ok: boolean; message?: string }>,
  { delay = 900, onError }: { delay?: number; onError?: (message: string) => void } = {},
) {
  const [state, setState] = useState<SaveState>('idle')

  const saveRef = useRef(save)
  const errorRef = useRef(onError)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const alive = useRef(true)

  /*
   * Refreshed in an effect rather than during render. Writing a ref while
   * rendering is impure — React may render more than once, and a render that is
   * thrown away would still have mutated it. No dependency array, so this runs
   * after every commit and the callbacks are always the latest ones by the time
   * an event handler can reach them.
   */
  useEffect(() => {
    saveRef.current = save
    errorRef.current = onError
  })

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      clearTimeout(timer.current)
    }
  }, [])

  const trigger = useCallback(() => {
    clearTimeout(timer.current)
    setState('saving')

    timer.current = setTimeout(async () => {
      const result = await saveRef.current()

      // The component may have unmounted while the request was in flight.
      if (!alive.current) return

      setState(result.ok ? 'saved' : 'failed')
      if (!result.ok && result.message) errorRef.current?.(result.message)
    }, delay)
  }, [delay])

  return { state, trigger }
}
