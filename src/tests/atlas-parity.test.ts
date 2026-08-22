import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { generate, tokenize, swiftPath, readAtlas } from '../../scripts/gen-atlas-swift.mjs'
import { MUSCLE_PATHS, BASE_SHAPES, ATLAS_VIEWBOX, musclesOnView } from '@/lib/body/atlas'
import { LANDMARK_MUSCLES } from '@/lib/training/landmarks'

/**
 * ONE anatomy, two renderers.
 *
 * The app draws SVG and the widget draws SwiftUI `Path`s, and there is no way
 * to share a runtime between them — so the Swift is GENERATED from the same
 * source and this test is what stops the two separating. A body drawn twice by
 * hand drifts the first time either copy is nudged, and the failure is
 * invisible: both still look like a body.
 */

const SOURCE = readFileSync('src/lib/body/atlas.ts', 'utf8')
const SWIFT = readFileSync('ios/App/HelixWidgets/HelixAtlas.swift', 'utf8')

describe('the generated Swift atlas', () => {
  it('is exactly what the generator produces from the current atlas', () => {
    // The whole contract. If this fails: node scripts/gen-atlas-swift.mjs
    expect(SWIFT).toBe(generate(SOURCE))
  })

  it('carries every muscle path the app draws', () => {
    const { paths } = readAtlas(SOURCE)
    expect(paths.length).toBe(MUSCLE_PATHS.length)
    for (const p of MUSCLE_PATHS) {
      expect(SWIFT, `${p.muscle} (${p.view})`).toContain(`muscle: "${p.muscle}", view: .${p.view}`)
    }
  })

  it('carries the silhouette too — a figure with no head is a diagram', () => {
    const { base } = readAtlas(SOURCE)
    expect(base.length).toBe(BASE_SHAPES.length)
  })

  it('shares the viewBox, so the two figures have the same proportions', () => {
    expect(SWIFT).toContain(`CGSize(width: ${ATLAS_VIEWBOX.width}, height: ${ATLAS_VIEWBOX.height})`)
  })
})

describe('the path parser', () => {
  it('reads absolute M / L / C / Z', () => {
    expect(tokenize('M1,2 L3,4 Z').map((t) => t.cmd)).toEqual(['M', 'L', 'Z'])
  })

  it('REFUSES a relative command rather than emitting a subtly wrong body', () => {
    // A body missing one segment still looks like a body — which is exactly why
    // this throws instead of doing its best.
    expect(() => tokenize('M1,2 l3,4')).toThrow(/relative/)
  })

  it('turns one cubic into one addCurve with the control points in order', () => {
    expect(swiftPath('M0,0 C1,2 3,4 5,6')).toContain(
      'p.addCurve(to: pt(5, 6, in: rect), control1: pt(1, 2, in: rect), control2: pt(3, 4, in: rect))')
  })

  it('rejects a malformed curve rather than dropping the remainder', () => {
    expect(() => swiftPath('M0,0 C1,2 3,4')).toThrow(/multiples of 6/)
  })
})

describe('the anatomy itself', () => {
  it('uses only the four commands the generator implements', () => {
    for (const p of [...MUSCLE_PATHS.map((m) => m.d), ...BASE_SHAPES]) {
      expect(p, p).toMatch(/^[MLCZ0-9,.\s-]+$/)
    }
  })

  it('keeps every coordinate inside the viewBox', () => {
    // A belly drawn off-canvas renders as a clipped smear in the app and as
    // nothing at all in the widget's smaller rect.
    for (const p of MUSCLE_PATHS) {
      const nums = (p.d.match(/-?\d*\.?\d+/g) ?? []).map(Number)
      for (let i = 0; i < nums.length; i += 2) {
        expect(nums[i], `${p.muscle} x`).toBeGreaterThanOrEqual(0)
        expect(nums[i], `${p.muscle} x`).toBeLessThanOrEqual(ATLAS_VIEWBOX.width)
        expect(nums[i + 1], `${p.muscle} y`).toBeGreaterThanOrEqual(0)
        expect(nums[i + 1], `${p.muscle} y`).toBeLessThanOrEqual(ATLAS_VIEWBOX.height)
      }
    }
  })

  it('draws the anterior chain in front and the posterior chain behind', () => {
    expect(musclesOnView('front')).toEqual([
      'Chest', 'Front delts', 'Side delts', 'Biceps', 'Forearms', 'Quads', 'Adductors', 'Calves', 'Abs/core',
    ])
    expect(musclesOnView('back')).toEqual([
      // LANDMARK_MUSCLES order, not drawing order — hamstrings before glutes.
      'Lats', 'Upper back', 'Lower back', 'Rear delts', 'Triceps', 'Forearms',
      'Hamstrings', 'Glutes', 'Calves',
    ])
  })

  it('draws every landmark muscle that has geometry', () => {
    // `Front delts` is knowingly absent — see the note in atlas-detail.test.ts.
    // It is a landmark in the arithmetic without an anterior-deltoid shape yet.
    const drawn = new Set(MUSCLE_PATHS.map((p) => p.muscle))
    for (const m of LANDMARK_MUSCLES) {
      expect(drawn, m).toContain(m)
    }
  })
})
