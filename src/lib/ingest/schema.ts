import { z } from 'zod'

/**
 * Flat ingest payload — POSTed by the custom iOS Shortcut (replaces the
 * third-party Health Auto Export integration).
 *
 * The Shortcut is messy: on a day with no reading it sends "", false, null,
 * "null" or NaN instead of omitting the key (the infamous `sleep: false`
 * crash). Every numeric field therefore goes through `flex()`, which coerces
 * all of those "absent" sentinels to `undefined` instead of throwing, and
 * parses numeric strings ("457" → 457). Integer-mapped columns additionally
 * round; float/numeric columns keep their precision.
 *
 * Units:
 *  - water:          mL of drinking water (no conversion)
 *  - active_energy:  Apple outputs cal, not kcal. When the raw value is large
 *                    (cal in the thousands+ — typically hundreds of thousands),
 *                    divide by 1000 → kcal.
 *  - sleep/*_minutes:    minutes · weight/lean_mass: kg · body_fat/blood_oxygen: %
 *  - avg_heart_rate / avg_rest_heart_rate: bpm
 *  - respiratory_rate:   breaths per minute
 *
 * Swedish aliases from the Shortcut are accepted and normalized:
 *  - andningsfrekvens → respiratory_rate
 *  - vilopuls         → avg_rest_heart_rate
 */

/**
 * Forgiving numeric coercion. Turns "", false, true, null, undefined, "null",
 * "false", "nan", and non-finite numbers into `undefined`; parses numeric
 * strings; otherwise passes finite numbers through. Never throws on the junk
 * the Shortcut sends — it just treats it as "no reading".
 */
function flex() {
  return z.preprocess((v): number | undefined => {
    if (v === null || v === undefined || v === '' || v === false || v === true) return undefined
    if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
    if (typeof v === 'string') {
      const t = v.trim().toLowerCase()
      if (t === '' || t === 'null' || t === 'false' || t === 'nan' || t === 'undefined') return undefined
      const n = Number(t)
      return Number.isFinite(n) ? n : undefined
    }
    return undefined
  }, z.number().nonnegative().optional())
}

// INTEGER-mapped fields → coerce then round
const intField = () => flex().transform((v) => (typeof v === 'number' ? Math.round(v) : v))
// FLOAT/numeric fields → coerce, keep precision
const floatField = () => flex()
// Apple active energy: cal → kcal when clearly cal (large magnitude).
const energyField = () =>
  flex().transform((v) => (typeof v === 'number' && v > 5000 ? v / 1000 : v))

const BaseSchema = z.object({
  steps:               intField(),
  water:               floatField(),                 // mL (numeric)
  sleep_minutes:       intField(),
  carbs:               floatField(),                 // numeric(8,2)
  protein:             floatField(),
  fats:                floatField(),
  weight:              floatField(),                 // kg
  lean_mass:           floatField(),                 // kg
  bmi:                 floatField(),
  training_minutes:    intField(),
  active_energy:       energyField(),
  body_fat:            floatField(),                 // %
  standing_minutes:    intField(),
  avg_heart_rate:      intField(),                   // bpm
  avg_rest_heart_rate: intField(),                   // bpm (resting)
  respiratory_rate:    floatField(),                 // breaths/min (numeric)
  blood_oxygen:        floatField(),                 // %
  // Optional explicit date override (YYYY-MM-DD); defaults to today (Israel time)
  date:                z.string().optional(),
}).strip()

/**
 * Pre-pass: normalize Swedish Shortcut keys onto their canonical English names
 * (only when the canonical key isn't already present) before validation.
 */
export const ShortcutPayloadSchema = z.preprocess((raw) => {
  if (!raw || typeof raw !== 'object') return raw
  const o = { ...(raw as Record<string, unknown>) }
  if (o.andningsfrekvens !== undefined && o.respiratory_rate === undefined) {
    o.respiratory_rate = o.andningsfrekvens
  }
  if (o.vilopuls !== undefined && o.avg_rest_heart_rate === undefined) {
    o.avg_rest_heart_rate = o.vilopuls
  }
  return o
}, BaseSchema)

export type ShortcutPayload = z.infer<typeof ShortcutPayloadSchema>
