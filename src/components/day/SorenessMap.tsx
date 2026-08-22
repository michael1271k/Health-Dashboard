'use client'

import { DOMS_MUSCLES, type DomsMuscle } from '@/lib/hooks/useRecovery'
import { MuscleAtlas } from '@/components/body/MuscleAtlas'
import { domsToWorked, landmarkToDoms, musclesOnView, type AtlasView } from '@/lib/body/atlas'
import type { LandmarkMuscle } from '@/lib/training/landmarks'
import { MUTED } from '@/lib/theme/palette'
import { SEVERITY_COLOR } from '@/components/day/severity'

/**
 * The 2D soreness map — two hand-authored silhouettes, one `<path>` per tracked
 * muscle, tinted by that muscle's severity.
 *
 * WHY NOT A LIBRARY
 * `react-body-highlighter` and friends ship their own muscle vocabulary (which
 * would have to be mapped onto DOMS_MUSCLES in both directions), weigh ~40 kB,
 * and are unmaintained. The whole asset here is a few hundred bytes of path
 * data with no runtime.
 *
 * WHY NOT THE OLD `BodyHeatmap` (deleted from HelixViz.tsx)
 * Its `REGIONS` were six coarse blobs — one `Legs`, one `Arms`. Quads vs
 * Hamstrings vs Calves is precisely the distinction DOMS exists to make, so
 * reusing it would have erased the data it is meant to show. That argument is
 * why it never got reused, and eventually why it was removed outright.
 *
 * ACCESSIBILITY
 * Every region is a real `<button>` wrapping its path with an `aria-label` and
 * `aria-pressed`, so the map is operable by keyboard and readable by a screen
 * reader. The text list in `DomsTracker` remains as the equivalent non-visual
 * path — the map is a better view of the same data, never the only one.
 */

/** The broad areas a tap opens. One popup lists every muscle in the group. */
export type SorenessGroup = 'torso' | 'back' | 'arms' | 'legs'

export const GROUP_MUSCLES: Record<SorenessGroup, readonly DomsMuscle[]> = {
  torso: ['Chest', 'Abs'],
  back: ['Back'],
  arms: ['Shoulders', 'Arms'],
  legs: ['Glutes', 'Quads', 'Hamstrings', 'Calves'],
}

export const GROUP_LABEL: Record<SorenessGroup, string> = {
  torso: 'Chest & Core',
  back: 'Back',
  arms: 'Shoulders & Arms',
  legs: 'Legs',
}

/** Which popup a muscle belongs to. Total: every DOMS muscle has exactly one. */
export function groupOf(muscle: DomsMuscle): SorenessGroup {
  for (const g of Object.keys(GROUP_MUSCLES) as SorenessGroup[]) {
    if (GROUP_MUSCLES[g].includes(muscle)) return g
  }
  // Unreachable while GROUP_MUSCLES covers DOMS_MUSCLES — asserted by a test.
  return 'torso'
}

/**
 * ── THE GEOMETRY MOVED ───────────────────────────────────────────────────────
 * The 21 hand-authored paths that used to live here are now `MUSCLE_PATHS` in
 * `lib/body/atlas.ts`, keyed on the 13 LANDMARK muscles rather than the 9 DOMS
 * ones. Same viewBox, same skeleton, same silhouette — this is a
 * reorganisation, not a redraw.
 *
 * Why it had to move: the widget needs the same figure and SwiftUI cannot parse
 * an SVG `d`, so the paths are now generated into `HelixAtlas.swift` from one
 * source with a parity test. A second copy of a body drawn by hand would drift
 * the first time either was nudged, and nobody would notice until the two
 * surfaces disagreed about where the glutes are.
 *
 * What stays here is the SORENESS vocabulary: the groups a tap opens, and the
 * fold from a DOMS severity onto the atlas's intensities. That is this file's
 * actual job.
 */

/**
 * The group a drawn muscle opens.
 *
 * Every landmark the atlas draws must lead somewhere, and one of them —
 * Adductors — has no DOMS muscle at all: soreness is reported in nine muscles
 * and the inner thigh is not one of them. Rather than invent a tenth rating (or
 * fold adductors into Quads, which would light the wrong belly whenever a leg
 * day was sore), the tap opens the Legs picker, where the muscles that ARE
 * rated live.
 */
export function groupOfLandmark(muscle: LandmarkMuscle): SorenessGroup {
  const doms = landmarkToDoms(muscle)
  if (doms) return groupOf(doms)
  return muscle === 'Adductors' ? 'legs' : 'torso'
}

/** Every muscle drawn on a given view. Order follows DOMS_MUSCLES. */
export function musclesOnSide(side: AtlasView): DomsMuscle[] {
  const present = new Set(
    musclesOnView(side).map(landmarkToDoms).filter((m): m is DomsMuscle => m !== null),
  )
  return DOMS_MUSCLES.filter((m) => present.has(m))
}

export function SorenessMap({ side, doms, onPick, className = '' }: {
  side: AtlasView
  /** muscle → severity 0–3. Missing means unrated, drawn as the empty fill. */
  doms: Partial<Record<DomsMuscle, number>> | undefined
  /** Fired with the tapped region's group so the host can open its picker. */
  onPick: (group: SorenessGroup) => void
  className?: string
}) {
  // Severity 0–3 → intensity 0–1. The atlas draws intensity and has no opinion
  // about what it means; the COLOUR still comes from the soreness scale, which
  // is this surface's own vocabulary and not the atlas's.
  const worked = domsToWorked(doms)
  // The most severe muscle on this view decides the hue — one figure cannot
  // carry four severity colours without becoming a heat map of nothing.
  const peak = Math.max(0, ...musclesOnSide(side).map((m) => doms?.[m] ?? 0))
  const color = SEVERITY_COLOR[peak] ?? MUTED

  return (
    <MuscleAtlas
      view={side}
      worked={worked}
      color={color}
      interactive
      className={className}
      label={`Soreness map, ${side} view`}
      onPick={(muscle) => onPick(groupOfLandmark(muscle))}
    />
  )
}
