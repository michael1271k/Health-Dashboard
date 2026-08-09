'use client'

import { useSyncExternalStore } from 'react'

/**
 * ONE boolean for "should this animate?".
 *
 * HELIX has always had two reduced-motion signals that never knew about each
 * other:
 *
 *   1. the OS query, `prefers-reduced-motion: reduce`, which framer's own
 *      useReducedMotion() reads — consumed by template.tsx and AnimatedBento;
 *   2. an in-app Settings toggle, persisted as `helix_reduce_motion`, written
 *      to `html[data-reduce-motion]` before first paint by the inline script in
 *      layout.tsx and backed by user_goals.reduce_motion in the database —
 *      consumed by globals.css, KineticNumber and LiquidModal.
 *
 * So a user who flipped the in-app switch still got sprung route transitions,
 * and a user with the OS setting on still got a fully animated LiquidModal.
 * Neither honoured the other. This hook is the bridge: either signal alone is
 * enough to mean "reduce".
 *
 * Subscribed rather than polled, and computed at render rather than in an
 * effect — which fixes a real bug in LiquidModal, where the flag was read in a
 * useEffect keyed on `open`, so the FIRST modal of every session animated in
 * full regardless of the setting.
 */

const OS_QUERY = '(prefers-reduced-motion: reduce)'

function subscribeToBoth(onChange: () => void): () => void {
  const media = window.matchMedia(OS_QUERY)
  media.addEventListener('change', onChange)

  // The in-app flag lives on <html> and is written by the pre-paint script and
  // by Settings. An attribute observer is the only way to see both.
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributeFilter: ['data-reduce-motion'] })

  return () => {
    media.removeEventListener('change', onChange)
    observer.disconnect()
  }
}

function readReducedMotion(): boolean {
  return (
    window.matchMedia(OS_QUERY).matches ||
    document.documentElement.dataset.reduceMotion === 'true'
  )
}

/**
 * True when EITHER the OS setting or the in-app Settings toggle asks for less
 * motion. Server-renders as `false` so the markup matches a fresh client that
 * has not yet run the pre-paint script.
 */
export function useHelixReducedMotion(): boolean {
  return useSyncExternalStore(subscribeToBoth, readReducedMotion, () => false)
}

const TRANSPARENCY_QUERY = '(prefers-reduced-transparency: reduce)'

function subscribeToTransparency(onChange: () => void): () => void {
  const media = window.matchMedia(TRANSPARENCY_QUERY)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

/**
 * True when the user has asked for less transparency. Translucent chrome should
 * become frostier — raise the background opacity and drop the blur — rather
 * than disappear. There is no in-app equivalent of this one.
 */
export function useReducedTransparency(): boolean {
  return useSyncExternalStore(
    subscribeToTransparency,
    () => window.matchMedia(TRANSPARENCY_QUERY).matches,
    () => false,
  )
}
