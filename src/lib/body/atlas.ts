import { LANDMARK_MUSCLES, type LandmarkMuscle } from '@/lib/training/landmarks'
import type { DomsMuscle } from '@/lib/hooks/useRecovery'

/**
 * The muscle atlas — ONE anatomy, for every surface that draws a body.
 *
 * ── THREE TAXONOMIES MET HERE ────────────────────────────────────────────────
 * Helix speaks three muscle languages and none of them was anatomical:
 *
 *   · raw program tokens   (`muscleMap.ts` — 'lats', 'inner_thigh', 'pecs')
 *   · 13 LANDMARK MUSCLES  (`landmarks.ts` — what volume is targeted against)
 *   · 9 DOMS muscles       (`useRecovery.ts` — what soreness is reported in)
 *
 * The atlas is keyed on the LANDMARK muscles, because those are the ones the
 * program actually prescribes and the only set that distinguishes the things a
 * lifter cares about (side delts from rear delts, quads from hamstrings). The
 * other two fold INTO it — never the reverse, because both are coarser and
 * folding the other way would have to invent detail.
 *
 * ── ONE VIEWBOX, FOREVER ─────────────────────────────────────────────────────
 * 120 × 260, with a shared skeleton: head at cy 22, shoulders at y 48, waist at
 * y 130, knees at y 190, ankles at y 240. Front and back therefore line up when
 * the view flips, and the soreness map's existing geometry carries over
 * unchanged — this is a REORGANISATION of paths that were already drawn and
 * already looked right, not a redraw.
 *
 * ── AND IT IS PLAIN DATA ─────────────────────────────────────────────────────
 * No React, no colour, no severity. `MuscleAtlas.tsx` decides how a worked
 * muscle looks; `scripts/gen-atlas-swift.mjs` turns the same strings into
 * SwiftUI `Path` builders for the widget, because SwiftUI cannot parse an SVG
 * `d` attribute. A parity test asserts the two can never drift.
 */

export const ATLAS_VIEWBOX = { width: 120, height: 260 } as const

export type AtlasView = 'front' | 'back'

export interface AtlasPath {
  muscle: LandmarkMuscle
  view: AtlasView
  /** Path data on the 120 × 260 viewBox. `M`, `L`, `C` and `Z` only — the
   *  Swift generator implements exactly those four commands. */
  d: string
}

/**
 * The silhouette that is NOT data: head, neck and feet.
 *
 * Drawn under every view and never interactive. Without it the figure ends at
 * the ankle and starts at the collarbone, which reads as a diagram of meat
 * rather than as a body.
 */
export const BASE_SHAPES: readonly string[] = [
  // Head
  'M60,8 C67.7,8 74,14.3 74,22 C74,29.7 67.7,36 60,36 C52.3,36 46,29.7 46,22 C46,14.3 52.3,8 60,8 Z',
  // Neck
  'M53,35 L67,35 L67,45 L53,45 Z',
  // Feet
  'M43,240 L53,240 L54,251 L42,251 Z',
  'M77,240 L67,240 L66,251 L78,251 Z',
]

/**
 * Every muscle belly, per view.
 *
 * ── WHY SOME MUSCLES APPEAR ON ONE VIEW ONLY ─────────────────────────────────
 * Chest, quads and abs are front; back, glutes, hamstrings and rear delts are
 * back. Calves and forearms appear on BOTH, because they genuinely are visible
 * from both and a figure whose forearms vanish when you flip it reads as a
 * rendering bug. A muscle drawn on both views carries the same intensity in
 * both — it is one muscle, seen twice.
 *
 * The arm is split at the elbow (y ≈ 107): above it is biceps on the front and
 * triceps on the back, below it is forearm on either. The soreness map drew one
 * undivided "Arms" shape, which is exactly the distinction the 13-muscle
 * vocabulary exists to make.
 */
export const MUSCLE_PATHS: readonly AtlasPath[] = [
  // ── FRONT ──
  { muscle: 'Side delts', view: 'front', d: 'M38,44 C28,45 21,52 20,64 L33,69 C34,58 39,53 45,51 Z' },
  { muscle: 'Side delts', view: 'front', d: 'M82,44 C92,45 99,52 100,64 L87,69 C86,58 81,53 75,51 Z' },
  { muscle: 'Chest', view: 'front', d: 'M45,50 L75,50 C82,52 84,60 83,72 C76,80 66,83 60,83 C54,83 44,80 37,72 C36,60 38,52 45,50 Z' },
  { muscle: 'Abs/core', view: 'front', d: 'M42,86 L78,86 C79,102 77,118 72,132 L48,132 C43,118 41,102 42,86 Z' },
  { muscle: 'Biceps', view: 'front', d: 'M22,68 C19,80 18,94 19,107 L31,105 C31,92 33,80 34,72 Z' },
  { muscle: 'Biceps', view: 'front', d: 'M98,68 C101,80 102,94 101,107 L89,105 C89,92 87,80 86,72 Z' },
  { muscle: 'Forearms', view: 'front', d: 'M19,109 C19,122 21,136 27,147 L35,144 C31,134 29,121 30,107 Z' },
  { muscle: 'Forearms', view: 'front', d: 'M101,109 C101,122 99,136 93,147 L85,144 C89,134 91,121 90,107 Z' },
  { muscle: 'Quads', view: 'front', d: 'M43,133 C38,149 37,169 40,189 L53,189 C55,171 56,151 58,135 Z' },
  { muscle: 'Quads', view: 'front', d: 'M77,133 C82,149 83,169 80,189 L67,189 C65,171 64,151 62,135 Z' },
  // Adductors: the inner sliver of each thigh. Small on purpose — it is a small
  // muscle, and drawing it larger to make it tappable would misstate the
  // anatomy on the one surface whose job is to state the anatomy.
  { muscle: 'Adductors', view: 'front', d: 'M55,136 C56,152 57,166 58,178 L60,178 C60,160 60,146 59,136 Z' },
  { muscle: 'Adductors', view: 'front', d: 'M65,136 C64,152 63,166 62,178 L60,178 C60,160 60,146 61,136 Z' },
  { muscle: 'Calves', view: 'front', d: 'M41,193 C40,209 41,227 43,240 L53,240 C54,224 54,207 53,193 Z' },
  { muscle: 'Calves', view: 'front', d: 'M79,193 C80,209 79,227 77,240 L67,240 C66,224 66,207 67,193 Z' },

  // ── BACK ──
  { muscle: 'Rear delts', view: 'back', d: 'M38,44 C28,45 21,52 20,64 L33,69 C34,58 39,53 45,51 Z' },
  { muscle: 'Rear delts', view: 'back', d: 'M82,44 C92,45 99,52 100,64 L87,69 C86,58 81,53 75,51 Z' },
  { muscle: 'Back', view: 'back', d: 'M45,50 L75,50 C83,53 86,64 84,81 C80,97 72,105 60,107 C48,105 40,97 36,81 C34,64 37,53 45,50 Z' },
  { muscle: 'Triceps', view: 'back', d: 'M22,68 C19,80 18,94 19,107 L31,105 C31,92 33,80 34,72 Z' },
  { muscle: 'Triceps', view: 'back', d: 'M98,68 C101,80 102,94 101,107 L89,105 C89,92 87,80 86,72 Z' },
  { muscle: 'Forearms', view: 'back', d: 'M19,109 C19,122 21,136 27,147 L35,144 C31,134 29,121 30,107 Z' },
  { muscle: 'Forearms', view: 'back', d: 'M101,109 C101,122 99,136 93,147 L85,144 C89,134 91,121 90,107 Z' },
  { muscle: 'Glutes', view: 'back', d: 'M43,109 C37,117 36,131 41,141 C48,146 55,145 59,140 L59,109 Z' },
  { muscle: 'Glutes', view: 'back', d: 'M77,109 C83,117 84,131 79,141 C72,146 65,145 61,140 L61,109 Z' },
  { muscle: 'Hamstrings', view: 'back', d: 'M41,145 C38,161 38,177 41,190 L54,190 C55,175 56,159 58,145 Z' },
  { muscle: 'Hamstrings', view: 'back', d: 'M79,145 C82,161 82,177 79,190 L66,190 C65,175 64,159 62,145 Z' },
  { muscle: 'Calves', view: 'back', d: 'M42,194 C40,209 41,226 44,237 L54,237 C55,223 55,207 54,194 Z' },
  { muscle: 'Calves', view: 'back', d: 'M78,194 C80,209 79,226 76,237 L66,237 C65,223 65,207 66,194 Z' },
]

/** Every landmark muscle drawn on a view, in the canonical display order. */
export function musclesOnView(view: AtlasView): LandmarkMuscle[] {
  const present = new Set(MUSCLE_PATHS.filter((p) => p.view === view).map((p) => p.muscle))
  return LANDMARK_MUSCLES.filter((m) => present.has(m))
}

/** The view a muscle is drawn on, preferring front when it is on both. */
export function primaryViewOf(muscle: LandmarkMuscle): AtlasView | null {
  if (MUSCLE_PATHS.some((p) => p.muscle === muscle && p.view === 'front')) return 'front'
  if (MUSCLE_PATHS.some((p) => p.muscle === muscle && p.view === 'back')) return 'back'
  return null
}

/**
 * DOMS → landmark. One reported muscle can cover several landmarks: "Arms" is
 * biceps, triceps and forearms, and a sore arm is all three as far as a person
 * tapping a body map is concerned.
 */
export const DOMS_TO_LANDMARK: Record<DomsMuscle, readonly LandmarkMuscle[]> = {
  Chest: ['Chest'],
  Back: ['Back'],
  Arms: ['Biceps', 'Triceps', 'Forearms'],
  Shoulders: ['Side delts', 'Rear delts'],
  Abs: ['Abs/core'],
  Glutes: ['Glutes'],
  Quads: ['Quads'],
  Hamstrings: ['Hamstrings'],
  Calves: ['Calves'],
}

/** landmark → DOMS. The inverse of the fold above, and necessarily lossy. */
export function landmarkToDoms(muscle: LandmarkMuscle): DomsMuscle | null {
  for (const [doms, landmarks] of Object.entries(DOMS_TO_LANDMARK) as Array<[DomsMuscle, readonly LandmarkMuscle[]]>) {
    if (landmarks.includes(muscle)) return doms
  }
  return null
}

/**
 * Spread a DOMS severity map across the landmarks it covers.
 *
 * Severity is 0–3 in the tracker and 0–1 here, because the atlas draws
 * INTENSITY and does not know what the number means. Keeping the tracker's
 * scale would make the atlas an opinion about soreness rather than a renderer.
 */
export function domsToWorked(
  doms: Partial<Record<DomsMuscle, number>> | undefined,
  maxSeverity = 3,
): Partial<Record<LandmarkMuscle, number>> {
  const out: Partial<Record<LandmarkMuscle, number>> = {}
  if (!doms) return out
  for (const [muscle, severity] of Object.entries(doms) as Array<[DomsMuscle, number]>) {
    if (!severity) continue
    const intensity = Math.max(0, Math.min(1, severity / maxSeverity))
    for (const landmark of DOMS_TO_LANDMARK[muscle] ?? []) {
      out[landmark] = Math.max(out[landmark] ?? 0, intensity)
    }
  }
  return out
}

/**
 * Normalise a set-count map into 0–1 intensities.
 *
 * Relative to the session's OWN hardest-worked muscle, not to a weekly target:
 * the atlas beside a finished session answers "where did this go", and grading
 * one session against a week's target would paint every session mostly empty.
 */
export function setsToWorked(
  sets: Partial<Record<LandmarkMuscle, number>>,
): Partial<Record<LandmarkMuscle, number>> {
  const values = Object.values(sets).filter((v): v is number => typeof v === 'number' && v > 0)
  if (!values.length) return {}
  const max = Math.max(...values)
  const out: Partial<Record<LandmarkMuscle, number>> = {}
  for (const [muscle, count] of Object.entries(sets) as Array<[LandmarkMuscle, number]>) {
    if (!count || count <= 0) continue
    // A floor of 0.25: a muscle that got one set out of twelve still HAPPENED,
    // and fading it to invisible would report it as untrained.
    out[muscle] = Math.max(0.25, Math.min(1, count / max))
  }
  return out
}
