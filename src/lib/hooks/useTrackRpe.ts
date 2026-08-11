'use client'

import { useSyncExternalStore } from 'react'

/**
 * "Should the deck ask about effort?" — one boolean, OFF by default.
 *
 * WHY THIS IS OPT-IN
 * Hevy's CSV export carries no RPE (`hevy/parse.ts` declares `HevySet.rpe` and
 * never assigns it — the field is dead). Helix is not open during the workout,
 * so every value is typed by hand afterwards, from memory. That is a real thing
 * some people want and most do not, and a control nobody uses is clutter on the
 * one screen that has no spare width. Off unless asked for.
 *
 * WHY LOCALSTORAGE IS THE SOURCE FOR READS
 * The deck reads this during render, on every set row. A query would make it
 * async and a context would re-render the whole tree on a toggle. The mirror is
 * written by Settings and by `hydratePrefsFromDb` on sign-in, exactly like
 * `helix_units` and `helix_reduce_motion` — `user_goals.track_rpe` remains the
 * cross-device source of truth, this is the synchronous local copy of it.
 */

export const TRACK_RPE_KEY = 'helix_track_rpe'
export const TRACK_RPE_EVENT = 'helix-track-rpe-change'

/** Synchronous read, for non-React callers. */
export function getTrackRpe(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(TRACK_RPE_KEY) === '1'
}

/** Write the mirror and tell every subscriber in this tab. */
export function setTrackRpeMirror(on: boolean): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(TRACK_RPE_KEY, on ? '1' : '0')
  window.dispatchEvent(new Event(TRACK_RPE_EVENT))
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(TRACK_RPE_EVENT, onChange)
  // `storage` only fires in OTHER tabs, which is exactly the case the custom
  // event cannot cover.
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(TRACK_RPE_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

/**
 * True when per-exercise effort logging is switched on. Server-renders as
 * `false` so the markup matches a fresh client that has not read localStorage —
 * and `false` is also the default, so the common case never flickers.
 */
export function useTrackRpe(): boolean {
  return useSyncExternalStore(subscribe, getTrackRpe, () => false)
}
