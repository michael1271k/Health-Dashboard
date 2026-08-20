import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { ExpirationPlugin, StaleWhileRevalidate, Serwist } from 'serwist'

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
    // ── The cold start ────────────────────────────────────────────────────
    // Navigations were NetworkFirst with a 4s timeout, so every launch waited
    // on the document before painting anything — on native especially, where
    // `capacitor.config.ts` points the shell at the Netlify deploy and a cold
    // start is a real remote page load. Meanwhile all 137 precached chunks the
    // document references were already sitting on disk. The app was network-
    // bound on the one request it did not need to be.
    //
    // Stale-while-revalidate paints the shell from disk immediately and fetches
    // the fresh copy behind it, so the NEXT launch is current.
    //
    // ⚠ THIS REINTRODUCES A STALE-SHELL WINDOW, which is why NetworkFirst was
    // chosen: a shell from before a deploy can reference chunks that no longer
    // exist, and the failure is the React #130 "element type is an object"
    // crash. Two things close it, and BOTH must stay:
    //
    //   1. the version gate in SerwistRegister — it fetches /api/version on
    //      idle after every boot and on every foreground, and on a mismatch
    //      purges every cache and reloads. A stale shell survives seconds, not
    //      a session. If that gate is ever removed, this must go back to
    //      NetworkFirst in the same commit.
    //
    //      NARROWED 2026-08-20: the gate now declines to act while the app is
    //      hidden, while a live workout draft exists, or while offline — a
    //      cache purge you cannot finish deletes the only shell able to render,
    //      and a reload fired into a backgrounding iOS webview is the black
    //      screen on resume. The gate is therefore DEFERRED, never skipped: it
    //      re-checks on the next foreground, so a stale shell survives until the
    //      user racks the bar rather than seconds. That window is the price of
    //      never blanking mid-set, and it is the right trade.
    //   2. `skipWaiting` + `clientsClaim` below, so a new worker takes over
    //      without waiting for every tab to close.
    //
    // Revert = swap StaleWhileRevalidate back to NetworkFirst. Nothing else
    // depends on the change.
    {
      matcher: ({ request }) => request.mode === 'navigate',
      handler: new StaleWhileRevalidate({
        cacheName: 'helix-pages',
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
