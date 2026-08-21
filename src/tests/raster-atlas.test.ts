import { describe, it, expect } from 'vitest'
import {
  ATLAS_VIEWBOX, musclesOnView,
} from '@/lib/body/atlas'
import {
  RASTER_SIZE, RASTER_MUSCLES, assetManifest, bodyUrl, maskUrl, muscleSlug,
} from '@/lib/body/rasterAtlas'
import { LANDMARK_MUSCLES } from '@/lib/training/landmarks'

/**
 * ── THE MANIFEST IS THE SPECIFICATION ────────────────────────────────────────
 *
 * The raster body is nineteen files that a human has to produce by hand, and the
 * failure mode is quiet: a mask nobody drew means one muscle silently never
 * lights, on a figure whose entire job is showing which muscles lit. Nothing in
 * the type system can catch that, and neither can a build — the files are
 * fetched at runtime.
 *
 * So the manifest is DERIVED from the anatomy rather than typed out, and this
 * pins the derivation. Add a muscle to a view and the required file appears in
 * the list; forget to draw it and the list still says it is missing.
 */

describe('the asset manifest', () => {
  it('asks for exactly one body and one mask per muscle drawn on each view', () => {
    const want = 2 + musclesOnView('front').length + musclesOnView('back').length
    expect(assetManifest()).toHaveLength(want)
  })

  it('names every file after the muscle it holds, with no lookup table', () => {
    // Derived names are what keep the manifest and the renderer in step: if the
    // slug is computed on both sides, a rename cannot half-land.
    expect(muscleSlug('Abs/core')).toBe('abs-core')
    expect(muscleSlug('Side delts')).toBe('side-delts')
    expect(muscleSlug('Upper back')).toBe('upper-back')
    expect(maskUrl('front', 'Abs/core')).toBe('/atlas/mask-front-abs-core.webp')
    expect(bodyUrl('back')).toBe('/atlas/body-back.webp')
  })

  it('produces a unique filename per muscle — no two masks can collide', () => {
    const slugs = LANDMARK_MUSCLES.map(muscleSlug)
    expect(new Set(slugs).size).toBe(LANDMARK_MUSCLES.length)
  })

  it('covers the back split, which is three masks and not one', () => {
    const files = assetManifest()
    for (const m of ['lats', 'upper-back', 'lower-back']) {
      expect(files, `no mask for ${m}`).toContain(`/atlas/mask-back-${m}.webp`)
    }
  })

  it('lists no muscle that is drawn on neither view', () => {
    for (const m of RASTER_MUSCLES) {
      const drawn = musclesOnView('front').includes(m) || musclesOnView('back').includes(m)
      expect(drawn, `${m} is in RASTER_MUSCLES but drawn nowhere`).toBe(true)
    }
  })
})

describe('the canvas', () => {
  it('is an exact multiple of the viewBox, so the hit layer stays in register', () => {
    // The vector paths are laid over the raster to catch taps. A canvas that is
    // not a clean multiple of 120 × 260 means the two are related by a rounding
    // rather than a scale, and the tap targets drift from the pixels.
    expect(RASTER_SIZE.width % ATLAS_VIEWBOX.width).toBe(0)
    expect(RASTER_SIZE.height % ATLAS_VIEWBOX.height).toBe(0)
    expect(RASTER_SIZE.width / ATLAS_VIEWBOX.width)
      .toBe(RASTER_SIZE.height / ATLAS_VIEWBOX.height)
  })

  it('is big enough for the largest surface at 3× pixel density', () => {
    // The sheet renders the figure in a ~260px column; a 3× screen needs 780px.
    expect(RASTER_SIZE.height).toBeGreaterThanOrEqual(260 * 3)
  })
})
