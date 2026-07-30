'use client'

import { useEffect } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

/**
 * Page-level error boundary — the missing middle rung.
 *
 * Before this file existed the app had exactly two states: working, or
 * `global-error.tsx`. Anything that threw while rendering ANY page escaped
 * straight to the root boundary, which replaces the entire root layout, purges
 * the service worker + every cache, and hard-reloads. From the outside that is
 * indistinguishable from the app crashing — which is precisely what "clicking
 * Momentum crashes the app" was: one transient throw inside the timeline
 * subtree taking the whole shell down with it.
 *
 * Next.js renders this INSIDE the root layout, so the nav, the background and
 * the session all survive; only the page body is replaced, and `reset()`
 * re-renders that page without a reload. Genuinely fatal errors (ones thrown by
 * the layout itself) still fall through to global-error.
 *
 * The crash is still recorded — Settings reads `helix_last_crash` — so
 * containing the blast radius does not cost the diagnosis.
 */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[PageError]', error)
    try {
      window.localStorage.setItem('helix_last_crash', JSON.stringify({
        message: error?.message?.slice(0, 500) ?? 'unknown',
        digest: error?.digest ?? null,
        stack: error?.stack?.slice(0, 2000) ?? null,
        buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? 'unknown',
        scope: 'page',
        at: new Date().toISOString(),
      }))
    } catch { /* storage blocked — nothing to do */ }
  }, [error])

  return (
    <div className="helix-card flex flex-col items-center justify-center gap-3 text-center py-10" role="alert">
      <AlertTriangle className="w-6 h-6 text-warn" aria-hidden="true" />
      <p className="font-heading font-semibold text-fluid-base text-text">This tab couldn&apos;t load.</p>
      <p className="text-fluid-xs text-muted max-w-xs">
        Your data is safe and the rest of HELIX still works — the details are saved in Settings.
      </p>
      <p className="text-[10px] text-muted/50 max-w-xs font-mono break-words">
        {error?.message?.slice(0, 160) || 'unknown error'}
      </p>
      <button type="button" onClick={reset} className="btn-glass min-h-[40px] text-fluid-xs">
        <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> Try again
      </button>
    </div>
  )
}
