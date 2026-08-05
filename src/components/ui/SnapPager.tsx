'use client'

import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'

/** Imperative handle — lets a summary row elsewhere on the page jump the pager. */
export interface SnapPagerHandle {
  /** Scroll to the page with this `key`. Unknown keys are ignored. */
  goTo: (key: string) => void
}

/**
 * A swipeable pager built on CSS scroll-snap — no library, no JS animation.
 *
 * WHY
 * Three visuals on the Daily Nexus are genuinely tall and genuinely wanted:
 * the sleep stage ribbon (~320px), the hydration double-helix (~180px) and the
 * body-composition figure (~280px). Stacked, they are 780px — over a third of
 * the page — and each is a thing you look at deliberately, not something you
 * scan past on the way to something else.
 *
 * Paged, they share one slot and each gets MORE room than it had, at a third of
 * the cost. Nothing is hidden behind a menu: the rail names all three and the
 * pages are one swipe apart.
 *
 * Scroll position is the single source of truth — the rail buttons scroll, and
 * the active index is read back from the scroll offset. Nothing to keep in sync,
 * and a native swipe and a rail tap cannot disagree.
 */
export function SnapPager({ pages, className = '', ref }: {
  pages: Array<{ key: string; label: string; content: React.ReactNode }>
  className?: string
  ref?: React.Ref<SnapPagerHandle>
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const panels = useRef<Array<HTMLDivElement | null>>([])
  const [active, setActive] = useState(0)
  /**
   * The pager takes the ACTIVE page's height, not the tallest page's.
   *
   * Flex rows size to their tallest child, so a 700px Body page left ~400px of
   * dead black under the Sleep page — the pager's whole argument is that three
   * visuals cost one slot, and a slot sized for the worst case gives that back.
   * `null` until measured so the first paint falls back to auto rather than
   * collapsing to zero (and so jsdom, which has no layout, is unaffected).
   */
  const [height, setHeight] = useState<number | null>(null)

  const onScroll = useCallback(() => {
    const el = scroller.current
    if (!el) return
    const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth))
    setActive(Math.min(pages.length - 1, Math.max(0, i)))
  }, [pages.length])

  const go = useCallback((i: number) => {
    const el = scroller.current
    if (!el) return
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' })
  }, [])

  // Same path as a rail tap, so an external jump and a swipe cannot disagree
  // about the active page — scroll position stays the single source of truth.
  useImperativeHandle(ref, () => ({
    goTo: (key: string) => {
      const i = pages.findIndex((p) => p.key === key)
      if (i >= 0) go(i)
    },
  }), [pages, go])

  // Measure on activation, and again whenever the active page's own content
  // changes size (opening a disclosure inside a page must not clip it).
  const measure = useCallback(() => {
    const el = panels.current[active]
    if (el && el.offsetHeight > 0) setHeight(el.offsetHeight)
  }, [active])

  useLayoutEffect(measure, [measure, pages])

  useEffect(() => {
    const el = panels.current[active]
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [active, measure])

  return (
    <div className={className}>
      {/* Rail — the same glass-pill pattern as RangeSelector. */}
      <div className="flex gap-1 p-1 rounded-2xl bg-white/[0.04] border border-white/[0.06] mb-2" role="tablist">
        {pages.map((p, i) => {
          const on = i === active
          return (
            <button
              key={p.key}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={`pager-${p.key}`}
              onClick={() => go(i)}
              className={`flex-1 min-h-[34px] rounded-xl text-[11px] font-semibold transition-colors border ${
                on ? 'bg-primary/15 text-primary border-primary/30' : 'text-muted border-transparent'
              }`}
            >
              {p.label}
            </button>
          )
        })}
      </div>

      <div
        ref={scroller}
        onScroll={onScroll}
        // `items-start` stops a short page being stretched to the tall one's
        // height; the explicit height is what actually shrinks the slot.
        className="flex items-start overflow-x-auto overflow-y-hidden no-scrollbar snap-x snap-mandatory"
        style={{
          scrollBehavior: 'smooth',
          height: height ?? undefined,
          transition: 'height 240ms cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        {pages.map((p, i) => (
          <div
            key={p.key}
            id={`pager-${p.key}`}
            ref={(el) => { panels.current[i] = el }}
            role="tabpanel"
            aria-label={p.label}
            className="w-full shrink-0 snap-center"
          >
            {p.content}
          </div>
        ))}
      </div>
    </div>
  )
}
