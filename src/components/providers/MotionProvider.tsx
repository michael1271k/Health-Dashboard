'use client'

import { LazyMotion, MotionConfig, domMax } from 'framer-motion'
import { STANDARD, useHelixReducedMotion } from '@/lib/motion'

/*
 * ── `features={domMax}` IS DELIBERATE. THE ASYNC FORM WAS TRIED AND REVERTED ─
 *
 * framer documents a loader form — `features={() => import('./features')
 * .then(m => m.domMax)}` — and on the face of it this file is doing the thing
 * that form exists to prevent: handing `LazyMotion` a resolved value, so
 * webpack has framer's whole DOM feature set at module scope and it lands in
 * the root layout chunk.
 *
 * MEASURED, on this app's build (2026-08-31): splitting it out — via a
 * dedicated one-export module, because a dynamic `import('framer-motion')` from
 * a file that also imports `LazyMotion` statically splits nothing — moved
 * 7 KB raw / 2 KB gzipped, and produced no new async chunk at all. Next groups
 * framer into a deterministic shared vendor chunk (`4bd1b696`, 169 KB) that
 * every route needs anyway for `m`, `AnimatePresence` and `MotionConfig`, and
 * the feature bundle rides along regardless of how it is referenced.
 *
 * What the loader form DOES cost is real: until the features resolve, every
 * `m.*` in the tree renders as static DOM, so the first frame after hydration
 * skips its animation. Paying a visible regression for two kilobytes is the
 * wrong trade, so this stays as it is. Revisit only if the vendor chunking
 * changes.
 */

/**
 * Loads framer-motion's DOM features lazily (LazyMotion) so the initial bundle
 * stays small while every `m.*` element animates at 60fps. `domMax` adds drag
 * gestures + layout animations (needed by the bottom Sheet's swipe-to-dismiss
 * and the WidgetDeck's animated segmented highlight).
 *
 * ── STRICT, AS OF 2026-08-12 ─────────────────────────────────────────────────
 * It was non-strict "so the few existing `motion.*` components keep working",
 * and that concession quietly defeated the whole mechanism: a single `motion.*`
 * import anywhere in the tree pulls framer's FULL bundle in addition to the
 * lazy one, so the app paid for both. By the end there was exactly one such
 * import left (`ExceptionDayBanner`), converted in the commit before this.
 *
 * Strict makes any future `motion.*` a hard error instead of a silent doubling
 * of the animation bundle — which is the only thing that keeps LazyMotion
 * honest, because the regression is otherwise completely invisible.
 *
 * `domMax` stays. Both features it adds over `domAnimation` are genuinely used
 * and both are app-wide (Sheet drags; `layoutId` in the nav on every screen),
 * so there is no island to scope the smaller bundle to.
 *
 * MotionConfig supplies two things that were previously copy-pasted, or simply
 * absent, at every call site:
 *
 * 1. THE DEFAULT TRANSITION. Any `m.*` without an explicit `transition` now
 *    springs on STANDARD instead of falling back to framer's own default. Six
 *    files used to carry six different hand-tuned {stiffness, damping} pairs.
 *
 * 2. REDUCED MOTION, ONCE. `reducedMotion="user"` honours the OS query
 *    natively; forcing "always" is how the in-app Settings toggle — which
 *    framer has no idea exists — gets bridged in. Either signal now strips
 *    transform and layout animations tree-wide while keeping opacity and
 *    colour, which is the correct behaviour rather than freezing everything.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  const reduce = useHelixReducedMotion()
  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion={reduce ? 'always' : 'user'} transition={STANDARD}>
        {children}
      </MotionConfig>
    </LazyMotion>
  )
}
