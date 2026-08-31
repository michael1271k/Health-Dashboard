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

/**
 * ── `overflow: hidden` IS NOT A SCROLL LOCK ON iOS ───────────────────────────
 *
 * It stops the body from scrolling further and does nothing about the two
 * things that actually matter behind an open sheet: the page still RUBBER-BANDS
 * when a drag reaches the end of the sheet's own scroller, and Safari is free
 * to forget where the page was — so closing a sheet could land you somewhere
 * other than where you opened it.
 *
 * The fix is the standard one, and the only one WebKit honours: take the page
 * out of flow at its current offset (`position: fixed; top: -scrollY`), then put
 * it back and restore the offset on release. The scroll position is captured
 * ONCE, on the outermost acquire, because a stacked sheet opening on top must
 * not re-read a body that is already frozen at `top: -1200px` and record zero.
 *
 * `resetOverlayLock` unwinds exactly the same state — see its note on why a
 * navigation is the right amnesty.
 */
let overlayCount = 0
let lockedScrollY = 0

function applyLock(): void {
  const { body } = document
  body.style.position = 'fixed'
  body.style.top = `${-lockedScrollY}px`
  body.style.left = '0'
  body.style.right = '0'
  body.style.width = '100%'
  body.style.overflow = 'hidden'
}

function clearLock(restore: boolean): void {
  const { body } = document
  body.style.position = ''
  body.style.top = ''
  body.style.left = ''
  body.style.right = ''
  body.style.width = ''
  body.style.overflow = ''
  body.classList.remove('helix-overlay-open')
  // `auto` behaviour, not smooth: this is putting the page back where it was,
  // not travelling to it, and a smooth scroll here reads as the page sliding
  // away underneath a sheet that has only just closed.
  if (restore) window.scrollTo({ top: lockedScrollY, behavior: 'instant' as ScrollBehavior })
  lockedScrollY = 0
}

// Ref-counted so stacked overlays (a Sheet under a stacked Sheet) don't have the
// inner one's cleanup strip the body state while the outer is still open.
function acquireOverlay() {
  if (overlayCount === 0) lockedScrollY = window.scrollY
  overlayCount += 1
  applyLock()
  document.body.classList.add('helix-overlay-open')
}
function releaseOverlay() {
  overlayCount = Math.max(0, overlayCount - 1)
  if (overlayCount === 0) clearLock(true)
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
  // No scroll restore. A navigation has already given the new route its own
  // scroll position, and putting the OLD one back would drop the user partway
  // down a page they have not seen yet.
  clearLock(false)
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
