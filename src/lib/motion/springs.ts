import type { Transition } from 'framer-motion'

/**
 * The HELIX spring vocabulary.
 *
 * WHY THESE AND NOT stiffness/damping
 * Apple deliberately retired the physics triplet (mass/stiffness/damping) in
 * favour of two parameters a designer can reason about:
 *
 *   damping ratio — how much it overshoots. 1.0 = critically damped, settles
 *                   without a bounce. Below 1.0 it oscillates; lower = bouncier.
 *   response      — how fast it reaches the target, in seconds. NOT a duration:
 *                   a spring has no fixed end, the settle time emerges.
 *
 * framer-motion's `bounce` + `duration` spring API is the same two knobs under
 * different names, with `bounce = 1 - dampingRatio`. So Apple's shipping values
 * translate directly, which is what the table below does. The previous code had
 * six different hand-tuned {stiffness, damping} pairs across six files and no
 * way to tell which was deliberate.
 *
 * THE RULE THAT MATTERS
 * Bounce must be EARNED. Overshoot is the visual echo of momentum, so it only
 * belongs on something the user physically threw — a flick, a drag release. A
 * menu that just faded in never had momentum, and bouncing it reads as a
 * cartoon. In practice: `bounce > 0` appears only inside onDragEnd/onPointerUp
 * handlers. Everywhere else is critically damped.
 */

/** damping 1.0 · response 0.4 — the house default. Everything, unless proven otherwise. */
export const STANDARD = { type: 'spring', bounce: 0, duration: 0.4 } as const satisfies Transition

/** damping 1.0 · response ~0.28 — small chrome: nav pills, chips, toggles, segmented rails. */
export const SNAPPY = { type: 'spring', bounce: 0, duration: 0.28 } as const satisfies Transition

/** damping 0.8 · response 0.3 — a drawer settling BACK after a drag. Never on open. */
export const DRAWER = { type: 'spring', bounce: 0.2, duration: 0.32 } as const satisfies Transition

/** damping 0.8 · response 0.4 — a thing that was FLICKED away. Bounce is earned here. */
export const MOMENTUM = { type: 'spring', bounce: 0.2, duration: 0.4 } as const satisfies Transition

/**
 * damping 1.0 · response 0.45 — a glass surface materialising.
 * Slightly slower than STANDARD because blur radius and scale animate together;
 * a real material arrives, it doesn't just fade in.
 */
export const MATERIAL = { type: 'spring', bounce: 0, duration: 0.45 } as const satisfies Transition

/**
 * The reduced-motion substitute. A tween on OPACITY only — never a spring.
 *
 * Reduced motion does not mean no feedback; it means a non-vestibular
 * equivalent. Keep the cross-fade (it aids comprehension), drop the travel.
 */
export const CROSSFADE = {
  type: 'tween',
  duration: 0.16,
  ease: [0.4, 0, 0.2, 1],
} as const satisfies Transition
