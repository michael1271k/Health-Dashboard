import { LANDMARK_MUSCLES, type LandmarkMuscle } from '@/lib/training/landmarks'
import { musclesOnView, type AtlasView } from '@/lib/body/atlas'

/**
 * The RASTER atlas — a photo-real body, tinted through per-muscle masks.
 *
 * ── WHY VECTOR CANNOT GO FURTHER ─────────────────────────────────────────────
 * `atlas.ts` draws a body out of ~33 muscle paths, a 12-shape silhouette and 52
 * definition lines, shaded by three gradients. That is about as far as bézier
 * curves go: it reads as a sculpted figure, and it will never read as a render,
 * because a render is a million samples of light and a path is an outline.
 *
 * A rasterised body gets there instantly — and would normally cost the one
 * property this figure exists for, that a single muscle can be lit independently
 * of the other fourteen. A flat PNG is one image; you cannot colour its lats.
 *
 * ── WHAT MAKES IT WORK ANYWAY ────────────────────────────────────────────────
 * Masks. The body ships greyscale, carrying all of the shading. Each muscle
 * ships as a separate alpha mask on the same canvas. To light a muscle we lay a
 * rectangle of the workout's colour over the body, mask it to that muscle's
 * shape, and composite it with `mix-blend-mode: color` — which takes hue and
 * saturation from the tint and LUMINANCE FROM THE PHOTO. The muscle ends up
 * coloured and still modelled, rather than painted flat.
 *
 * ── WHAT STAYS VECTOR, AND WHY ───────────────────────────────────────────────
 *   · HIT TESTING. A raster has no geometry to click. `MUSCLE_PATHS` are drawn
 *     over the top as transparent paths, so tapping a muscle keeps working and
 *     the vector geometry remains the single source of truth for WHERE a muscle
 *     is — the raster only says what it LOOKS like.
 *   · THE iOS WIDGET. SwiftUI has no CSS masks, and `atlas-parity.test.ts`
 *     exists to stop two hand-drawn anatomies diverging. The widget keeps
 *     drawing the generated `Path`s.
 *   · SMALL SIZES. The 36px header button is a tinted blob either way; loading
 *     nineteen images for it would be absurd. The raster is for the sheet.
 *
 * ── IT IS DORMANT UNTIL THE ASSETS EXIST ─────────────────────────────────────
 * Nothing here loads unless `public/atlas/` is populated. `MuscleAtlas` probes
 * for the base image and falls back to the vector figure if it 404s, so an
 * un-populated build looks exactly like today's.
 */

/** Where the files live, relative to the site root. */
export const ATLAS_ASSET_DIR = '/atlas'

/**
 * Canvas size for every file — 5× the 120 × 260 viewBox.
 *
 * Five, not four or eight: the largest the figure ever renders is the sheet's
 * ~260px column, which at a 3× device pixel ratio needs 780px of height. 1300
 * clears that with room for a bigger surface later, and an exact multiple of the
 * viewBox keeps the vector hit-layer's coordinates a trivial scale of the
 * raster's rather than a rounding of one.
 */
export const RASTER_SIZE = { width: 600, height: 1300 } as const

/** `'Abs/core'` → `'abs-core'`. Filenames are derived, so there is no table to drift. */
export function muscleSlug(muscle: LandmarkMuscle): string {
  return muscle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/** The greyscale body for a view. */
export function bodyUrl(view: AtlasView): string {
  return `${ATLAS_ASSET_DIR}/body-${view}.webp`
}

/** One muscle's alpha mask on a view. */
export function maskUrl(view: AtlasView, muscle: LandmarkMuscle): string {
  return `${ATLAS_ASSET_DIR}/mask-${view}-${muscleSlug(muscle)}.webp`
}

/**
 * Every file the raster atlas needs, in the order you would produce them.
 *
 * Exported because it IS the specification: a test asserts it covers exactly the
 * muscles each view draws, so the manifest cannot fall behind the anatomy, and
 * it can be printed for whoever is making the art.
 */
export function assetManifest(): string[] {
  const out: string[] = []
  for (const view of ['front', 'back'] as const) {
    out.push(bodyUrl(view))
    for (const m of musclesOnView(view)) out.push(maskUrl(view, m))
  }
  return out
}

/** Every landmark that appears on at least one view — a sanity handle for tests. */
export const RASTER_MUSCLES: readonly LandmarkMuscle[] = LANDMARK_MUSCLES.filter(
  (m) => musclesOnView('front').includes(m) || musclesOnView('back').includes(m),
)

/**
 * Is the raster layer switched on at all?
 *
 * An env flag rather than a hardcoded `true`, so the assets can land on a branch
 * and be looked at before every surface in the app changes at once. Even when
 * on, `RasterAtlas` still falls back to the vector figure if the body image
 * fails to load — a missing file must degrade, never blank the body.
 */
export const RASTER_ATLAS_ENABLED = process.env.NEXT_PUBLIC_RASTER_ATLAS === '1'
