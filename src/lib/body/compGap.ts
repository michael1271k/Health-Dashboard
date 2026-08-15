/**
 * "The scale synced a weight, but nobody entered the composition."
 *
 * ── WHY THIS IS A STATE AND NOT AN ABSENCE ───────────────────────────────────
 * Apple Health delivers `weight_kg` on its own — HealthKit carries bodyweight
 * and nothing else the smart scale measures. Body fat, muscle and skeletal
 * muscle mass are typed in by hand from the scale's own display, and skeletal
 * muscle in particular is ENTERED and never derivable from anything else on the
 * row.
 *
 * So a day can hold a real weigh-in with an empty composition, and that is not
 * the same as no weigh-in. The Body band said "No weigh-in today" for both,
 * which is true of one and false of the other — and the false one is precisely
 * the day worth acting on, because the numbers are still legible on the scale
 * and will not be tomorrow.
 *
 * Pure, and framework-free: the day page reads it during render and the tests
 * read it without a database.
 */

/** The parts of a body-composition row this cares about. */
export interface BodyCompFields {
  weight_kg?: number | null
  body_fat_pct?: number | null
  muscle_mass_kg?: number | null
  skeletal_muscle_mass_kg?: number | null
}

export type BodyCompState =
  /** No weight at all — nothing was recorded, and nothing is owed. */
  | 'none'
  /** A weight arrived, but every manual field is empty. The actionable case. */
  | 'weight-only'
  /** A weight and at least one manual field, but not all of them. */
  | 'partial'
  /** Weight plus every manual field. */
  | 'complete'

/**
 * The MANUAL fields — the ones a sync can never fill.
 *
 * `muscle_mass_kg` holds lean SOFT TISSUE, not skeletal muscle; the two are
 * different measurements (~50.3 kg against ~26.8 kg) and both are entered, so
 * both count here. Fat-free mass is derived and deliberately absent.
 */
const MANUAL_FIELDS = ['body_fat_pct', 'muscle_mass_kg', 'skeletal_muscle_mass_kg'] as const

/** A value counts as present when it is a real number. 0 is not a body fat %. */
const present = (v: number | null | undefined): boolean => typeof v === 'number' && Number.isFinite(v) && v > 0

export function bodyCompState(row: BodyCompFields | null | undefined): BodyCompState {
  if (!present(row?.weight_kg)) return 'none'
  const have = MANUAL_FIELDS.filter((f) => present(row?.[f])).length
  if (have === 0) return 'weight-only'
  return have === MANUAL_FIELDS.length ? 'complete' : 'partial'
}

/**
 * Which manual fields are still owed, in entry order. Empty when there is no
 * weight to hang them on — a day with no weigh-in is not an incomplete day.
 */
export function missingBodyCompFields(row: BodyCompFields | null | undefined): string[] {
  if (!present(row?.weight_kg)) return []
  return MANUAL_FIELDS.filter((f) => !present(row?.[f]))
}

/**
 * `muscle_mass_kg` is labelled "lean soft tissue" and NOT "muscle": it is
 * weight × muscle%, a different measurement from skeletal muscle mass (~50 kg
 * against ~27 kg). Naming both "muscle" in the same sentence is how the two got
 * conflated in the first place.
 */
const FIELD_NAME: Record<string, string> = {
  body_fat_pct: 'body fat',
  muscle_mass_kg: 'lean soft tissue',
  skeletal_muscle_mass_kg: 'skeletal muscle',
}

/** "body fat and skeletal muscle" — an Oxford-free list of what is owed. */
function nameList(fields: string[]): string {
  const names = fields.map((f) => FIELD_NAME[f] ?? f)
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * The nudge for a day whose weight arrived alone, or null.
 *
 * Only the `weight-only` case gets a full sentence, because only that case has
 * nothing else to say — the band is otherwise showing real numbers, and
 * replacing them with a prompt would hide the data to ask for more of it.
 */
export function bodyCompGapLabel(row: BodyCompFields | null | undefined): string | null {
  if (bodyCompState(row) !== 'weight-only') return null
  return `Weight synced — add ${nameList(missingBodyCompFields(row))}`
}

/**
 * The short trailing hint for a `partial` day, or null.
 *
 * Appended after the numbers rather than replacing them: a day with a body fat
 * but no skeletal muscle is mostly complete, and saying so quietly is the
 * difference between a reminder and a scold.
 */
export function bodyCompGapShort(row: BodyCompFields | null | undefined): string | null {
  if (bodyCompState(row) !== 'partial') return null
  return `add ${nameList(missingBodyCompFields(row))}`
}
