import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { ExpirationPlugin, NetworkFirst, Serwist } from 'serwist'

declare global {
  interface ServiceWorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Navigations are ALWAYS network-first: the app shell can never go stale
    // across a deploy (the historical stale-shell → module-mismatch crash).
    // The cached copy serves only as the offline fallback.
    {
      matcher: ({ request }) => request.mode === 'navigate',
      handler: new NetworkFirst({
        cacheName: 'helix-pages',
        networkTimeoutSeconds: 4,
        // Bounded. Without expiry every authenticated URL ever navigated to
        // (/day/2026-08-01, /session/<uuid>) stayed cached forever and was
        // still served offline after signing out.
        plugins: [new ExpirationPlugin({ maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 7 })],
      }),
    },
    ...defaultCache,
  ],
})

serwist.addEventListeners()
