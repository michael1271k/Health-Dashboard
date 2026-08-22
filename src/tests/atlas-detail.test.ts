import { describe, it, expect } from 'vitest'
import {
  ATLAS_VIEWBOX, BASE_SHAPES, DETAIL_SHAPES, MUSCLE_PATHS, musclesOnView,
} from '@/lib/body/atlas'
import { LANDMARK_MUSCLES } from '@/lib/training/landmarks'

/**
 * ── THE THIRD LAYER, AND THE LINE AROUND IT ──────────────────────────────────
 *
 * The atlas is three layers — silhouette, muscles, definition — and the whole
 * value of the third one is that it is NOT the other two. A detail path that
 * leaked into `BASE_SHAPES` would be filled as body mass, which on the widget
 * means an eye rendered as a hole in the forehead; a detail path that leaked
 * into `MUSCLE_PATHS` would need a landmark to key it on, and there is no
 * `LandmarkMuscle` called "kneecap".
 *
 * The Swift generator separates them by regex over the source text, so the
 * separation has to hold in the DATA, not just in a developer's head. That is
 * what this file asserts.
 */

describe('the three layers stay separate', () => {
  it('shares no path between the silhouette, the muscles and the definition', () => {
    const base = new Set(BASE_SHAPES)
    const muscle = new Set(MUSCLE_PATHS.map((p) => p.d))
    for (const d of DETAIL_SHAPES) {
      expect(base.has(d.d), `detail path is also a BASE_SHAPE: ${d.d.slice(0, 30)}`).toBe(false)
      expect(muscle.has(d.d), `detail path is also a MUSCLE_PATH: ${d.d.slice(0, 30)}`).toBe(false)
    }
    for (const d of MUSCLE_PATHS) {
      expect(base.has(d.d), `muscle path is also a BASE_SHAPE: ${d.muscle}`).toBe(false)
    }
  })

  it('draws definition on both views — a body detailed on one side is half a body', () => {
    for (const view of ['front', 'back'] as const) {
      expect(DETAIL_SHAPES.filter((d) => d.view === view).length,
        `no detail on the ${view}`).toBeGreaterThan(5)
    }
  })

  it('uses only the four commands the Swift generator implements', () => {
    for (const d of DETAIL_SHAPES) {
      expect(d.d, d.d).toMatch(/^[MLCZ0-9,.\s-]+$/)
    }
  })

  it('keeps every coordinate inside the viewBox', () => {
    // A line drawn off-canvas renders as a clipped smear in the app and as
    // nothing at all in the widget's smaller rect.
    for (const d of DETAIL_SHAPES) {
      const nums = (d.d.match(/-?\d*\.?\d+/g) ?? []).map(Number)
      for (let i = 0; i < nums.length; i += 2) {
        expect(nums[i], `${d.d.slice(0, 24)} x`).toBeGreaterThanOrEqual(0)
        expect(nums[i], `${d.d.slice(0, 24)} x`).toBeLessThanOrEqual(ATLAS_VIEWBOX.width)
        expect(nums[i + 1], `${d.d.slice(0, 24)} y`).toBeGreaterThanOrEqual(0)
        expect(nums[i + 1], `${d.d.slice(0, 24)} y`).toBeLessThanOrEqual(ATLAS_VIEWBOX.height)
      }
    }
  })
})

describe('the redraw kept every landmark', () => {
  /**
   * ── ONE DOCUMENTED HOLE: FRONT DELTS ────────────────────────────────────────
   * `Front delts` became a landmark when the weekly counter stopped discarding
   * nine sets a week of pressing assistance. The atlas has no anterior-deltoid
   * SHAPE for it — the front view's two shoulder caps are tagged `Side delts` —
   * so the muscle is real in the arithmetic and absent from the body.
   *
   * That is stated here rather than papered over. Closing it means splitting
   * each cap into an anterior and a lateral path, regenerating the SwiftUI
   * geometry through `scripts/gen-atlas-swift.mjs`, and re-passing the parity
   * test — which is a piece of art work, not a rename, and is deliberately not
   * bundled with the arithmetic fix.
   */
  const NOT_YET_DRAWN = new Set<string>(['Front delts'])

  it('draws every landmark muscle that has geometry', () => {
    const drawn = new Set(MUSCLE_PATHS.map((p) => p.muscle))
    for (const m of LANDMARK_MUSCLES) {
      if (NOT_YET_DRAWN.has(m)) continue
      expect(drawn.has(m), `${m} is not drawn on either view`).toBe(true)
    }
    // The hole must stay a hole ON PURPOSE: if someone draws the anterior delt,
    // this line fails and the exception above gets deleted with it.
    for (const m of NOT_YET_DRAWN) {
      expect(drawn.has(m as never), `${m} is drawn now — remove it from NOT_YET_DRAWN`).toBe(false)
    }
  })

  it('keeps calves and forearms on BOTH views', () => {
    // A figure whose forearms vanish when you flip it reads as a rendering bug.
    for (const m of ['Calves', 'Forearms'] as const) {
      expect(musclesOnView('front')).toContain(m)
      expect(musclesOnView('back')).toContain(m)
    }
  })

  it('keeps front-only and back-only muscles where they belong', () => {
    for (const m of ['Chest', 'Quads', 'Abs/core', 'Biceps', 'Side delts', 'Adductors'] as const) {
      expect(musclesOnView('front'), `${m} left the front`).toContain(m)
      expect(musclesOnView('back'), `${m} appeared on the back`).not.toContain(m)
    }
    for (const m of ['Lats', 'Upper back', 'Lower back', 'Glutes', 'Hamstrings', 'Triceps', 'Rear delts'] as const) {
      expect(musclesOnView('back'), `${m} left the back`).toContain(m)
      expect(musclesOnView('front'), `${m} appeared on the front`).not.toContain(m)
    }
  })

  it('draws the silhouette as an actual body, not four orphan shapes', () => {
    // It WAS four: head, neck and two feet, with the muscle bellies floating in
    // the space where a torso should have been. That is the single reason the
    // figure read as an anatomy chart rather than as a person, and a regression
    // to it would be invisible to every other test here.
    expect(BASE_SHAPES.length).toBeGreaterThanOrEqual(10)
  })
})
