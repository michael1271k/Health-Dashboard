'use client'

import { useCallback, useRef } from 'react'

/**
 * Touch-friendly double-tap detector. `onDoubleClick` doesn't fire reliably on
 * touch, so this collapses two taps within `delay` ms into one callback. Returns
 * an onClick handler to spread onto the target.
 */
export function useDoubleTap(onDoubleTap: () => void, delay = 320) {
  const last = useRef(0)
  return useCallback(() => {
    const now = Date.now()
    if (now - last.current > 0 && now - last.current < delay) {
      last.current = 0
      onDoubleTap()
    } else {
      last.current = now
    }
  }, [onDoubleTap, delay])
}

/**
 * A control that does DIFFERENT things on single vs double tap. The single-tap
 * action is deferred by `delay` ms so a second tap can pre-empt it — used by the
 * dashboard Body card (tap = open the composition popup, double-tap = jump to the
 * Nexus InBody entry for today). Returns an onClick handler to spread onto the target.
 */
export function useSingleOrDoubleTap(onSingleTap: () => void, onDoubleTap: () => void, delay = 300) {
  const last = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  return useCallback(() => {
    const now = Date.now()
    if (last.current && now - last.current < delay) {
      last.current = 0
      if (timer.current) { clearTimeout(timer.current); timer.current = null }
      onDoubleTap()
    } else {
      last.current = now
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => { last.current = 0; timer.current = null; onSingleTap() }, delay)
    }
  }, [onSingleTap, onDoubleTap, delay])
}
