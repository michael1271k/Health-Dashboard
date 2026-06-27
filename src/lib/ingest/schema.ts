import { z } from 'zod'

/**
 * Flat ingest payload — POSTed by the custom iOS Shortcut (replaces the
 * third-party Health Auto Export integration).
 *
 * All fields are optional numbers; the Shortcut sends whatever metrics it could
 * read for "today". Units:
 *  - water:          mL of drinking water
 *  - sleep_minutes:  total sleep minutes
 *  - weight/lean_mass: kg
 *  - active_energy:  kcal (active)
 *  - body_fat:       percent
 *  - *_minutes:      minutes
 *  - avg_heart_rate: bpm
 *  - blood_oxygen:   percent (SpO2)
 */
export const ShortcutPayloadSchema = z.object({
  steps:            z.number().nonnegative().optional(),
  water:            z.number().nonnegative().optional(),
  sleep_minutes:    z.number().nonnegative().optional(),
  carbs:            z.number().nonnegative().optional(),
  protein:          z.number().nonnegative().optional(),
  fats:             z.number().nonnegative().optional(),
  weight:           z.number().nonnegative().optional(),
  lean_mass:        z.number().nonnegative().optional(),
  bmi:              z.number().nonnegative().optional(),
  training_minutes: z.number().nonnegative().optional(),
  active_energy:    z.number().nonnegative().optional(),
  body_fat:         z.number().nonnegative().optional(),
  move_minutes:     z.number().nonnegative().optional(),
  standing_minutes: z.number().nonnegative().optional(),
  avg_heart_rate:   z.number().nonnegative().optional(),
  blood_oxygen:     z.number().nonnegative().optional(),
  // Optional explicit date override (YYYY-MM-DD); defaults to today (Israel time)
  date:             z.string().optional(),
}).strip()

export type ShortcutPayload = z.infer<typeof ShortcutPayloadSchema>
