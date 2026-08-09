/**
 * Gesture physics — the maths that makes a release feel like a throw.
 *
 * Three of these (project, rubberband, GESTURE_SLOP) come straight from Apple's
 * *Designing Fluid Interfaces* sample code. They are small enough to inline and
 * important enough not to.
 */

/**
 * Scroll-deceleration constant. 0.998 is the standard "scroll feel"; 0.99 is
 * noticeably snappier and suits short throws.
 */
export const DECELERATION = 0.998

/**
 * Where a flick would come to rest if you let it decelerate.
 *
 * This is the ONE function that turns a 40px flick into a dismissal. Without
 * it you have to snap from the release POSITION, which means a fast short
 * flick does nothing and a slow long drag commits — both backwards from what
 * the hand intended.
 *
 * NOTE the form. The physics-textbook answer is v²/(2·a), and it is NOT what
 * Apple ships. UIScrollView decelerates exponentially, so the resting point is
 * the sum of a geometric series, which is what this closed form evaluates.
 * Using the textbook version gives visibly wrong landing points at high speed.
 *
 * @param velocity px/s, signed
 * @returns signed px of additional travel
 */
export function project(velocity: number, decelerationRate: number = DECELERATION): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate)
}

/**
 * Progressive resistance past a boundary.
 *
 * A hard stop reads as "frozen — did it break?". Continuous resistance reads as
 * "responsive, but there is nothing more here". The further past the edge, the
 * less the element follows; it never fully stops, so the surface stays alive
 * under the finger.
 *
 * @param overshoot how far past the boundary the pointer has travelled (px)
 * @param dimension the size of the container the resistance is scaled against
 */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  if (dimension <= 0) return 0
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot))
}

/**
 * The snap point nearest a value — fed the PROJECTED endpoint, never the
 * release point. That ordering is the whole trick.
 */
export function nearestSnap(value: number, points: readonly number[]): number {
  if (points.length === 0) return value
  return points.reduce((best, p) => (Math.abs(p - value) < Math.abs(best - value) ? p : best), points[0])
}

/**
 * Normalise a gesture velocity against the distance still to travel.
 *
 * framer-motion takes absolute px/s in its `velocity` option, so this is only
 * needed for spring APIs that want a relative rate. Kept because getting the
 * handoff wrong is invisible in code review and obvious on a device.
 */
export function relativeVelocity(velocity: number, current: number, target: number): number {
  const distance = target - current
  return distance === 0 ? 0 : velocity / distance
}

/**
 * Movement required before a drag commits to a direction (px).
 *
 * Without hysteresis, a tap with 2px of finger roll registers as a drag and the
 * tap is eaten.
 */
export const GESTURE_SLOP = 10
