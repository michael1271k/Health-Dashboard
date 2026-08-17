'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Portals overlay content to <body> so `fixed inset-0` resolves against the
 * viewport — not a transformed/filtered ancestor (which was pushing dashboard
 * metric modals off-centre). Renders nothing until mounted on the client.
 */
export function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted || typeof document === 'undefined') return null
  return createPortal(children, document.body)
}

// Ref-counted so stacked overlays (a Sheet under a stacked Sheet) don't have the
// inner one's cleanup strip the body state while the outer is still open.
let overlayCount = 0
function acquireOverlay() {
  overlayCount += 1
  document.body.style.overflow = 'hidden'
  document.body.classList.add('helix-overlay-open')
}
function releaseOverlay() {
  overlayCount = Math.max(0, overlayCount - 1)
  if (overlayCount === 0) {
    document.body.style.overflow = ''
    document.body.classList.remove('helix-overlay-open')
  }
}

/**
 * Drop the lock unconditionally, whatever the count says.
 *
 * A ref count is only correct while every acquire is paired with its release,
 * and the cost of the one time it is not is a body that can never scroll again —
 * a state the user cannot get out of, because the overlay that would have
 * released it is already gone. Navigation is the natural amnesty: no overlay
 * survives a route change, so at that moment the count is known to be zero and
 * anything still set on <body> is by definition a leak.
 */
export function resetOverlayLock() {
  overlayCount = 0
  document.body.style.overflow = ''
  document.body.classList.remove('helix-overlay-open')
}

/**
 * While `open`, lock body scroll, flag `body.helix-overlay-open` (globals.css
 * uses it to suspend glass backdrop-filter on the page so cards don't sample the
 * dim veil as solid black on iOS), and bind Escape → onClose.
 *
 * ── THE EFFECT DEPENDS ON `open` ALONE, AND THAT IS THE FIX ──────────────────
 * It used to depend on `[open, onClose]`. Every consumer passes an inline arrow
 * (`onClose={() => setSheet(null)}`), so `onClose` had a new identity on every
 * parent render — and while a sheet was open, EACH parent render tore the
 * effect down and re-ran it:
 *
 *     releaseOverlay()  → count hits 0 → body.style.overflow = ''
 *                                      → classList.remove('helix-overlay-open')
 *     acquireOverlay()  → both immediately re-applied
 *
 * That toggles a body-level class gating a page-wide rule (globals.css:
 * `body.helix-overlay-open .app-chrome { backdrop-filter: none }`), so the
 * browser invalidated and re-resolved backdrop-filter state on the app chrome
 * on every render. On the dashboard the parent re-renders whenever any of its
 * ~10 queries settle, which is precisely while the user is dragging.
 *
 * `onClose` lives in a ref instead. The listener reads it at event time, so a
 * changed handler is still honoured — it just no longer re-runs the effect.
 */
export function useOverlayBodyLock(open: boolean, onClose?: () => void) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    acquireOverlay()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current?.() }
    window.addEventListener('keydown', onKey)
    return () => {
      releaseOverlay()
      window.removeEventListener('keydown', onKey)
    }
  }, [open])
}
