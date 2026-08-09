/**
 * The motion vocabulary. One import path: `@/lib/motion`.
 *
 * Spring constants live in springs.ts, gesture physics in gesture.ts, and the
 * single reduced-motion boolean in useHelixReducedMotion.ts.
 */
export { STANDARD, SNAPPY, DRAWER, MOMENTUM, MATERIAL, CROSSFADE } from './springs'
export {
  DECELERATION,
  GESTURE_SLOP,
  project,
  rubberband,
  nearestSnap,
  relativeVelocity,
} from './gesture'
export { useHelixReducedMotion, useReducedTransparency } from './useHelixReducedMotion'
