import { describe, it, expect } from 'vitest'
import {
  STANDARD, SNAPPY, DRAWER, MOMENTUM, MATERIAL, CROSSFADE,
  DECELERATION, GESTURE_SLOP,
  project, rubberband, nearestSnap, relativeVelocity,
} from '@/lib/motion'

/**
 * These are the numbers that decide whether a flick throws a sheet away or
 * springs it home. They are cheap to typo and expensive to notice: a wrong
 * decelerationRate still animates smoothly, it just lands somewhere the hand
 * did not aim. Pin the physics, not the aesthetics.
 */

describe('project — where a flick comes to rest', () => {
  it('turns a hard flick into travel far beyond the release point', () => {
    // 1000 px/s at the standard rate is roughly half a screen of throw. This is
    // the whole reason a 40px flick can dismiss a sheet.
    expect(project(1000)).toBeCloseTo(499, 0)
  })

  it('is signed — an upward flick projects upward', () => {
    expect(project(-1000)).toBeCloseTo(-499, 0)
  })

  it('is zero at rest, so a drag with no speed lands exactly where it stopped', () => {
    expect(project(0)).toBe(0)
  })

  it('scales linearly with velocity', () => {
    expect(project(2000)).toBeCloseTo(project(1000) * 2, 6)
  })

  it('a lower deceleration rate means a shorter throw', () => {
    // 0.99 is the "snappier" rate — it must not overshoot the default.
    expect(project(1000, 0.99)).toBeLessThan(project(1000, 0.998))
  })

  it('is NOT the textbook v²/(2a) form', () => {
    // UIScrollView decelerates exponentially, so the resting point is the sum
    // of a geometric series. The kinematic answer diverges badly at speed, and
    // using it produces landing points that feel wrong without looking broken.
    const kinematic = (1000 * 1000) / (2 * 1000)
    expect(project(1000)).not.toBeCloseTo(kinematic, 0)
  })

  it('uses 0.998 as the default rate', () => {
    expect(DECELERATION).toBe(0.998)
    expect(project(1234)).toBe(project(1234, DECELERATION))
  })
})

describe('rubberband — progressive boundary resistance', () => {
  const DIM = 800

  it('resists more the further past the edge you pull', () => {
    // The RATIO of output to input must fall as the overshoot grows. That
    // falling ratio is the resistance; a linear factor would not be felt.
    const near = rubberband(50, DIM) / 50
    const far = rubberband(400, DIM) / 400
    expect(far).toBeLessThan(near)
  })

  it('never fully stops — the surface stays alive under the finger', () => {
    // A hard stop reads as a freeze. Even 2000px past the bound still moves.
    expect(rubberband(2000, DIM)).toBeGreaterThan(0)
  })

  it('always follows less than the finger', () => {
    for (const overshoot of [1, 10, 100, 500, 2000]) {
      expect(rubberband(overshoot, DIM)).toBeLessThan(overshoot)
    }
  })

  it('is monotonic — more pull is never less movement', () => {
    let previous = 0
    for (let overshoot = 0; overshoot <= 1000; overshoot += 25) {
      const current = rubberband(overshoot, DIM)
      expect(current).toBeGreaterThanOrEqual(previous)
      previous = current
    }
  })

  it('is zero at the boundary itself', () => {
    expect(rubberband(0, DIM)).toBe(0)
  })

  it('is symmetric about the boundary', () => {
    expect(rubberband(-120, DIM)).toBeCloseTo(-rubberband(120, DIM), 6)
  })

  it('degrades safely on a zero-height container rather than dividing by zero', () => {
    expect(rubberband(100, 0)).toBe(0)
    expect(Number.isNaN(rubberband(100, 0))).toBe(false)
  })
})

describe('nearestSnap — chosen from the projection, not the release point', () => {
  const POINTS = [0, 600] as const

  it('picks the closer target', () => {
    expect(nearestSnap(120, POINTS)).toBe(0)
    expect(nearestSnap(480, POINTS)).toBe(600)
  })

  it('a slow 130px drag springs home — the user visibly stopped', () => {
    // The old rule was `offset > 110` and this case dismissed. It should not.
    const projected = 130 + project(40)
    expect(nearestSnap(projected, POINTS)).toBe(0)
  })

  it('a 40px flick at 1400px/s is thrown away — small input, big output', () => {
    // The old rule needed velocity > 500 AND fired from position; this is the
    // case the projection exists to catch.
    const projected = 40 + project(1400)
    expect(nearestSnap(projected, POINTS)).toBe(600)
  })

  it('falls back to the value itself when there is nowhere to snap', () => {
    expect(nearestSnap(42, [])).toBe(42)
  })
})

describe('relativeVelocity', () => {
  it('normalises px/s against the distance still to travel', () => {
    // 50px/s with 100px to go = 0.5 of the remaining gap per second.
    expect(relativeVelocity(50, 50, 150)).toBe(0.5)
  })

  it('returns zero rather than Infinity when already at the target', () => {
    expect(relativeVelocity(50, 100, 100)).toBe(0)
  })
})

describe('the spring vocabulary', () => {
  it('defaults to critically damped — no overshoot anywhere by default', () => {
    for (const spring of [STANDARD, SNAPPY, MATERIAL]) {
      expect(spring.type).toBe('spring')
      expect(spring.bounce).toBe(0)
    }
  })

  it('reserves bounce for the two momentum springs only', () => {
    // Overshoot is the visual echo of a throw. A menu that faded in never had
    // momentum, so bouncing it is a lie about what happened.
    expect(DRAWER.bounce).toBeGreaterThan(0)
    expect(MOMENTUM.bounce).toBeGreaterThan(0)
  })

  it('keeps bounce subtle — this is an instrument, not a toy', () => {
    for (const spring of [DRAWER, MOMENTUM]) {
      expect(spring.bounce).toBeLessThanOrEqual(0.3)
    }
  })

  it('makes small chrome faster than full surfaces', () => {
    expect(SNAPPY.duration).toBeLessThan(STANDARD.duration)
    expect(MATERIAL.duration).toBeGreaterThan(STANDARD.duration)
  })

  it('makes the reduced-motion substitute a tween, never a spring', () => {
    // A spring is a physical metaphor. Reduced motion wants the opposite: a
    // short, flat cross-fade with no travel and no overshoot.
    expect(CROSSFADE.type).toBe('tween')
    expect(CROSSFADE.duration).toBeLessThan(STANDARD.duration)
  })
})

describe('GESTURE_SLOP', () => {
  it('is enough finger roll to protect a tap, little enough to feel instant', () => {
    expect(GESTURE_SLOP).toBe(10)
  })
})
