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
 */
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinelLike> } }
    if (!nav.wakeLock) return

    let sentinel: WakeLockSentinelLike | null = null
    let cancelled = false

    const acquire = async () => {
      if (cancelled || sentinel || document.visibilityState !== 'visible') return
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

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      const s = sentinel
      sentinel = null
      void s?.release?.().catch(() => {})
    }
  }, [enabled])
}

/**
 * Minimal structural type. `WakeLockSentinel` is only in newer lib.dom builds
 * and this hook must compile the same on every one of them.
 */
interface WakeLockSentinelLike {
  release?: () => Promise<void>
  addEventListener?: (type: 'release', listener: () => void) => void
}
