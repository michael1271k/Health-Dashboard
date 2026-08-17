/**
 * Body-composition math — the "InBody engine".
 *
 * A smart scale reports percentages; the useful, trendable numbers are masses.
 * Rather than making the user key in both, we derive every mass from Weight × %:
 * enter Weight + Muscle % and Muscle Mass (kg) falls out automatically, likewise
 * for water, fat, bone mineral and protein. Fat-Free Mass = Weight − Fat Mass.
 *
 * Protein: if a protein % is given we use it directly; otherwise we derive it from
 * the fat-free compartment (FFM = total body water + protein + bone mineral ⇒
 * protein ≈ FFM − water − mineral), which is how BIA devices back it out.
 *
 * Pure + framework-free so it unit-tests cleanly and can run on client or server.
 */

export interface BodyCompInput {
  weight_kg?: number | null
  body_fat_pct?: number | null
  muscle_percent?: number | null
  water_percent?: number | null
  bone_mineral?: number | null // percentage
  protein_percent?: number | null
}

export interface BodyCompDerived {
  fat_mass_kg?: number
  fat_free_mass_kg?: number
  muscle_mass_kg?: number
  water_mass_kg?: number
  bone_mineral_kg?: number
  protein_mass_kg?: number
}

/**
 * NO TAPE MEASUREMENTS. EVER.
 *
 * `waist_cm` / `hip_cm` / a derived `waist_hip_ratio` have been removed twice
 * now and must not come back. Nothing in Helix is measured by hand — every
 * body number arrives from the scale or from HealthKit, and a field that
 * depends on remembering to hold a tape the same way each week is a field that
 * silently fills with noise.
 *
 * The waist-to-hip ratio Helix DOES track is
 * `estimated_waist_to_hip_ratio`: a single float the Xiaomi scale computes and
 * reports on its own. It is entered as one number, exactly like
 * `skeletal_muscle_mass_kg`, and is NOT derived here.
 */

/**
 * SKELETAL MUSCLE MASS IS NOT DERIVED, AND CANNOT BE.
 *
 * `muscle_mass_kg = weight × muscle%` is lean SOFT TISSUE — skeletal muscle plus
 * smooth and cardiac muscle, organ mass and intracellular water. At 64.2 kg and
 * 78.3 % that is 50.27 kg, and it is arithmetically correct. Skeletal muscle
 * mass, the contractile tissue you actually train, is ~26.8 kg for the same
 * body: roughly 53 % of the first number, and a separate reading on the scale.
 *
 * Recovering it from percentages would need segmental impedance, which is
 * exactly why the scale reports it as its own metric. So `skeletal_muscle_mass_kg`
 * is entered, never computed, and a day without the reading holds null rather
 * than a plausible-looking guess.
 */

/** WHO abdominal-obesity risk bands, applied to the SCALE'S reported ratio. */
export type WhrBand = 'low' | 'moderate' | 'high'

export function whrBand(ratio: number, sex: 'male' | 'female' = 'male'): WhrBand {
  const [lo, hi] = sex === 'male' ? [0.90, 1.00] : [0.80, 0.85]
  if (ratio < lo) return 'low'
  return ratio < hi ? 'moderate' : 'high'
}

/**
 * Visceral-fat index bands.
 *
 * ── THESE ARE STRICTER THAN THE SCALE'S ──────────────────────────────────────
 * A consumer BIA scale calls anything under 10 "normal", which is true of the
 * general population and useless to someone at 17% body fat: the reading would
 * sit at 5 and wear a green label from the first week of a cut to the last,
 * never once describing a change. The bands here come from the plan's own
 * targets — under 5 is where this cut is trying to get, 5–7 is where it started,
 * and 8+ is the range where the scale's own warning would eventually agree.
 *
 * The index is unitless and manufacturer-specific by construction; nothing here
 * converts it to a mass or compares it across devices.
 */
export type VisceralBand = 'optimal' | 'elevated' | 'high'

export function visceralBand(index: number): VisceralBand {
  if (index < 5) return 'optimal'
  return index <= 7 ? 'elevated' : 'high'
}

const num = (v: number | null | undefined): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined

/** Round to 2 dp; drops -0. */
const r2 = (v: number): number => Math.round(v * 100) / 100

/** Weight × percentage → mass in kg (both inputs must be present). */
const massFromPct = (weight?: number, pct?: number): number | undefined =>
  weight != null && pct != null ? r2((weight * pct) / 100) : undefined

/**
 * Derive every mass we can from the entered weight + percentages. Only fields
 * whose inputs are present are returned — a partial entry yields a partial result.
 */
export function deriveBodyComp(input: BodyCompInput): BodyCompDerived {
  const weight = num(input.weight_kg)
  const bf = num(input.body_fat_pct)
  const musclePct = num(input.muscle_percent)
  const waterPct = num(input.water_percent)
  const bonePct = num(input.bone_mineral)
  const proteinPct = num(input.protein_percent)

  const out: BodyCompDerived = {}

  const fatMass = massFromPct(weight, bf)
  if (fatMass != null) out.fat_mass_kg = fatMass

  const ffm = weight != null && bf != null ? r2(weight * (1 - bf / 100)) : undefined
  if (ffm != null) out.fat_free_mass_kg = ffm

  const muscleMass = massFromPct(weight, musclePct)
  if (muscleMass != null) out.muscle_mass_kg = muscleMass

  const waterMass = massFromPct(weight, waterPct)
  if (waterMass != null) out.water_mass_kg = waterMass

  const boneMass = massFromPct(weight, bonePct)
  if (boneMass != null) out.bone_mineral_kg = boneMass

  // Protein: explicit % wins; else back it out of the fat-free compartment.
  const proteinFromPct = massFromPct(weight, proteinPct)
  if (proteinFromPct != null) {
    out.protein_mass_kg = proteinFromPct
  } else if (ffm != null && waterMass != null && boneMass != null) {
    out.protein_mass_kg = r2(Math.max(0, ffm - waterMass - boneMass))
  }

  return out
}
