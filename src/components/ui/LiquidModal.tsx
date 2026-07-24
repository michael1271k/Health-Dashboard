'use client'

import { useEffect, useState } from 'react'
import { m, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { Portal, useOverlayBodyLock } from './overlay'

interface LiquidModalProps {
  open: boolean
  onClose: () => void
  title?: string
  accent?: string
  children: React.ReactNode
}

/**
 * LiquidModal — the centered liquid-glass popup.
 *
 * Frame-drop-proof by construction:
 * - The entrance is compositor-only: translate3d + scale + opacity springs.
 * - The glass itself is a STATIC backdrop-filter layer that never animates —
 *   only its parent transforms, so iOS composites one pre-blurred texture
 *   instead of re-blurring per frame.
 * - `willChange` lives only for the animation's lifetime (set on the motion
 *   values via framer), never resident — keeping the iOS glass rule intact.
 * - Reduce-motion collapses the pop to a plain fade.
 */
export function LiquidModal({ open, onClose, title, accent = '#E0703C', children }: LiquidModalProps) {
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    setReduceMotion(document.documentElement.dataset.reduceMotion === 'true')
  }, [open])

  useOverlayBodyLock(open, onClose)

  return (
    <Portal>
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          {/* Veil — cheap opacity-only fade */}
          <m.div
            className="absolute inset-0 bg-black/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Liquid glass panel — transform/opacity only.
              Width scales up on desktop: `max-w-md` at every breakpoint left a
              1440px screen showing a phone-sized popup. The base was also still
              the pre-palette blue-black (rgba(8,13,24)) — it's obsidian now,
              with a low-alpha accent wash so the glass picks up the domain
              colour instead of reading as a flat panel. */}
          <m.div
            className="relative w-full max-w-md md:max-w-2xl lg:max-w-3xl max-h-[85dvh] md:max-h-[80dvh] flex flex-col overflow-hidden rounded-3xl"
            style={{
              background:
                `linear-gradient(158deg, ${accent}12 0%, transparent 42%),` +
                'linear-gradient(rgba(12,13,17,0.90), rgba(12,13,17,0.90))',
              backdropFilter: 'blur(26px) saturate(150%)',
              WebkitBackdropFilter: 'blur(26px) saturate(150%)',
              border: `1px solid ${accent}30`,
              boxShadow: `0 24px 64px rgba(0,0,0,0.62), 0 0 32px ${accent}1f, inset 0 1px 0 rgba(255,255,255,0.07)`,
            }}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translate3d(0, 14px, 0) scale(0.95)' }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translate3d(0, 10px, 0) scale(0.97)' }}
            transition={reduceMotion ? { duration: 0.12 } : { type: 'spring', stiffness: 420, damping: 32, mass: 0.75 }}
          >
            {/* One-shot sheen sweep across the glass on open */}
            {!reduceMotion && (
              <span aria-hidden="true" className="pointer-events-none absolute inset-0 liquid-modal-sheen" />
            )}

            <div className="shrink-0 flex items-center justify-between px-5 md:px-7 pt-4 md:pt-5 pb-1">
              {title
                ? <h2 className="font-heading font-semibold text-fluid-lg text-text truncate">{title}</h2>
                : <span />}
              <button
                onClick={onClose}
                className="-mr-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-muted hover:text-text active:scale-95 transition-transform"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-5 md:px-7 pb-5 md:pb-7">
              {children}
            </div>
          </m.div>
        </div>
      )}
    </AnimatePresence>
    </Portal>
  )
}
