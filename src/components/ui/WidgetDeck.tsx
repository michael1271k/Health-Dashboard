'use client'

import { useRef, useState, useCallback } from 'react'
import { m } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'

export interface DeckItem {
  id: string
  label: string
  icon?: LucideIcon
  content: React.ReactNode
}

/**
 * Mobile data presentation: a segmented control above a native scroll-snap
 * carousel. Swipe horizontally or tap a segment — the active pill (animated via
 * layoutId) and the dot indicator stay in sync. Pure CSS scroll-snap keeps the
 * swipe buttery (no JS per-frame work); we only read scrollLeft to update the
 * active index.
 */
export function WidgetDeck({ items }: { items: DeckItem[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)

  const onScroll = useCallback(() => {
    const el = scrollerRef.current
    if (!el || el.clientWidth === 0) return
    const idx = Math.round(el.scrollLeft / el.clientWidth)
    setActive((prev) => (prev === idx ? prev : idx))
  }, [])

  const goTo = (i: number) => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' })
  }

  return (
    <div className="space-y-3">
      {/* Segmented control */}
      <div className="flex gap-1 p-1 rounded-2xl bg-white/[0.04] border border-white/[0.06] overflow-x-auto no-scrollbar">
        {items.map((it, i) => {
          const Icon = it.icon
          const isActive = i === active
          return (
            <button
              key={it.id}
              onClick={() => goTo(i)}
              aria-current={isActive ? 'true' : undefined}
              className="relative flex-1 min-w-fit whitespace-nowrap px-3 py-2 rounded-xl text-fluid-xs font-medium min-h-[40px]"
            >
              {isActive && (
                <m.span
                  layoutId="deck-pill"
                  className="absolute inset-0 rounded-xl bg-primary/15 border border-primary/30"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                />
              )}
              <span className={`relative flex items-center justify-center gap-1.5 ${isActive ? 'text-primary' : 'text-muted-vital'}`}>
                {Icon && <Icon className="w-3.5 h-3.5" aria-hidden="true" />}
                {it.label}
              </span>
            </button>
          )
        })}
      </div>

      {/* Swipeable panels */}
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="flex overflow-x-auto no-scrollbar snap-x snap-mandatory"
      >
        {items.map((it) => (
          <div key={it.id} className="snap-center shrink-0 w-full min-w-0">
            {it.content}
          </div>
        ))}
      </div>

      {/* Dots */}
      <div className="flex justify-center gap-1.5">
        {items.map((it, i) => (
          <button
            key={it.id}
            onClick={() => goTo(i)}
            aria-label={`Go to ${it.label}`}
            className={`h-1.5 rounded-full transition-all duration-300 ${i === active ? 'w-5 bg-primary' : 'w-1.5 bg-white/20'}`}
          />
        ))}
      </div>
    </div>
  )
}
