'use client'

import { useEffect, useLayoutEffect } from 'react'

/**
 * ── WHERE YOU LEFT EACH TAB ──────────────────────────────────────────────────
 *
 * `grep -r scrollRestoration src/` returned nothing before this file existed, and
 * `app/template.tsx` remounts the entire page subtree on every navigation — so
 * every return to a tab dropped the user at the top of it. Scroll half way down
 * a month of Pathfinder, open a day, come back: the top.
 *
 * That is not what a tab bar does. On iOS the five tabs are five screens that
 * all exist at once; switching is looking at a different one, and it keeps its
 * offset. This is the smallest honest approximation of that with one live tree.
 *
 * ── WHY A MODULE SINGLETON AND NOT STATE ─────────────────────────────────────
 * The component that would hold it is exactly the one that remounts. A `useRef`
 * or `useState` in `template.tsx` is destroyed at the moment the value is
 * needed. This map lives as long as the JS context, which is the correct scope:
 * a real reload SHOULD start at the top, because it is a new session.
 */
const offsets = new Map<string, number>()

/** How many frames to keep re-applying the offset after a route mounts. */
const SETTLE_FRAMES = 6

export function rememberScroll(pathname: string): void {
  if (typeof window === 'undefined') return
  offsets.set(pathname, window.scrollY)
}

/**
 * Restore this route's offset, and keep restoring it for a few frames.
 *
 * ── THE RETRY IS THE WHOLE MECHANISM ─────────────────────────────────────────
 * A single `scrollTo` on mount is wrong, and it fails silently: at that moment
 * the page is a skeleton. Its queries have not resolved, `DeferredMount` has not
 * fired, the charts have no data and the document is a few hundred pixels tall —
 * so a request to scroll to 1800px is clamped to the bottom of a short page, and
 * by the time the real content arrives the offset is long gone.
 *
 * So it re-applies on each of the next few animation frames, and stops early the
 * moment the browser reports the position it asked for. `SETTLE_FRAMES` is a
 * bound, not a target: six frames is ~100ms, comfortably past a cached paint and
 * far short of anything a user could scroll through on purpose.
 *
 * It also gives up immediately if the user scrolls themselves — fighting a
 * finger for the sake of a remembered offset is worse than forgetting it.
 */
function restoreScroll(pathname: string): () => void {
  const target = offsets.get(pathname)
  if (typeof window === 'undefined' || !target) return () => {}

  let frame = 0
  let raf = 0
  let cancelled = false

  const abort = () => { cancelled = true }
  window.addEventListener('wheel', abort, { passive: true, once: true })
  window.addEventListener('touchstart', abort, { passive: true, once: true })

  const step = () => {
    if (cancelled) return
    window.scrollTo({ top: target, behavior: 'instant' as ScrollBehavior })
    frame += 1
    if (Math.abs(window.scrollY - target) < 2 || frame >= SETTLE_FRAMES) return
    raf = requestAnimationFrame(step)
  }
  raf = requestAnimationFrame(step)

  return () => {
    cancelled = true
    cancelAnimationFrame(raf)
    window.removeEventListener('wheel', abort)
    window.removeEventListener('touchstart', abort)
  }
}

/**
 * Remember this route's offset on the way out and restore it on the way in.
 *
 * Mounted by `app/template.tsx`, which App Router remounts per navigation — so
 * "on the way out" is this effect's cleanup, which is the last moment the old
 * route's scroll position still exists.
 */
export function useScrollMemory(pathname: string): void {
  // `useLayoutEffect` for the restore: a paint at the top followed by a jump is
  // the flicker this exists to avoid.
  useLayoutEffect(() => restoreScroll(pathname), [pathname])

  useEffect(() => {
    // iOS kills a backgrounded WKWebView's content process without running React
    // cleanup, so `pagehide` is the only guaranteed capture on that path.
    const capture = () => rememberScroll(pathname)
    window.addEventListener('pagehide', capture)
    return () => {
      window.removeEventListener('pagehide', capture)
      capture()
    }
  }, [pathname])
}
