'use client'

import { useEffect } from 'react'
import { m, AnimatePresence, useDragControls } from 'framer-motion'
import { X } from 'lucide-react'

interface SheetProps {
  open: boolean
  onClose: () => void
  title?: string
  maxHeight?: string
  children: React.ReactNode
}

/**
 * High-performance responsive modal: a swipe-to-dismiss bottom sheet on phones,
 * a centered dialog on ≥sm.
 *
 * Perf notes (Phase 7): the animated panel is a SOLID translucent surface — no
 * backdrop-filter — so dragging never triggers an expensive per-frame blur
 * repaint (the previous jank). Drag is driven by `useDragControls` started from
 * the header handle only (`dragListener={false}`), so it never fights the
 * scrollable content. Closing unmounts instantly with a short transform-only exit.
 */
export function Sheet({ open, onClose, title, maxHeight = '90dvh', children }: SheetProps) {
  const controls = useDragControls()

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
          {/* Backdrop — plain (no blur) so only a cheap opacity fade animates */}
          <m.div
            className="absolute inset-0 bg-black/65"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Panel — solid surface, transform-only motion */}
          <m.div
            className="relative w-full sm:max-w-lg flex flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl safe-pb sm:pb-0"
            style={{
              maxHeight,
              background: 'rgba(11,15,28,0.97)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 -10px 48px rgba(0,0,0,0.6)',
              willChange: 'transform',
            }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 440, damping: 38, mass: 0.7 }}
            drag="y"
            dragControls={controls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 500) onClose()
            }}
          >
            {/* Header / drag affordance — drag starts here only */}
            <div
              className="shrink-0 px-5 pt-2"
              onPointerDown={(e) => controls.start(e)}
              style={{ touchAction: 'none', cursor: 'grab' }}
            >
              <div className="sm:hidden flex justify-center pb-3">
                <span className="h-1.5 w-10 rounded-full bg-white/20" aria-hidden="true" />
              </div>
              <div className="flex items-center justify-between mb-2">
                {title
                  ? <h2 className="font-heading font-semibold text-fluid-lg text-text">{title}</h2>
                  : <span />}
                <button
                  onClick={onClose}
                  className="-mr-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-muted-vital hover:text-text active:scale-95 transition-transform"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-5 pb-5">
              {children}
            </div>
          </m.div>
        </div>
      )}
    </AnimatePresence>
  )
}
