'use client'

import { useEffect, useRef, useState } from 'react'

const MEASURE = {
  read: 'mx-auto w-full max-w-[68ch]',
  doc: 'mx-auto w-full max-w-[80ch]',
  data: 'mx-auto w-full max-w-[96ch]',
  grid: 'mx-auto w-full max-w-[80rem]',
  full: 'w-full',
} as const

/**
 * The bar's own inner padding. Two named modes rather than a className
 * passthrough: there is no tailwind-merge in this project, so a caller-supplied
 * `px-3` would sit alongside the default `px-2` and the winner would come down
 * to stylesheet order.
 */
const PAD = {
  tight: 'px-2 py-1.5',           // a title and some chevrons
  roomy: 'px-3 sm:px-5 py-2.5',   // a document's command bar
} as const

/**
 * The pinned command bar for a document route.
 *
 * WHY IT EXISTS
 * The Nexus, the report reader and the session analysis each carried a
 * byte-identical `sticky top-0 z-30 safe-pt backdrop-blur-2xl border-b` header
 * with the same colour-mix fill and the same accent hairline. Three copies of
 * one idea, drifting independently.
 *
 * WHAT CHANGED BEYOND DEDUPLICATION
 *
 * 1. The border is gone. A permanent 1px rule under a floating bar draws
 *    itself even when there is nothing underneath it to separate — at the top
 *    of a document it is a line for its own sake. It is a scroll-edge fade
 *    now: a soft gradient that appears only once content is actually passing
 *    beneath the bar, and dissolves when you return to the top.
 *
 * 2. That fade is driven by an IntersectionObserver on a 1px sentinel rendered
 *    immediately before the bar — NOT by a scroll listener. Scroll handlers on
 *    a sticky header are the classic source of jank: they run on the main
 *    thread at pointer rate to answer a question with two states.
 *
 * 3. The blur moved into `.app-chrome`, which is what the overlay rule and the
 *    reduced-transparency and high-contrast fallbacks all key off. Chrome is
 *    the only thing in the app still allowed to be translucent.
 */
export function AppBar({
  accent,
  measure = 'read',
  pad = 'tight',
  children,
  below,
  className = '',
  printHidden = false,
}: {
  /** Hex. Bleeds along the top edge as a hairline — which block of training,
   *  which workout, which phase this screen belongs to. */
  accent?: string
  measure?: keyof typeof MEASURE
  pad?: keyof typeof PAD
  children: React.ReactNode
  /** A second line under the main row — a status note, a segmented control.
   *  Outside the flex row, so it does not compete with the title for width. */
  below?: React.ReactNode
  className?: string
  /** The report reader hides its chrome when printing. */
  printHidden?: boolean
}) {
  const sentinel = useRef<HTMLDivElement>(null)
  const [underContent, setUnderContent] = useState(false)

  useEffect(() => {
    const el = sentinel.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      ([entry]) => setUnderContent(!entry.isIntersecting),
      { threshold: 0 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <>
      {/* Sits above the bar in document order, so it leaves the viewport the
          moment the page scrolls. Its only job is to be watched. */}
      <div ref={sentinel} aria-hidden="true" className="h-px" />
      <header
        {...(printHidden ? { 'data-print-hide': true } : {})}
        data-edge={underContent ? 'on' : 'off'}
        className={`app-chrome app-chrome--top sticky top-0 z-30 safe-pt ${className}`}
      >
        {accent && (
          <span
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-px"
            style={{ background: `linear-gradient(90deg, transparent, ${accent}b3, transparent)` }}
          />
        )}
        <div className={`${MEASURE[measure]} ${PAD[pad]} flex items-center gap-1.5`}>
          {children}
        </div>
        {below}
      </header>
    </>
  )
}
