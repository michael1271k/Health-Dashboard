'use client'

import { Capacitor } from '@capacitor/core'

/**
 * `helix://open?path=/nutrition` → a route push.
 *
 * ── WHY WIDGETS NEEDED THIS ──────────────────────────────────────────────────
 * A widget is a shortcut with a preview attached. Every face used to open the
 * app's home screen, which means tapping the calorie ring COST you a navigation
 * instead of saving you one — and a shortcut that lands you further from what
 * you tapped is not a shortcut. Each face now names a destination
 * (the widget bundle in native/HelixNativeWidgets) and this is the half
 * that receives it.
 *
 * ── WHY A QUERY PARAMETER AND NOT A HOST ─────────────────────────────────────
 * `helix://nutrition/micros` parses as host `nutrition` + path `/micros`, so the
 * destination arrives in two pieces that have to be glued back together — and
 * a one-segment link (`helix://nutrition`) then has an EMPTY path, which is
 * indistinguishable from the home screen. `helix://open?path=…` keeps the
 * destination as one opaque string that is exactly what the router wants.
 */

/** Only these prefixes may be pushed. See `safePath` for why this is a list. */
const ALLOWED = [
  '/', '/nutrition', '/pathfinder', '/reports', '/settings', '/workout', '/session', '/day',
]

/**
 * The path a `helix://` URL asks for, or null.
 *
 * ── AN ALLOW-LIST, NOT A SANITISER ───────────────────────────────────────────
 * A custom URL scheme is callable by anything on the device that can open a URL
 * — another app, a web page, a QR code — so the string arriving here is
 * untrusted input, not something only our own widget can produce. Rejecting
 * absolute URLs and `..` would cover today's known tricks; naming the routes
 * that exist covers the ones nobody has thought of, and the app has nine of them.
 */
export function safePath(raw: string | null | undefined): string | null {
  if (!raw) return null
  let path: string
  try {
    const url = new URL(raw, 'helix://open')
    if (url.protocol !== 'helix:') return null
    path = url.searchParams.get('path') ?? ''
  } catch {
    return null
  }
  if (!path.startsWith('/')) return null
  // `//evil.example` is a protocol-relative URL, which a router will happily
  // treat as an external origin.
  if (path.startsWith('//')) return null
  const [clean] = path.split(/[?#]/)
  const root = '/' + (clean.split('/')[1] ?? '')
  if (!ALLOWED.includes(clean) && !ALLOWED.includes(root)) return null
  return path
}

/**
 * Listen for widget taps. Returns an unsubscribe; inert on the web.
 *
 * `push` is injected rather than imported so this module stays free of
 * `next/navigation` — the same reason `sync.ts` takes an `onSynced` callback.
 */
export function initDeepLinks(push: (path: string) => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => {}

  let remove: (() => void) | undefined
  let cancelled = false

  void (async () => {
    try {
      const { App } = await import('@capacitor/app')

      // A COLD launch delivers the URL through `getLaunchUrl`, not through the
      // listener — the app was not running when the tap happened, so there was
      // nothing subscribed to fire. Without this, tapping a widget on a killed
      // app opens the home screen and the deep link is silently lost, which is
      // the most common way a widget tap actually happens.
      const launch = await App.getLaunchUrl().catch(() => null)
      const initial = safePath(launch?.url)
      if (initial && !cancelled) push(initial)

      const handle = await App.addListener('appUrlOpen', ({ url }) => {
        const path = safePath(url)
        if (path) push(path)
      })
      if (cancelled) { void handle.remove(); return }
      remove = () => { void handle.remove() }
    } catch {
      /* @capacitor/app unavailable — taps just open the app, as before */
    }
  })()

  return () => { cancelled = true; remove?.() }
}
