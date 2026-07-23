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
