'use client'

import { motion } from 'framer-motion'
import { HelixMark } from '@/components/HelixMark'
import { STANDARD, CROSSFADE, useHelixReducedMotion } from '@/lib/motion'
import { DAY_COLOR, alpha } from '@/lib/theme/palette'

/**
 * The first thing HELIX ever draws — and the ONLY thing, across two states.
 *
 * ── WHY THE SPLASH AND THE SIGN-IN ARE ONE COMPONENT ─────────────────────────
 * They used to be two unrelated screens. `AuthGate` rendered a 40px mark in a
 * `min-h-[60dvh]` box with a pulsing opacity; `/auth` rendered a 64px mark in a
 * full-screen box over a two-stop glow. So a cold boot showed you a small mark
 * in the middle of nowhere, then CUT to a different-sized mark in a different
 * place over a different background. Two screens, one identity, no relationship
 * between them.
 *
 * Apple's spatial-consistency rule says a thing should emerge from where it
 * went. Here the mark never goes anywhere: the backdrop, the mark's size and the
 * wordmark's position are identical in both states, so resolving auth is a
 * CONTINUATION — the card arrives beneath a lockup that has not moved — rather
 * than a cut between two screens that happen to share a logo.
 *
 * ── THE BACKDROP IS THE COLOUR DNA ───────────────────────────────────────────
 * Three radial washes drawn straight from `DAY_COLOR`: the Chest ramp warm from
 * below, the Legs ramp cool from above, the Shoulders hue holding the middle.
 * The palette is not decorated onto this screen, it IS this screen — the first
 * statement of the system every other surface then speaks in. Reading the values
 * from `DAY_COLOR` rather than spelling them out is also what stops this screen
 * being the one place the DNA silently falls a release behind.
 */
export function LaunchSurface({
  children,
  status,
}: {
  /** The sign-in card, or nothing while the session is still resolving. */
  children?: React.ReactNode
  /** Accessible label when this is standing in as a loading state. */
  status?: string
}) {
  const reduced = useHelixReducedMotion()

  return (
    <main
      className="relative min-h-[100dvh] flex items-center justify-center p-6 overflow-hidden bg-bg"
      {...(status ? { role: 'status', 'aria-label': status } : {})}
    >
      {/* The DNA, as light. Pointer-events-none so it never eats the one tap
          this screen exists to receive. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="absolute -top-1/4 left-1/2 -translate-x-1/2 w-[120vw] h-[60vh] rounded-full blur-[120px]"
          style={{ background: `radial-gradient(circle, ${alpha(DAY_COLOR.legs_a, 0.3)} 0%, transparent 65%)` }}
        />
        <div
          className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[90vw] h-[45vh] rounded-full blur-[130px]"
          style={{ background: `radial-gradient(circle, ${alpha(DAY_COLOR.arms, 0.22)} 0%, transparent 70%)` }}
        />
        <div
          className="absolute -bottom-1/3 left-1/2 -translate-x-1/2 w-[110vw] h-[55vh] rounded-full blur-[120px]"
          style={{ background: `radial-gradient(circle, ${alpha(DAY_COLOR.cb_a, 0.36)} 0%, transparent 65%)` }}
        />
      </div>

      <div className="relative w-full max-w-sm">
        {/* ── The lockup. Identical geometry in BOTH states — this is the whole
            point of the component, so nothing here may depend on `children`. */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="relative mb-4">
            <div
              aria-hidden
              className="absolute inset-0 blur-2xl opacity-60"
              style={{ background: `radial-gradient(circle, ${alpha(DAY_COLOR.cb_a, 0.5)}, transparent 70%)` }}
            />
            <HelixMark className="relative w-16 h-16" />
          </div>
          <h1 className="font-heading text-4xl font-black tracking-[0.12em] text-text">HELIX</h1>
          <p className="text-xs text-muted mt-1.5 tracking-wide">Engineer Your Ascent.</p>
        </div>

        {/* The card arrives; the lockup above it does not move. Reduced motion
            keeps the cross-fade and drops the 12px of travel — a non-vestibular
            equivalent, not an absence of feedback. */}
        {children && (
          <motion.div
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduced ? CROSSFADE : STANDARD}
          >
            {children}
          </motion.div>
        )}
      </div>
    </main>
  )
}
