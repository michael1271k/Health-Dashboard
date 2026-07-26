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
  waist_cm?: number | null
  hip_cm?: number | null
}

export interface BodyCompDerived {
  fat_mass_kg?: number
  fat_free_mass_kg?: number
  muscle_mass_kg?: number
  water_mass_kg?: number
  bone_mineral_kg?: number
  protein_mass_kg?: number
  waist_hip_ratio?: number
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
  const waist = num(input.waist_cm)
  const hip = num(input.hip_cm)

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

  if (waist != null && hip != null && hip > 0) out.waist_hip_ratio = Math.round((waist / hip) * 1000) / 1000

  return out
}
