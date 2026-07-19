'use client'

import { useEffect, useState } from 'react'
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

// Ref-counted so stacked overlays (a Sheet under a LiquidModal) don't have the
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
 * While `open`, lock body scroll, flag `body.helix-overlay-open` (globals.css
 * uses it to suspend glass backdrop-filter on the page so cards don't sample the
 * dim veil as solid black on iOS), and bind Escape → onClose.
 */
export function useOverlayBodyLock(open: boolean, onClose?: () => void) {
  useEffect(() => {
    if (!open) return
    acquireOverlay()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => {
      releaseOverlay()
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])
}
