'use client'

import { useEffect } from 'react'

/**
 * ── THE CHEAPEST FIX FOR THE IDLE BLACK SCREEN ───────────────────────────────
 *
 * The native shell points at a REMOTE url (`capacitor.config.ts`), so the web
 * layer is a WKWebView loading over the network. iOS jetsams a backgrounded
 * WKWebView's content process after a few minutes, and Capacitor's default
 * handler answers that by calling `webView.reload()` — a real navigation, in a
 * gym, on the connection a gym has. When it fails there is nothing to paint but
 * `ios.backgroundColor`, which is `#0A0B0D`. That is the frozen black screen.
 *
 * Every other defence (the bundled `offline.html`, the reload guards in
 * `SerwistRegister`, the draft flush) exists to survive that kill. This one
 * removes its trigger: while a session is live the screen never sleeps, so the
 * app is never backgrounded by the lock screen in the first place.
 *
 * Screen Wake Lock reached WKWebView in iOS 16.4. Feature-detected, so nothing
 * breaks on an older OS or on a desktop browser that never shipped it — and it
 * needs no Capacitor plugin, which is the whole reason it is used instead of
 * `@capacitor-community/keep-awake`.
 *
 * The lock is dropped by the system on every background/lock, so it MUST be
 * re-requested when the page becomes visible again — a one-shot request at
 * mount silently stops working after the first interruption.
 *
 * ── AND IT MUST NOT BE HELD FOREVER ──────────────────────────────────────────
 *
 * The caller is `LiveSessionPill`, which lives in the ROOT LAYOUT so the lock
 * survives navigating away from `/session`. That placement is deliberate and
 * load-bearing. What it also meant, while the predicate was a bare
 * `!!draft`, is that a workout abandoned without tapping Finish left a draft in
 * localStorage and the screen then refused to sleep ON EVERY ROUTE, INDEFINITELY
 * — the single largest battery item in the app, and invisible because the
 * symptom (a phone that does not dim) never points at a fitness app's dashboard.
 *
 * So the lock now carries a deadline. `activeSince` is the draft's last CONTENT
 * change (`SessionDraft.touchedAt`, which deliberately does not move on a
 * background flush). `IDLE_RELEASE_MS` past that, the lock is released and not
 * re-taken; the next real edit gives the effect a new `activeSince`, which
 * re-acquires and re-arms. No polling — one timer per touch.
 *
 * 20 minutes: longer than any rest interval this app prescribes (`restTargets`
 * tops out well under it), short enough that a deck left open in a locker is
 * not still burning the screen an hour later.
 */
const IDLE_RELEASE_MS = 20 * 60 * 1000

export function useWakeLock(enabled: boolean, activeSince?: string | null) {
  useEffect(() => {
    if (!enabled) return
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinelLike> } }
    if (!nav.wakeLock) return

    // No stamp at all (a draft written before `touchedAt` existed) is treated as
    // "touched now" rather than "expired": failing open keeps a live workout's
    // screen on, and the very next edit writes a real stamp.
    const since = activeSince ? Date.parse(activeSince) : Date.now()
    const deadline = Number.isFinite(since) ? since + IDLE_RELEASE_MS : Date.now() + IDLE_RELEASE_MS
    if (Date.now() >= deadline) return

    let sentinel: WakeLockSentinelLike | null = null
    let cancelled = false
    let expiry: ReturnType<typeof setTimeout> | null = null

    const release = () => {
      const s = sentinel
      sentinel = null
      void s?.release?.().catch(() => {})
    }

    const acquire = async () => {
      if (cancelled || sentinel || document.visibilityState !== 'visible') return
      if (Date.now() >= deadline) { cancelled = true; return }
      try {
        const s = await nav.wakeLock!.request('screen')
        if (cancelled) { void s.release?.() ; return }
        sentinel = s
        // The system releases it on background; clear our handle so the next
        // foreground re-requests rather than believing it still holds one.
        s.addEventListener?.('release', () => { sentinel = null })
      } catch {
        /* denied (low battery, no user gesture yet) — the session still works */
      }
    }

    const onVisible = () => { if (document.visibilityState === 'visible') void acquire() }
    void acquire()
    document.addEventListener('visibilitychange', onVisible)
    // Fires once, at the deadline. `cancelled` stops the visibility handler from
    // taking the lock back on the next foreground.
    expiry = setTimeout(() => { cancelled = true; release() }, deadline - Date.now())

    return () => {
      cancelled = true
      if (expiry) clearTimeout(expiry)
      document.removeEventListener('visibilitychange', onVisible)
      release()
    }
  }, [enabled, activeSince])
}

/**
 * Minimal structural type. `WakeLockSentinel` is only in newer lib.dom builds
 * and this hook must compile the same on every one of them.
 */
interface WakeLockSentinelLike {
  release?: () => Promise<void>
  addEventListener?: (type: 'release', listener: () => void) => void
}
