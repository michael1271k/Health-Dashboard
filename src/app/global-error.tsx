'use client'

import { useEffect } from 'react'

/**
 * Root error boundary — Next.js renders this in place of the ENTIRE root
 * layout (including <html>/<body>) when an unhandled exception escapes any
 * client component. Without this file, any crash is a permanent white screen
 * with no recovery path except the user manually force-quitting and reopening
 * the PWA. This turns that into a one-tap recoverable screen, and also clears
 * a stale/corrupted persisted React Query cache so a bad cache entry can't
 * cause the same crash again on reload.
 */
const RECOVER_FLAG = 'helix_sw_recovered'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[GlobalError]', error)
    try { window.localStorage.removeItem('helix_query_cache') } catch { /* ignore */ }

    // Self-heal the #1 recurring crash: a stale service-worker-cached JS bundle
    // (old chunk vs new server → minified React #130 / ChunkLoadError). Purge the
    // SW + all caches and hard-reload ONCE to pull the fresh bundle. Guard with a
    // per-session flag so a genuine code bug can't cause an infinite reload loop —
    // if we already recovered this session, fall through to the diagnostic screen.
    let alreadyRecovered = true
    try { alreadyRecovered = sessionStorage.getItem(RECOVER_FLAG) === '1' } catch { /* ignore */ }
    if (alreadyRecovered) return

    try { sessionStorage.setItem(RECOVER_FLAG, '1') } catch { /* ignore */ }
    const purge = async () => {
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
    void purge()
  }, [error])

  return (
    <html lang="en">
      <body style={{ background: '#030509', color: '#EAF2FF', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.08em', color: '#16F5C3' }}>HELIX</div>
          <p style={{ fontSize: 16, opacity: 0.85, maxWidth: 320 }}>We refreshed HELIX to the latest version but it still hit an error. Your data is safe. Tap reload, or screenshot the line below.</p>
          {/* Diagnosable: surface the actual error so a screenshot tells us the root cause */}
          <p style={{ fontSize: 11, opacity: 0.45, maxWidth: 340, fontFamily: 'ui-monospace, monospace', wordBreak: 'break-word' }}>
            {error?.message?.slice(0, 200) || 'unknown error'}{error?.digest ? ` · ${error.digest}` : ''}
          </p>
          <button
            onClick={() => { try { window.location.reload() } catch { reset() } }}
            style={{ padding: '10px 20px', borderRadius: 12, background: '#16F5C31f', border: '1px solid #16F5C355', color: '#16F5C3', fontWeight: 600 }}
          >
            Reload HELIX
          </button>
        </div>
      </body>
    </html>
  )
}
