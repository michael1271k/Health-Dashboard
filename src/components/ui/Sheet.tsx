'use client'

import { useEffect } from 'react'
import { m, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'

interface SheetProps {
  open: boolean
  onClose: () => void
  title?: string
  /** Max height of the sheet panel on mobile (default 90dvh). */
  maxHeight?: string
  children: React.ReactNode
}

/**
 * Responsive modal: a swipe-to-dismiss bottom sheet on phones, a centered glass
 * dialog on ≥sm. Locks body scroll, traps Escape, respects the home-indicator
 * safe area, and animates via LazyMotion (60fps transform/opacity only).
 */
export function Sheet({ open, onClose, title, maxHeight = '90dvh', children }: SheetProps) {
  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
          {/* Backdrop */}
          <m.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Panel */}
          <m.div
            className="relative w-full sm:max-w-lg vital-card rounded-b-none sm:rounded-3xl
                       overflow-y-auto no-scrollbar safe-pb sm:pb-5"
            style={{ maxHeight }}
            initial={{ y: '100%', opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) onClose()
            }}
          >
            {/* Drag handle (mobile affordance) */}
            <div className="sm:hidden flex justify-center pt-1 pb-3 cursor-grab active:cursor-grabbing">
              <span className="h-1.5 w-10 rounded-full bg-white/20" aria-hidden="true" />
            </div>

            {(title || true) && (
              <div className="flex items-center justify-between mb-2">
                {title
                  ? <h2 className="font-heading font-semibold text-fluid-lg text-text">{title}</h2>
                  : <span />}
                <button
                  onClick={onClose}
                  className="text-muted-vital hover:text-text p-1 -mr-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            )}

            {children}
          </m.div>
        </div>
      )}
    </AnimatePresence>
  )
}
