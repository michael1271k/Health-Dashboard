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
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[GlobalError]', error)
    try { window.localStorage.removeItem('helix_query_cache') } catch { /* ignore */ }
  }, [error])

  return (
    <html lang="en">
      <body style={{ background: '#030509', color: '#EAF2FF', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.08em', color: '#16F5C3' }}>HELIX</div>
          <p style={{ fontSize: 16, opacity: 0.85, maxWidth: 320 }}>Something went wrong loading the dashboard. Your data is safe — just reload.</p>
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
