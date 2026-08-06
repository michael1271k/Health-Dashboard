import { MUSCLE } from '@/lib/theme/palette'
/**
 * Weekly volume landmarks — GRANULAR, per fine muscle, mapped to the ACTIVE
 * PROGRAM (Helix Cut vs Helix Bulk). Renaissance-Periodisation-style set targets.
 *
 *  - MEV = Minimum Effective Volume — below this a muscle barely grows.
 *  - MAV = Maximum Adaptive Volume — the top of the productive working range.
 *  - MRV = Maximum Recoverable Volume — beyond this is junk/overreaching volume.
 *
 * On a CUT the per-muscle number is the MEV+ target (the minimum to defend muscle
 * in a deficit); on a BULK it is the MAV target (the productive ceiling to push
 * toward). One target line per program, per muscle.
 */

/** Legacy alias: this module used to know only cut/bulk. Kept so existing
 *  importers compile while the codebase converges on `ProgramPhase`. */
export type Program = ProgramPhase
export type ProgramPhase = 'cut' | 'maintenance' | 'bulk'

/** The 13 tracked muscles (display order). */
export const LANDMARK_MUSCLES = [
  'Chest', 'Back', 'Side delts', 'Rear delts', 'Biceps', 'Triceps', 'Forearms',
  'Quads', 'Hamstrings', 'Glutes', 'Adductors', 'Calves', 'Abs/core',
] as const
export type LandmarkMuscle = (typeof LANDMARK_MUSCLES)[number]

/**
 * Weekly set targets per muscle, per PHASE (user-supplied defaults).
 *
 * `maintenance` used to be missing entirely, and the phase was inferred from
 * `calorie_goal >= 2450` — so a maintenance block silently trained to CUT
 * volume. The phase is now read from the active plan+phase, and these are the
 * defaults each (plan, phase) pair starts from before user overrides.
 */
export const PROGRAM_TARGETS: Record<ProgramPhase, Record<LandmarkMuscle, number>> = {
  // Helix Cut — MEV+ (defend muscle in the deficit)
  cut: {
    Chest: 11, Back: 11, 'Side delts': 7, 'Rear delts': 2, Biceps: 8, Triceps: 6,
    Forearms: 4, Quads: 10, Hamstrings: 8, Glutes: 6, Adductors: 0, Calves: 6, 'Abs/core': 10,
  },
  // Maintenance — between MEV+ and MAV: enough to keep progressing without the
  // recovery cost of a full bulk block.
  maintenance: {
    Chest: 12, Back: 12, 'Side delts': 8, 'Rear delts': 3, Biceps: 8, Triceps: 7,
    Forearms: 5, Quads: 11, Hamstrings: 8, Glutes: 6, Adductors: 1, Calves: 7, 'Abs/core': 10,
  },
  // Helix Bulk — MAV (productive ceiling)
  bulk: {
    Chest: 13, Back: 14, 'Side delts': 9, 'Rear delts': 3, Biceps: 9, Triceps: 7,
    Forearms: 7, Quads: 12, Hamstrings: 9, Glutes: 7, Adductors: 2, Calves: 8, 'Abs/core': 11,
  },
}

export const MUSCLE_COLOR: Record<LandmarkMuscle, string> = MUSCLE

/** Default targets for a phase. Unknown phases fall back to cut (the safe floor). */
export function programTargets(phase: ProgramPhase): Record<LandmarkMuscle, number> {
  return PROGRAM_TARGETS[phase] ?? PROGRAM_TARGETS.cut
}

/**
 * Fold a raw muscle token (from `exercises.muscle_groups`, seeded by muscleMap)
 * into one of the 13 landmark muscles, or null when it isn't a tracked target.
 * Handles both refined tokens (side_delts / rear_delts) and legacy generic ones
 * (a bare "shoulders" is treated as side-delt isolation, the common case).
 */
export function toLandmarkMuscle(token: string): LandmarkMuscle | null {
  switch (token.toLowerCase().replace(/[\s-]+/g, '_')) {
    case 'chest': case 'pecs': return 'Chest'
    case 'lats': case 'upper_back': case 'lower_back': case 'traps': case 'rhomboids': case 'back': return 'Back'
    case 'side_delts': case 'lateral_delts': case 'shoulders': case 'delts': return 'Side delts'
    case 'rear_delts': case 'rear_delt': return 'Rear delts'
    case 'front_delts': return null // pressing already covers front delts — not a separate target
    case 'biceps': return 'Biceps'
    case 'triceps': return 'Triceps'
    case 'forearms': case 'brachioradialis': return 'Forearms'
    case 'quads': case 'quadriceps': return 'Quads'
    case 'hamstrings': return 'Hamstrings'
    case 'glutes': return 'Glutes'
    case 'adductors': return 'Adductors'
    case 'abductors': return null // hip abductors aren't a tracked target
    case 'calves': return 'Calves'
    case 'abs': case 'abdominals': case 'core': case 'obliques': return 'Abs/core'
    default: return null
  }
}

export type VolumeZone = 'under' | 'building' | 'optimal' | 'over' | 'na'

/** Where this week's set count sits relative to a muscle's program target. */
export function volumeZone(weeklySets: number, target: number): VolumeZone {
  if (target <= 0) return 'na'                 // e.g. Adductors on a cut → no target
  const ratio = weeklySets / target
  if (ratio < 0.5) return 'under'              // well short of the target
  if (ratio < 1.0) return 'building'           // ramping toward it
  if (ratio <= 1.3) return 'optimal'           // at/just above the target — the sweet spot
  return 'over'                                // well beyond — recovery risk
}

export const ZONE_META: Record<VolumeZone, { label: string; color: string }> = {
  under:    { label: 'Under target', color: '#79808C' },
  building: { label: 'Building',     color: '#3D7AB8' },
  optimal:  { label: 'On target',    color: '#3E9E7A' },
  over:     { label: 'Over',         color: '#C4514E' },
  na:       { label: 'No target',    color: '#5A6472' },
}

export interface MuscleVolume {
  muscle: LandmarkMuscle
  sets: number
  target: number
  zone: VolumeZone
  color: string
}

/**
 * Accumulate committed sets per landmark muscle for a set of workout rows, then
 * grade each against the active program's target. Each row contributes ONE set
 * to every DISTINCT landmark muscle it hits (a row tagged quads+glutes adds a set
 * to both). `dedupeKey` collapses unilateral L/R sub-sets: rows sharing a key
 * count once (pass the pair id, or a unique id for bilateral rows).
 */
export function weeklyVolumeByMuscle(
  rows: Array<{ muscleTokens: string[]; dedupeKey: string }>,
  phase: ProgramPhase,
  /** Per-plan+phase user overrides (see usePlanPhaseGoals.resolveVolume). */
  overrides?: Partial<Record<LandmarkMuscle, number>>,
): MuscleVolume[] {
  const targets = { ...programTargets(phase), ...(overrides ?? {}) }
  const counted = new Map<LandmarkMuscle, Set<string>>()
  for (const row of rows) {
    const muscles = new Set(
      row.muscleTokens.map(toLandmarkMuscle).filter((m): m is LandmarkMuscle => m !== null),
    )
    for (const m of muscles) {
      const seen = counted.get(m) ?? new Set<string>()
      seen.add(row.dedupeKey)
      counted.set(m, seen)
    }
  }
  return LANDMARK_MUSCLES.map((muscle) => {
    const sets = counted.get(muscle)?.size ?? 0
    const target = targets[muscle]
    return { muscle, sets, target, zone: volumeZone(sets, target), color: MUSCLE_COLOR[muscle] }
  })
}

export interface MuscleTonnage {
  muscle: LandmarkMuscle
  volumeKg: number
  color: string
}

/**
 * Weekly TONNAGE per landmark muscle — kilograms, not set counts.
 *
 * The companion to `weeklyVolumeByMuscle` and deliberately built on the same
 * attribution rule: a lift credits every DISTINCT landmark muscle its primary
 * tags name. A hack squat's tonnage therefore lands on quads AND glutes in full,
 * exactly as its sets do, so the two breakdowns can never tell different stories
 * about the same movement.
 *
 * THE CONSEQUENCE, stated because it is otherwise a trap: the column does NOT
 * sum to the week's total volume. Compound work is counted once per muscle it
 * trains, which is the only way a per-muscle figure is comparable across
 * movements — but it means adding the rows up over-counts. The week's true total
 * is Σ session volume and is printed separately.
 *
 * Rows arrive PRE-COLLAPSED: `volumeKg` must already be the tonnage of that
 * movement under `sessionVolumeKg`'s rules (a unilateral L/R pair scored at the
 * weaker side, counted twice), so this figure and the Session Report's are the
 * same arithmetic. Muscles with no work are omitted rather than printed as 0.
 */
export function weeklyTonnageByMuscle(
  rows: Array<{ muscleTokens: string[]; volumeKg: number }>,
): MuscleTonnage[] {
  const agg = new Map<LandmarkMuscle, number>()
  for (const row of rows) {
    if (!Number.isFinite(row.volumeKg) || row.volumeKg <= 0) continue
    const muscles = new Set(
      row.muscleTokens.map(toLandmarkMuscle).filter((m): m is LandmarkMuscle => m !== null),
    )
    for (const m of muscles) agg.set(m, (agg.get(m) ?? 0) + row.volumeKg)
  }
  return LANDMARK_MUSCLES
    .filter((m) => (agg.get(m) ?? 0) > 0)
    // Heaviest first — the reader wants the week's emphasis, not the enum order.
    .map((muscle) => ({
      muscle,
      // Quarter-kg microloads are real; two decimals is the smallest place a
      // plate reaches, and it kills float drift without inventing precision.
      volumeKg: Math.round((agg.get(muscle) as number) * 100) / 100,
      color: MUSCLE_COLOR[muscle],
    }))
    .sort((a, b) => b.volumeKg - a.volumeKg)
}

// ─── Legacy 6-group MEV/MAV/MRV bands ─────────────────────────────────────────
// Retained for the per-session Muscle Focus card, which grades that session's
// sets against a broad-group band (the six aggregate display groups). The
// granular per-program system above powers the weekly accumulator.
export interface Landmark { mev: number; mav: number; mrv: number }

export const VOLUME_LANDMARKS: Record<string, Landmark> = {
  Chest:     { mev: 10, mav: 16, mrv: 22 },
  Back:      { mev: 10, mav: 18, mrv: 25 },
  Shoulders: { mev: 8,  mav: 16, mrv: 26 },
  Arms:      { mev: 8,  mav: 16, mrv: 24 },
  Legs:      { mev: 12, mav: 20, mrv: 32 },
  Core:      { mev: 6,  mav: 14, mrv: 25 },
}

export function landmarkFor(group: string): Landmark | null {
  return VOLUME_LANDMARKS[group] ?? null
}

/** Where a set count sits on a broad-group MEV→MAV→MRV band. */
export function bandZone(weeklySets: number, l: Landmark): VolumeZone {
  if (weeklySets < l.mev) return 'under'
  if (weeklySets < l.mav) return 'building'
  if (weeklySets <= l.mrv) return 'optimal'
  return 'over'
}
