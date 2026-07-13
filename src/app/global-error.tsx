'use client'

import { useEffect, useState } from 'react'

/**
 * Root error boundary — Next.js renders this in place of the ENTIRE root
 * layout when an unhandled exception escapes any client component.
 *
 * Recovery is SILENT: the first attempt in a session shows only the branded
 * splash (indistinguishable from a normal launch) while it purges the service
 * worker + caches and reloads onto the fresh bundle. Error text appears ONLY
 * when recovery already ran this session — a genuine, reproducible crash —
 * and by then the flight recorder holds the full stack for diagnosis.
 */
const RECOVER_FLAG = 'helix_sw_recovered'

function alreadyRecoveredThisSession(): boolean {
  try { return sessionStorage.getItem(RECOVER_FLAG) === '1' } catch { return true }
}

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // Computed once per mount: decides between silent splash and diagnostic screen.
  const [silent] = useState(() => !alreadyRecoveredThisSession())

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

    // Stale-bundle self-heal: purge the SW + all caches, reload fresh. Session
    // flag prevents a genuine code bug from looping the reload.
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
  }, [error, silent])

  return (
    <html lang="en">
      <body style={{ background: '#030509', color: '#EAF2FF', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center' }}>
          {silent ? (
            /* Indistinguishable from a normal launch: brand pulse, no error text. */
            <>
              <style>{'@keyframes helixPulse { 0%,100% { opacity: 0.45 } 50% { opacity: 1 } }'}</style>
              <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.3em', color: '#16F5C3', animation: 'helixPulse 1.2s ease-in-out infinite' }}>
                HELIX
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.08em', color: '#16F5C3' }}>HELIX</div>
              <p style={{ fontSize: 16, opacity: 0.85, maxWidth: 320 }}>Something reproducible went wrong. Your data is safe — the details below are saved in Settings.</p>
              <p style={{ fontSize: 11, opacity: 0.45, maxWidth: 340, fontFamily: 'ui-monospace, monospace', wordBreak: 'break-word' }}>
                {error?.message?.slice(0, 200) || 'unknown error'}{error?.digest ? ` · ${error.digest}` : ''}
              </p>
              <button
                onClick={() => { try { window.location.reload() } catch { reset() } }}
                style={{ padding: '10px 20px', borderRadius: 12, background: '#16F5C31f', border: '1px solid #16F5C355', color: '#16F5C3', fontWeight: 600 }}
              >
                Reload HELIX
              </button>
            </>
          )}
        </div>
      </body>
    </html>
  )
}
