'use client'

import { useEffect } from 'react'
import { peekSessionDraft } from '@/lib/sessions/draft'

const LOADED_AT = Date.now()
const LAUNCH_WINDOW_MS = 5000
const VERSION_FLAG = 'helix_version_reloaded'

/**
 * A reload is only ever safe when the app is VISIBLE and there is no live
 * workout on screen.
 *
 * Both halves were learned the hard way. Reloading a hidden webview means iOS
 * suspends the process mid-navigation and you resume onto a half-loaded, blank
 * document — this file used to do that deliberately, on the theory that a
 * reload nobody is watching is free. It is not free on a remote-url native
 * shell. And a reload during a session throws away the deck the user is
 * standing in front of, for an update that can wait until they rack the bar.
 */
function safeToReload(): boolean {
  if (document.visibilityState !== 'visible') return false
  try { if (peekSessionDraft()) return false } catch { /* storage blocked — treat as safe */ }
  return true
}

/**
 * Service-worker lifecycle + deploy-drift protection.
 *
 * A PWA that was open (or cached) across a deploy holds a stale bundle whose
 * lazy chunks no longer exist on the server — the root cause of the historical
 * "error flash on open". Two coordinated defenses make that state unreachable:
 *
 * 1. Controller-change reload policy: within the first seconds of a launch a
 *    reload is imperceptible, so when a NEW service worker takes control inside
 *    the launch window we reload IMMEDIATELY. Genuinely mid-session updates
 *    wait for a moment when reloading is safe — see `safeToReload`.
 *
 * 2. Version gate: the client's inlined build id is compared against
 *    /api/version (no-store) on boot and on foreground. A mismatch = a deploy
 *    landed under us → one guarded reload BEFORE the stale module graph can
 *    throw. Flagged so a broken network can't reload-loop.
 */
export function SerwistRegister() {
  // Version gate — boot + foreground.
  useEffect(() => {
    const myBuild = process.env.NEXT_PUBLIC_BUILD_ID
    if (!myBuild) return
    let checking = false
    const check = async () => {
      if (checking) return
      checking = true
      try {
        const res = await fetch(`/api/version?t=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) return
        const { buildId } = await res.json() as { buildId?: string }
        if (!buildId || buildId === 'unknown' || buildId === myBuild) return
        // ── THE FLAG LIVES IN localStorage, NOT sessionStorage ──
        // It is a reload-LOOP guard, and the loop it guards against is one that
        // starts with the process being killed — which is exactly what clears
        // sessionStorage. The guard was reliably absent in the only situation
        // it existed for. Keyed by build id, so a genuine new deploy still gets
        // its one attempt.
        if (localStorage.getItem(VERSION_FLAG) === buildId) return
        // A deploy landed, but not at a moment we can act on: leave the flag
        // UNSET so the next safe foreground still catches it.
        if (!safeToReload()) return
        // ── NEVER PURGE WHILE OFFLINE ──
        // The purge deletes the precached shell so the reload cannot be served
        // the stale chunks that caused the mismatch. Offline, that same delete
        // removes the only copy of the app that can still render, and the
        // reload that follows has nothing to load. Gym wifi is exactly this.
        if (!navigator.onLine) return
        localStorage.setItem(VERSION_FLAG, buildId)
        try {
          if ('caches' in window) {
            const keys = await caches.keys()
            await Promise.all(keys.map((k) => caches.delete(k)))
          }
        } catch { /* best-effort */ }
        window.location.reload()
      } catch { /* offline — the SW keeps serving the consistent cached pair */ }
      finally { checking = false }
    }
    // DEFERRED TO IDLE. This fires on every boot and, on a mismatch, deletes
    // every cache and reloads — so the unlucky cold start pays for two. Running
    // it before first paint put a network round trip in front of the first
    // pixel of the ~99% of boots where the build has not changed. Idle keeps
    // the guard (a stale bundle is still caught within a second or two of
    // launch, before the user has done anything) and takes it off the path.
    const ric = typeof window.requestIdleCallback === 'function'
      ? window.requestIdleCallback(() => void check(), { timeout: 3000 })
      : window.setTimeout(() => void check(), 1200)
    const onVisible = () => { if (document.visibilityState === 'visible') void check() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(ric as number)
      else window.clearTimeout(ric as number)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  // SW registration + controller-change reload policy.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const hadController = !!navigator.serviceWorker.controller
    let reloading = false
    let waiting = false
    const reload = () => { if (!reloading) { reloading = true; window.location.reload() } }

    // Retry on every visibility change until the app is both visible and free
    // of a live session. The old version listened `{ once: true }` for the next
    // HIDE and reloaded then — a reload issued into a backgrounding webview,
    // which is the blank-on-resume bug.
    const onMaybeReload = () => {
      if (!waiting || reloading) return
      if (!safeToReload()) return
      document.removeEventListener('visibilitychange', onMaybeReload)
      waiting = false
      reload()
    }

    const onControllerChange = () => {
      if (reloading) return
      if (!hadController) return // first-ever takeover of a fresh tab needs no reload
      const inLaunchWindow = Date.now() - LOADED_AT < LAUNCH_WINDOW_MS
      if (inLaunchWindow && safeToReload()) {
        reload() // imperceptible at launch
        return
      }
      // Mid-session update: hold it until reloading is actually safe.
      if (!waiting) {
        waiting = true
        document.addEventListener('visibilitychange', onMaybeReload)
      }
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    navigator.serviceWorker.register('/sw.js').then((registration) => {
      // Proactively check for a new worker on every mount (app foreground).
      registration.update().catch(() => {})
    }).catch((err) => console.error('SW registration failed:', err))

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
      document.removeEventListener('visibilitychange', onMaybeReload)
    }
  }, [])

  return null
}
