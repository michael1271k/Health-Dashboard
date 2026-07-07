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
    let reloading = false
    const onControllerChange = () => {
      if (reloading) return
      reloading = true
      window.location.reload()
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
