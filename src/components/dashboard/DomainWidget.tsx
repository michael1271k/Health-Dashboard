'use client'

import { useState, type ReactNode } from 'react'
import { m, AnimatePresence } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface DomainWidgetProps {
  title: string
  icon: LucideIcon
  /** Hex theme accent. */
  accent: string
  children: ReactNode
  footer?: ReactNode
  /** Apple-Fitness vertical stack: header toggles an inline expand. */
  collapsible?: boolean
  defaultOpen?: boolean
}

/**
 * Glassmorphic domain card: tinted header (icon chip + title) above a uniform
 * 2-column grid of StatTiles. In `collapsible` mode the header toggles an inline
 * expand (mobile vertical stack); otherwise it's a static card (desktop grid).
 */
export function DomainWidget({ title, icon: Icon, accent, children, footer, collapsible, defaultOpen = true }: DomainWidgetProps) {
  const [open, setOpen] = useState(defaultOpen)
  const expanded = collapsible ? open : true

  const header = (
    <div className="flex items-center gap-2.5 w-full">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0" style={{ background: `${accent}22`, color: accent }}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <h2 className="font-heading text-sm font-semibold text-text flex-1 text-left">{title}</h2>
      {collapsible && (
        <m.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }} className="text-muted-vital shrink-0">
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </m.span>
      )}
    </div>
  )

  return (
    <div className="vital-card flex flex-col gap-3 h-full" style={{ borderColor: `${accent}33` }}>
      {collapsible
        ? <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="min-h-[40px]">{header}</button>
        : header}

      <AnimatePresence initial={false}>
        {expanded && (
          <m.div
            initial={collapsible ? { height: 0, opacity: 0 } : false}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-2 gap-2.5">{children}</div>
            {footer && <div className="text-xs text-muted-vital pt-2.5">{footer}</div>}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}
