'use client'

import { useEffect } from 'react'

/**
 * Registers the service worker AND makes sure an already-open PWA tab never
 * keeps running stale JS after a new deploy. Without the controllerchange
 * reload, skipWaiting+clientsClaim on the SW side still leaves the currently
 * executing page running old chunks against a new server — the classic
 * "site crashes right after I deploy, but only for people who already had it
 * open" bug. One reload (guarded so it only ever fires once per tab) fixes it.
 */
export function SerwistRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const hadController = !!navigator.serviceWorker.controller
    let reloading = false
    const onControllerChange = () => {
      if (reloading) return
      // First-ever SW take-over of a fresh tab needs no reload; and NEVER yank a
      // live foreground session (that races React mid-render → error boundary).
      // Reload immediately only while hidden; otherwise defer to the next hide.
      if (!hadController) return
      if (document.visibilityState === 'hidden') {
        reloading = true
        window.location.reload()
      } else {
        const onHide = () => {
          if (reloading) return
          if (document.visibilityState === 'hidden') { reloading = true; window.location.reload() }
        }
        document.addEventListener('visibilitychange', onHide, { once: true })
      }
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    navigator.serviceWorker.register('/sw.js').then((registration) => {
      // Proactively check for a waiting/new worker on every mount (app foreground).
      registration.update().catch(() => {})
    }).catch((err) => console.error('SW registration failed:', err))

    return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
  }, [])
  return null
}
