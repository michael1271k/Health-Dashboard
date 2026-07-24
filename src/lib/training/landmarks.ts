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

export type Program = 'cut' | 'bulk'

/** The 13 tracked muscles (display order). */
export const LANDMARK_MUSCLES = [
  'Chest', 'Back', 'Side delts', 'Rear delts', 'Biceps', 'Triceps', 'Forearms',
  'Quads', 'Hamstrings', 'Glutes', 'Adductors', 'Calves', 'Abs/core',
] as const
export type LandmarkMuscle = (typeof LANDMARK_MUSCLES)[number]

/** Weekly set targets per muscle, per program (user-supplied). */
export const PROGRAM_TARGETS: Record<Program, Record<LandmarkMuscle, number>> = {
  // Helix Cut — MEV+ (defend muscle in the deficit)
  cut: {
    Chest: 11, Back: 11, 'Side delts': 7, 'Rear delts': 2, Biceps: 8, Triceps: 6,
    Forearms: 4, Quads: 10, Hamstrings: 8, Glutes: 6, Adductors: 0, Calves: 6, 'Abs/core': 10,
  },
  // Helix Bulk — MAV (productive ceiling)
  bulk: {
    Chest: 13, Back: 14, 'Side delts': 9, 'Rear delts': 3, Biceps: 9, Triceps: 7,
    Forearms: 7, Quads: 12, Hamstrings: 9, Glutes: 7, Adductors: 2, Calves: 8, 'Abs/core': 11,
  },
}

/** 13 distinguishable Obsidian & Ember tones — a warm→cool ramp, none neon. */
export const MUSCLE_COLOR: Record<LandmarkMuscle, string> = {
  Chest: '#E2683A',        // ember
  Back: '#6E8CA0',         // slate blue
  'Side delts': '#C9A227', // brass
  'Rear delts': '#A08A6B', // taupe
  Biceps: '#B0757A',       // dusty rose
  Triceps: '#C9752F',      // copper
  Forearms: '#8C7BA0',     // muted violet-grey
  Quads: '#B84F28',        // banked ember
  Hamstrings: '#5E9E8F',   // teal-grey
  Glutes: '#8A9A5B',       // olive
  Adductors: '#7F8B9C',    // cool slate
  Calves: '#4FB477',       // sage
  'Abs/core': '#9AA6B8',   // steel
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
  building: { label: 'Building',     color: '#8AA0B8' },
  optimal:  { label: 'On target',    color: '#4FB477' },
  over:     { label: 'Over',         color: '#D5514E' },
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
  program: Program,
): MuscleVolume[] {
  const targets = PROGRAM_TARGETS[program]
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
