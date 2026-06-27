import { z } from 'zod'

/**
 * Flat ingest payload — POSTed by the custom iOS Shortcut (replaces the
 * third-party Health Auto Export integration).
 *
 * The Shortcut sends highly precise decimals; we coerce fields that map to
 * Supabase INTEGER columns with .transform(Math.round). FLOAT/numeric fields
 * (weight, lean_mass, bmi, body_fat, water, blood_oxygen) keep their precision.
 *
 * Units:
 *  - water:          mL of drinking water (no conversion)
 *  - active_energy:  Apple outputs cal, not kcal. When the raw value is large
 *                    (cal in the thousands+), divide by 1000 → kcal.
 *  - sleep/*_minutes: minutes · weight/lean_mass: kg · body_fat/blood_oxygen: %
 *  - avg_heart_rate: bpm
 */

// INTEGER-mapped fields → round
const intField = z.number().nonnegative().transform((v) => Math.round(v)).optional()
// FLOAT/numeric fields → keep precision
const floatField = z.number().nonnegative().optional()

export const ShortcutPayloadSchema = z.object({
  steps:            intField,
  water:            floatField,                  // mL (numeric)
  sleep_minutes:    intField,
  carbs:            floatField,                  // numeric(8,2)
  protein:          floatField,
  fats:             floatField,
  weight:           floatField,                  // kg
  lean_mass:        floatField,                  // kg
  bmi:              floatField,
  training_minutes: intField,
  // Apple active energy comes in cal — convert to kcal when it's clearly cal.
  active_energy:    z.number().nonnegative().transform((v) => (v > 5000 ? v / 1000 : v)).optional(),
  body_fat:         floatField,                  // %
  move_minutes:     intField,
  standing_minutes: intField,
  avg_heart_rate:   intField,                    // bpm (INTEGER column)
  blood_oxygen:     floatField,                  // %
  // Optional explicit date override (YYYY-MM-DD); defaults to today (Israel time)
  date:             z.string().optional(),
}).strip()

export type ShortcutPayload = z.infer<typeof ShortcutPayloadSchema>
