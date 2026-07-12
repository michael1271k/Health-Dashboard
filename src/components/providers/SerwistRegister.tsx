'use client'

import { useEffect } from 'react'

const LOADED_AT = Date.now()
const LAUNCH_WINDOW_MS = 5000
const VERSION_FLAG = 'helix_version_reloaded'

/**
 * Service-worker lifecycle + deploy-drift protection.
 *
 * A PWA that was open (or cached) across a deploy holds a stale bundle whose
 * lazy chunks no longer exist on the server — the root cause of the historical
 * "error flash on open". Two coordinated defenses make that state unreachable:
 *
 * 1. Controller-change reload policy: within the first seconds of a launch a
 *    reload is imperceptible, so when a NEW service worker takes control inside
 *    the launch window we reload IMMEDIATELY. Only genuinely mid-session
 *    updates defer to the next hide — never yanking a live foreground session.
 *
 * 2. Version gate: the client's inlined build id is compared against
 *    /api/version (no-store) on boot and on foreground. A mismatch = a deploy
 *    landed under us → one guarded reload BEFORE the stale module graph can
 *    throw. sessionStorage-flagged so a broken network can't reload-loop.
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
        if (buildId && buildId !== 'unknown' && buildId !== myBuild) {
          if (sessionStorage.getItem(VERSION_FLAG) === buildId) return // already tried for this deploy
          sessionStorage.setItem(VERSION_FLAG, buildId)
          window.location.reload()
        }
      } catch { /* offline — the SW keeps serving the consistent cached pair */ }
      finally { checking = false }
    }
    void check()
    const onVisible = () => { if (document.visibilityState === 'visible') void check() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  // SW registration + controller-change reload policy.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const hadController = !!navigator.serviceWorker.controller
    let reloading = false
    const reload = () => { if (!reloading) { reloading = true; window.location.reload() } }

    const onControllerChange = () => {
      if (reloading) return
      if (!hadController) return // first-ever takeover of a fresh tab needs no reload
      const inLaunchWindow = Date.now() - LOADED_AT < LAUNCH_WINDOW_MS
      if (inLaunchWindow || document.visibilityState === 'hidden') {
        reload() // imperceptible at launch / while hidden
      } else {
        // Mid-session update: defer to the next hide — never yank a live session.
        const onHide = () => { if (document.visibilityState === 'hidden') reload() }
        document.addEventListener('visibilitychange', onHide, { once: true })
      }
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    navigator.serviceWorker.register('/sw.js').then((registration) => {
      // Proactively check for a new worker on every mount (app foreground).
      registration.update().catch(() => {})
    }).catch((err) => console.error('SW registration failed:', err))

    return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
  }, [])

  return null
}
