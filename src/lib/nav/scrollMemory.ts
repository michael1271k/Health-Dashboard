'use client'

import { useLayoutEffect } from 'react'

/**
 * ── WHERE YOU LEFT EACH TAB ──────────────────────────────────────────────────
 *
 * `app/template.tsx` remounts the entire page subtree on every navigation, so
 * without this every return to a tab drops the user at the top of it. Scroll
 * half way down a month of Pathfinder, open a day, come back: the top. That is
 * not what a tab bar does — on iOS the five tabs are five screens that all
 * exist at once, and switching is looking at a different one.
 *
 * ── THE FIRST VERSION OF THIS FILE DID NOT WORK, AND THE REASON IS ORDERING ──
 *
 * It captured the outgoing offset in a passive-effect CLEANUP:
 *
 *     useEffect(() => () => rememberScroll(pathname), [pathname])
 *
 * which reads correctly and is wrong. In one commit React runs, in this order:
 * layout-effect cleanups of the removed tree, layout effects of the new tree,
 * then PASSIVE cleanups of the removed tree, then passive effects of the new
 * tree. App Router also resets the document to the top inside that same commit.
 * So by the time the capture ran, `window.scrollY` was no longer the offset of
 * the page being left — it was 0. Every tab stored 0, `restoreScroll` treated
 * that as "nothing remembered", and the feature was a no-op that cost six
 * forced reflows per navigation.
 *
 * The fix is to stop capturing at navigation time at all. The offset is
 * recorded WHILE THE USER SCROLLS, from one passive listener, so by the moment
 * of the navigation the value has been correct for however long the finger has
 * been off the glass. No effect ordering to get right, and nothing to run on
 * the navigation's critical path.
 *
 * ── WHY A MODULE SINGLETON AND NOT STATE ─────────────────────────────────────
 * The component that would hold it is exactly the one that remounts. A `useRef`
 * or `useState` in `template.tsx` is destroyed at the moment the value is
 * needed. This map lives as long as the JS context, which is the correct scope:
 * a real reload SHOULD start at the top, because it is a new session.
 */
const offsets = new Map<string, number>()

/** The route currently on screen — the key the scroll listener writes to. */
let current: string | null = null

/**
 * True from the instant a route mounts until its restore has settled.
 *
 * The window between "new route mounted" and "content arrived" contains scroll
 * events that are not the user: App Router's own reset to the top, and our own
 * `scrollTo`. Recording those would overwrite a good offset with 0 — the exact
 * bug the passive-cleanup version had, arriving by a different road.
 */
let settling = false

/** Offsets below this are indistinguishable from the top; not worth restoring. */
const MIN_OFFSET = 8

/**
 * How long a restore keeps waiting for late content (ms).
 *
 * A route mounts as a skeleton: queries unresolved, `DeferredMount` not fired,
 * charts empty, document a few hundred pixels tall. A `scrollTo(1800)` against
 * that is clamped to the bottom of a short page and silently lost. The previous
 * version waited six animation frames (~100ms), which is not remotely long
 * enough for a Supabase round trip — so even with the ordering bug fixed it
 * would have failed on every page whose height depends on data.
 */
const SETTLE_MS = 900

let listening = false

function onScroll(): void {
  if (settling || current === null) return
  // Free: scroll events are dispatched after layout, so this reads a clean
  // value without forcing anything.
  offsets.set(current, window.scrollY)
}

function listen(): void {
  if (listening || typeof window === 'undefined') return
  listening = true
  window.addEventListener('scroll', onScroll, { passive: true })
}

/**
 * Put this route back where it was, and keep trying while the page grows.
 *
 * ── IT WAITS ON HEIGHT, NOT ON FRAMES ────────────────────────────────────────
 * The old loop re-applied the offset on each of the next six animation frames.
 * Two problems: it was over long before async content landed, and every one of
 * those frames did `scrollTo` then read `scrollY` back, which is a forced
 * synchronous layout during the single most expensive moment in a navigation —
 * the new route's first mount. Six of them, on every route change. That is the
 * "heavier and stuck" feeling, and it was pure cost for a feature that was not
 * working.
 *
 * A `ResizeObserver` on the document element fires exactly when the page grows,
 * which is exactly when a previously-clamped offset becomes reachable — and at
 * no other time. Between arrivals it costs nothing at all. Its callback runs
 * after layout, so the `scrollY` read inside it is free too.
 *
 * It gives up immediately if the user scrolls themselves: fighting a finger for
 * the sake of a remembered offset is worse than forgetting it.
 */
function restoreScroll(pathname: string): () => void {
  if (typeof window === 'undefined') return () => {}

  current = pathname
  listen()

  const target = offsets.get(pathname) ?? 0
  if (target < MIN_OFFSET) {
    settling = false
    return () => {}
  }

  settling = true
  let done = false
  let observer: ResizeObserver | null = null
  let timer = 0

  const stop = () => {
    if (done) return
    done = true
    settling = false
    observer?.disconnect()
    if (timer) clearTimeout(timer)
    window.removeEventListener('wheel', abort)
    window.removeEventListener('touchstart', abort)
    window.removeEventListener('keydown', abort)
  }

  // The user moved. Their intent outranks the remembered offset, and whatever
  // they scroll to from here is the new one — so release the capture lock.
  function abort() { stop() }

  const apply = () => {
    if (done) return
    window.scrollTo({ top: target, behavior: 'instant' as ScrollBehavior })
  }

  apply()

  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => {
      apply()
      // Reached it — the page is now tall enough and the offset is honoured.
      if (Math.abs(window.scrollY - target) < 2) stop()
    })
    observer.observe(document.documentElement)
  }

  timer = window.setTimeout(stop, SETTLE_MS)
  window.addEventListener('wheel', abort, { passive: true })
  window.addEventListener('touchstart', abort, { passive: true })
  window.addEventListener('keydown', abort)

  return stop
}

/**
 * Remember this route's offset continuously, and restore it on the way in.
 *
 * Mounted by `app/template.tsx`. The restore is a layout effect because a paint
 * at the top followed by a jump is the flicker this exists to avoid; the
 * capture is not an effect at all any more (see the note at the top).
 */
export function useScrollMemory(pathname: string): void {
  useLayoutEffect(() => restoreScroll(pathname), [pathname])
}
