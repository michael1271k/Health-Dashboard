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

/**
 * The 16 tracked muscles (display order).
 *
 * ── WHY `Back` BECAME THREE ─────────────────────────────────────────────────
 * It was one landmark, so a lat pulldown, a face pull and a rack pull all
 * scored against a single weekly number — and any back session read as balanced
 * whatever it actually trained. It also made the muscle breakdown impossible to
 * compare with Hevy line by line, since Hevy separates the three.
 *
 * The split costs nothing in the atlas: the trapezius, the two lats and the
 * erector column were already four separate paths that happened to share a key.
 */
export const LANDMARK_MUSCLES = [
  'Chest', 'Lats', 'Upper back', 'Lower back',
  'Front delts', 'Side delts', 'Rear delts',
  'Biceps', 'Triceps', 'Forearms',
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
  // The three back numbers sum to the single `Back` target they replaced
  // (11 / 12 / 14), split the way the program actually trains it: pulldowns and
  // rows are lat-dominant, and the erector work is incidental to RDLs and hip
  // thrusts rather than directly prescribed.
  cut: {
    Chest: 11, Lats: 6, 'Upper back': 4, 'Lower back': 1,
    'Front delts': 4, 'Side delts': 7, 'Rear delts': 2, Biceps: 8, Triceps: 6,
    Forearms: 4, Quads: 10, Hamstrings: 8, Glutes: 6, Adductors: 0, Calves: 6, 'Abs/core': 10,
  },
  // Maintenance — between MEV+ and MAV: enough to keep progressing without the
  // recovery cost of a full bulk block.
  maintenance: {
    Chest: 12, Lats: 7, 'Upper back': 4, 'Lower back': 1,
    'Front delts': 5, 'Side delts': 8, 'Rear delts': 3, Biceps: 8, Triceps: 7,
    Forearms: 5, Quads: 11, Hamstrings: 8, Glutes: 6, Adductors: 1, Calves: 7, 'Abs/core': 10,
  },
  // Helix Bulk — MAV (productive ceiling)
  bulk: {
    Chest: 13, Lats: 8, 'Upper back': 5, 'Lower back': 1,
    'Front delts': 6, 'Side delts': 9, 'Rear delts': 3, Biceps: 9, Triceps: 7,
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
 * into one of the 16 landmark muscles, or null when it isn't a tracked target.
 * Handles both refined tokens (side_delts / rear_delts) and legacy generic ones
 * (a bare "shoulders" is treated as side-delt isolation, the common case).
 */
export function toLandmarkMuscle(token: string): LandmarkMuscle | null {
  switch (token.toLowerCase().replace(/[\s-]+/g, '_')) {
    case 'chest': case 'pecs': return 'Chest'
    // A bare "back" resolves to LATS, not to a fourth bucket: the movements in
    // the catalog tagged only "back" are pulldowns and rows, which are
    // lat-dominant. Traps and rhomboids are the upper-back pullers; the erector
    // tokens are the only ones that mean the lower back.
    case 'lats': case 'back': return 'Lats'
    case 'upper_back': case 'traps': case 'rhomboids': return 'Upper back'
    case 'lower_back': case 'erectors': case 'spinal_erectors': return 'Lower back'
    case 'side_delts': case 'lateral_delts': case 'shoulders': case 'delts': return 'Side delts'
    case 'rear_delts': case 'rear_delt': return 'Rear delts'
    // ── WHY FRONT DELTS STOPPED BEING THROWN AWAY ──────────────────────────
    // This returned null on the argument that "pressing already covers front
    // delts". Pressing DOES cover them — that is precisely why discarding the
    // credit was wrong. Reconciling a real week (2026-08-16 → 22) against Hevy,
    // NINE weighted sets evaporated here: three of overhead press as a primary,
    // and every chest press, incline press, pec deck and crossover as a
    // secondary. A muscle trained nine times a week that reports nothing is not
    // "covered", it is invisible, and it was the single largest gap in the
    // whole breakdown.
    case 'front_delts': case 'anterior_delts': return 'Front delts'
    case 'biceps': return 'Biceps'
    case 'triceps': return 'Triceps'
    case 'forearms': case 'brachioradialis': return 'Forearms'
    case 'quads': case 'quadriceps': return 'Quads'
    case 'hamstrings': return 'Hamstrings'
    case 'glutes': return 'Glutes'
    // `inner_thigh` is what the Hip Adduction machine row was tagged with. It
    // resolved to null, so the Adductors target sat permanently at 0/N with the
    // work being done and logged — the only muscle in the list that could never
    // be satisfied.
    case 'adductors': case 'inner_thigh': case 'adductor': return 'Adductors'
    case 'abductors': return null // hip abductors aren't a tracked target
    case 'calves': return 'Calves'
    case 'abs': case 'abdominals': case 'core': case 'obliques': return 'Abs/core'
    default: return null
  }
}

export type VolumeZone = 'under' | 'building' | 'optimal' | 'over' | 'na'

/**
 * Where this week's set count sits relative to a muscle's program target.
 *
 * TWO NUMBERS, DELIBERATELY. `weeklySets` is the weighted total (direct plus
 * half-credited assistance); `directSets` is the direct work alone. The verdict
 * is not a straight grading of either, and the asymmetry is the entire point:
 *
 *   · A muscle is UNDER only if even its TOTAL work falls short. Grading direct
 *     work alone against these targets is what reported the glutes as untrained
 *     in a week of RDLs — the work happened, the counter could not see it.
 *
 *   · A muscle is OVER only if its DIRECT work alone overshoots. PROGRAM_TARGETS
 *     are Renaissance-Periodisation direct-set landmarks, written on the
 *     assumption that compounds supply indirect stimulus on top; grading the
 *     assisted total against them flags the triceps OVER at 14 in a week
 *     containing 7 direct triceps sets against a target of 6. OVER means "back
 *     off", and telling someone to cut arm work because they pressed is worse
 *     advice than the UNDER it replaced.
 *
 * So the assistance can lift a muscle out of UNDER but can never push it into
 * OVER. Both errors were live; this rule is the one that removes both.
 */
export function volumeZone(weeklySets: number, target: number, directSets = weeklySets): VolumeZone {
  if (target <= 0) return 'na'                 // e.g. Adductors on a cut → no target
  // Only direct work can earn an OVER.
  if (directSets / target > 1.3) return 'over'
  const ratio = weeklySets / target
  if (ratio < 0.5) return 'under'              // well short of the target
  if (ratio < 1.0) return 'building'           // ramping toward it
  return 'optimal'                             // at or beyond it, assistance included
}

export const ZONE_META: Record<VolumeZone, { label: string; color: string }> = {
  under:    { label: 'Under target', color: '#79808C' },
  building: { label: 'Building',     color: '#3D7AB8' },
  optimal:  { label: 'On target',    color: '#3E9E7A' },
  over:     { label: 'Over',         color: '#C4514E' },
  na:       { label: 'No target',    color: '#5A6472' },
}

/**
 * What one set of an exercise is worth to a SECONDARY mover.
 *
 * A set is not a unit of "the muscle was involved", it is a unit of growth
 * stimulus, and the two are not the same thing. The triceps in a chest press
 * work through a shorter range, at a worse leverage and against a load chosen
 * for the pecs; the biceps in a row never reach the tension a curl puts on them.
 * Both contribute, neither contributes what a direct set does.
 *
 * WHY NOT 1.0. The obvious reading of "credit the secondary movers" is to give
 * them a whole set, and this codebase already tried it: counting the full
 * `muscle_groups` array put Biceps at 22 sets against a target of 8, because
 * every back row and every pulldown paid them in full. That does not fix the
 * false UNDERs, it converts them into false OVERs — and an OVER reads as
 * "recovery risk, cut volume", which is worse advice than the under it replaced.
 *
 * WHY NOT 0.0. That is where this file was before today, and it is the bug the
 * audit was opened for: `DB RDL` credited hamstrings and nothing to the glutes,
 * `Hammer Curl` nothing to the forearms, so a week of real work reported muscles
 * as under-trained that had been trained all along.
 *
 * 0.5 IS THE CONVENTION THE TARGETS WERE WRITTEN IN. PROGRAM_TARGETS are
 * Renaissance-Periodisation-style MEV/MAV landmarks, and RP counts indirect work
 * as a half set against exactly these numbers. Crediting indirect work in full
 * would be a units mismatch with the targets it is compared against; the fix
 * would then be to re-derive all 13 targets upward, which invents numbers rather
 * than measuring them.
 *
 * A muscle that is BOTH primary and secondary for one movement (a pulldown's
 * `lats` and `upper back` both fold to Back) takes the primary credit once, not
 * one and a half — see the `Math.max` in the accumulator.
 */
export const SECONDARY_SET_CREDIT = 0.5

/** An exercise's movers, already split. Both lists are raw muscle tokens. */
export interface MoverTokens {
  primary: readonly string[]
  secondary: readonly string[]
}

export interface MuscleVolume {
  muscle: LandmarkMuscle
  /** Direct + indirect, the figure graded against the target. May be fractional. */
  sets: number
  /** Sets where this muscle was the primary mover. */
  directSets: number
  /** Sets where it was a secondary mover, ALREADY weighted by the credit above. */
  indirectSets: number
  target: number
  zone: VolumeZone
  color: string
}

/** Round to 1dp — half sets are the smallest unit this system produces. */
const half = (v: number): number => Math.round(v * 10) / 10

/**
 * Accumulate committed sets per landmark muscle for a set of workout rows, then
 * grade each against the active program's target.
 *
 * Each row contributes ONE set to every DISTINCT landmark muscle its PRIMARY
 * tags name, and {@link SECONDARY_SET_CREDIT} of a set to every distinct muscle
 * its SECONDARY tags name. A row tagged quads+glutes primary adds a full set to
 * both; a row tagged hamstrings primary / glutes secondary adds 1.0 and 0.5.
 *
 * `dedupeKey` collapses unilateral L/R sub-sets: rows sharing a key count once
 * (pass the pair id, or a unique id for bilateral rows).
 */
export function weeklyVolumeByMuscle(
  rows: Array<MoverTokens & { dedupeKey: string }>,
  phase: ProgramPhase,
  /** Per-plan+phase user overrides (see usePlanPhaseGoals.resolveVolume). */
  overrides?: Partial<Record<LandmarkMuscle, number>>,
): MuscleVolume[] {
  const targets = { ...programTargets(phase), ...(overrides ?? {}) }
  // muscle → dedupeKey → the credit that key earned it. Keyed twice so a
  // unilateral pair still counts once, and so a muscle named by both the primary
  // and the secondary list takes the larger of the two rather than their sum.
  const counted = new Map<LandmarkMuscle, Map<string, number>>()
  const credit = (row: MoverTokens & { dedupeKey: string }, tokens: readonly string[], weight: number) => {
    const muscles = new Set(
      tokens.map(toLandmarkMuscle).filter((m): m is LandmarkMuscle => m !== null),
    )
    for (const m of muscles) {
      const seen = counted.get(m) ?? new Map<string, number>()
      seen.set(row.dedupeKey, Math.max(seen.get(row.dedupeKey) ?? 0, weight))
      counted.set(m, seen)
    }
  }
  for (const row of rows) {
    // Secondary first, so the primary's Math.max always wins the overlap.
    credit(row, row.secondary, SECONDARY_SET_CREDIT)
    credit(row, row.primary, 1)
  }
  return LANDMARK_MUSCLES.map((muscle) => {
    const seen = counted.get(muscle)
    let direct = 0, indirect = 0
    for (const weight of seen?.values() ?? []) {
      if (weight >= 1) direct += 1
      else indirect += weight
    }
    const sets = half(direct + indirect)
    const target = targets[muscle]
    return {
      muscle, sets, directSets: direct, indirectSets: half(indirect),
      target, zone: volumeZone(sets, target, direct), color: MUSCLE_COLOR[muscle],
    }
  })
}

export interface MuscleTonnage {
  muscle: LandmarkMuscle
  volumeKg: number
  /** The share of `volumeKg` earned as a primary mover. */
  directKg: number
  color: string
}

/**
 * Weekly TONNAGE per landmark muscle — kilograms, not set counts.
 *
 * The companion to `weeklyVolumeByMuscle` and deliberately built on the same
 * attribution rule: a lift credits every DISTINCT landmark muscle its PRIMARY
 * tags name in full, and every muscle its SECONDARY tags name at
 * {@link SECONDARY_SET_CREDIT}. A hack squat's tonnage therefore lands on quads
 * in full and glutes at half, exactly as its sets do, so the two breakdowns can
 * never tell different stories about the same movement.
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
  rows: Array<MoverTokens & { volumeKg: number }>,
): MuscleTonnage[] {
  const total = new Map<LandmarkMuscle, number>()
  const direct = new Map<LandmarkMuscle, number>()
  for (const row of rows) {
    if (!Number.isFinite(row.volumeKg) || row.volumeKg <= 0) continue
    const landmarks = (tokens: readonly string[]) => new Set(
      tokens.map(toLandmarkMuscle).filter((m): m is LandmarkMuscle => m !== null),
    )
    const primary = landmarks(row.primary)
    // A muscle named by both lists (a pulldown's lats + upper back both fold to
    // Back) takes the primary's full share once, never full plus a half.
    for (const m of landmarks(row.secondary)) {
      if (primary.has(m)) continue
      total.set(m, (total.get(m) ?? 0) + row.volumeKg * SECONDARY_SET_CREDIT)
    }
    for (const m of primary) {
      total.set(m, (total.get(m) ?? 0) + row.volumeKg)
      direct.set(m, (direct.get(m) ?? 0) + row.volumeKg)
    }
  }
  // Quarter-kg microloads are real; two decimals is the smallest place a plate
  // reaches, and it kills float drift without inventing precision.
  const round2 = (v: number) => Math.round(v * 100) / 100
  return LANDMARK_MUSCLES
    .filter((m) => (total.get(m) ?? 0) > 0)
    // Heaviest first — the reader wants the week's emphasis, not the enum order.
    .map((muscle) => ({
      muscle,
      volumeKg: round2(total.get(muscle) as number),
      directKg: round2(direct.get(muscle) ?? 0),
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
