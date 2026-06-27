'use client'

import { m } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'

interface FabProps {
  icon: LucideIcon
  label: string
  onClick: () => void
  /** Hide on desktop where a normal button exists. Default true. */
  mobileOnly?: boolean
  className?: string
}

/**
 * Thumb-reachable floating action button. Sits above the mobile bottom nav +
 * home indicator (safe-area aware); used to open the log / edit bottom sheets.
 */
export function Fab({ icon: Icon, label, onClick, mobileOnly = true, className = '' }: FabProps) {
  return (
    <m.button
      type="button"
      onClick={onClick}
      aria-label={label}
      whileTap={{ scale: 0.92 }}
      whileHover={{ scale: 1.04 }}
      className={`fixed right-4 z-[70] flex items-center gap-2 rounded-full bg-primary text-bg font-semibold
                  pl-4 pr-5 py-3 shadow-[0_10px_30px_rgba(61,125,255,0.45)]
                  bottom-[calc(5.5rem+env(safe-area-inset-bottom))] md:bottom-8
                  ${mobileOnly ? 'md:hidden' : ''} ${className}`}
    >
      <Icon className="w-5 h-5" aria-hidden="true" />
      <span className="text-fluid-sm">{label}</span>
    </m.button>
  )
}
