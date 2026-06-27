'use client'

import { useState } from 'react'
import { m, AnimatePresence } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface AccordionItem {
  id: string
  title: string
  subtitle?: string
  icon?: LucideIcon
  /** Hex accent tinting the icon chip + border. */
  accent?: string
  content: React.ReactNode
}

interface AccordionProps {
  items: AccordionItem[]
  /** id to open initially; defaults to the first item. */
  defaultOpenId?: string
  allowMultiple?: boolean
}

/**
 * Animated collapsible sections for dense mobile content. Height animates to
 * `auto` via framer-motion (LazyMotion) for a smooth 60fps expand/collapse.
 */
export function Accordion({ items, defaultOpenId, allowMultiple = false }: AccordionProps) {
  const initial = defaultOpenId ?? items[0]?.id
  const [open, setOpen] = useState<Set<string>>(new Set(initial ? [initial] : []))

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(allowMultiple ? prev : [])
      if (prev.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="space-y-2.5">
      {items.map((it) => {
        const isOpen = open.has(it.id)
        const Icon = it.icon
        return (
          <div
            key={it.id}
            className="glass-card overflow-hidden"
            style={it.accent ? { borderColor: `${it.accent}33` } : undefined}
          >
            <button
              onClick={() => toggle(it.id)}
              aria-expanded={isOpen}
              className="w-full flex items-center gap-3 px-4 py-3.5 min-h-[52px] text-left"
            >
              {Icon && (
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
                  style={{
                    background: it.accent ? `${it.accent}22` : 'rgba(255,255,255,0.05)',
                    color: it.accent ?? 'var(--color-text)',
                  }}
                >
                  <Icon className="w-4 h-4" aria-hidden="true" />
                </span>
              )}
              <span className="flex-1 min-w-0">
                <span className="block font-heading font-semibold text-fluid-sm text-text">{it.title}</span>
                {it.subtitle && <span className="block text-fluid-xs text-muted-vital truncate">{it.subtitle}</span>}
              </span>
              <m.span
                animate={{ rotate: isOpen ? 180 : 0 }}
                transition={{ duration: 0.2 }}
                className="text-muted-vital shrink-0"
              >
                <ChevronDown className="w-4 h-4" aria-hidden="true" />
              </m.span>
            </button>

            <AnimatePresence initial={false}>
              {isOpen && (
                <m.div
                  key="content"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 pt-0.5">{it.content}</div>
                </m.div>
              )}
            </AnimatePresence>
          </div>
        )
      })}
    </div>
  )
}
