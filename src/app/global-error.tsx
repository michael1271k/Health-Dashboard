'use client'

import { useEffect, useState } from 'react'

/**
 * Root error boundary — Next.js renders this in place of the ENTIRE root
 * layout when an unhandled exception escapes any client component.
 *
 * Recovery is SILENT: the first attempt per BUILD shows only the branded
 * splash (indistinguishable from a normal launch) while it purges the service
 * worker + caches and reloads onto the fresh bundle. Error text appears ONLY
 * when recovery already ran for this same build — a genuine, reproducible
 * crash — and by then the flight recorder holds the full stack for diagnosis.
 * Keying the flag by build id (not '1') means a session that crashed on an
 * old deploy still gets one fresh silent recovery when the next deploy lands,
 * instead of being stranded on the diagnostic screen.
 *
 * ── THE SILENT PATH IS ONLY SILENT WHEN IT CAN FINISH ────────────────────────
 * Unregistering every service worker and deleting every cache is a repair when
 * the network is there and a demolition when it is not: the branded splash has
 * nothing to reload onto, so it pulses forever on a near-black page — and it
 * has just destroyed the cached shell that was the last thing able to render.
 * On a native build pointed at a remote url, that IS the frozen black screen.
 *
 * So the purge now requires `navigator.onLine`. Offline, we skip straight to
 * the visible screen with a retry the user controls, and the caches survive.
 *
 * The flag also moved to localStorage. It guards a reload loop, and reload
 * loops on iOS begin with the webview's content process being killed — which
 * is precisely what clears sessionStorage, so the guard used to be missing in
 * the one situation it was written for.
 */
const RECOVER_FLAG = 'helix_sw_recovered'
const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? 'unknown'

function canRecoverSilently(): boolean {
  try {
    if (localStorage.getItem(RECOVER_FLAG) === BUILD_ID) return false
  } catch { return false }
  // A purge we cannot complete is worse than no purge at all.
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

/**
 * Drop the service worker and every cache, then reload onto whatever the
 * network serves. Shared by the silent first attempt and the explicit
 * "Reset app data" button, so there is exactly one implementation of the
 * most destructive thing this screen can do.
 */
async function purgeAndReload(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister()))
    }
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
  } catch { /* best-effort */ }
  window.location.reload()
}

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // Computed once per mount: decides between silent splash and diagnostic screen.
  const [silent] = useState(canRecoverSilently)

  useEffect(() => {
    console.error('[GlobalError]', error)
    try { window.localStorage.removeItem('helix_query_cache') } catch { /* ignore */ }

    // Flight recorder: persist the crash so Settings can show EXACTLY what and
    // where — the next report is a diagnosis, not a guess.
    try {
      window.localStorage.setItem('helix_last_crash', JSON.stringify({
        message: error?.message?.slice(0, 500) ?? 'unknown',
        digest: error?.digest ?? null,
        stack: error?.stack?.slice(0, 2000) ?? null,
        buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? 'unknown',
        at: new Date().toISOString(),
      }))
    } catch { /* ignore */ }

    if (!silent) return

    // Stale-bundle self-heal: purge the SW + all caches, reload fresh. The
    // per-build flag prevents a genuine code bug from looping the reload.
    try { localStorage.setItem(RECOVER_FLAG, BUILD_ID) } catch { /* ignore */ }
    void purgeAndReload()
  }, [error, silent])

  return (
    <html lang="en">
      <body style={{ background: '#050608', color: '#ECEEF2', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center' }}>
          {silent ? (
            /* Indistinguishable from a normal launch: brand pulse, no error text. */
            <>
              <style>{'@keyframes helixPulse { 0%,100% { opacity: 0.45 } 50% { opacity: 1 } }'}</style>
              <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.3em', color: '#E0703C', animation: 'helixPulse 1.2s ease-in-out infinite' }}>
                HELIX
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.08em', color: '#E0703C' }}>HELIX</div>
              <p style={{ fontSize: 16, opacity: 0.85, maxWidth: 320 }}>Something reproducible went wrong. Your data is safe — the details below are saved in Settings.</p>
              <p style={{ fontSize: 11, opacity: 0.45, maxWidth: 340, fontFamily: 'ui-monospace, monospace', wordBreak: 'break-word' }}>
                {error?.message?.slice(0, 200) || 'unknown error'}{error?.digest ? ` · ${error.digest}` : ''}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 260 }}>
                <button
                  onClick={() => { try { window.location.reload() } catch { reset() } }}
                  style={{ minHeight: 44, padding: '0 20px', borderRadius: 12, background: '#E0703C1f', border: '1px solid #E0703C55', color: '#E0703C', fontWeight: 600, fontSize: 15 }}
                >
                  Reload HELIX
                </button>
                {/* The demolition, behind an explicit tap. It is the right move
                    for a genuinely stale bundle and the wrong one on a dead
                    connection, and only the person holding the phone knows
                    which of those they are looking at. */}
                <button
                  onClick={() => { void purgeAndReload() }}
                  style={{ minHeight: 44, padding: '0 20px', borderRadius: 12, background: 'transparent', border: '1px solid rgba(255,255,255,0.14)', color: '#79808C', fontWeight: 600, fontSize: 14 }}
                >
                  Reset app data
                </button>
              </div>
            </>
          )}
        </div>
      </body>
    </html>
  )
}
