import { z } from 'zod'

/**
 * Flat ingest payload — POSTed by the native iOS app (HealthKit bridge).
 *
 * Even a native source can be messy: on a day with no reading a value may be "",
 * false, null, "null" or NaN instead of omitting the key (the infamous
 * `sleep: false` crash). Every numeric field therefore goes through `flex()`,
 * which coerces all of those "absent" sentinels to `undefined` instead of
 * throwing, and parses numeric strings ("457" → 457). Integer-mapped columns
 * additionally round; float/numeric columns keep their precision.
 *
 * Units:
 *  - water:          mL of drinking water (no conversion)
 *  - active_energy:  kcal (native sends kilocalories). A guard divides an
 *                    implausibly large value (>5000) by 1000 as a cal→kcal safety net.
 *  - sleep/*_minutes:    minutes · weight/lean_mass: kg · body_fat/blood_oxygen: %
 *  - avg_heart_rate / avg_rest_heart_rate: bpm
 *  - respiratory_rate:   breaths per minute
 */

/**
 * Forgiving numeric coercion. Turns "", false, true, null, undefined, "null",
 * "false", "nan", and non-finite numbers into `undefined`; parses numeric
 * strings; otherwise passes finite numbers through. Never throws on the junk
 * a source sends — it just treats it as "no reading".
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
// Sleep minutes with sanity guards: a value in (0,16] is almost certainly HOURS
// (a night is never 16 minutes) → ×60; anything implausibly large (>18h) is
// dropped as junk rather than corrupting the day.
const sleepMinutesField = () =>
  flex().transform((v) => {
    if (typeof v !== 'number') return v
    const m = Math.round(v > 0 && v <= 16 ? v * 60 : v)
    return m > 1080 ? undefined : m
  })
// ISO datetime string (bed_start / bed_end); malformed → dropped.
const isoField = () => z.string().datetime({ offset: true }).optional().catch(undefined)

export const IngestPayloadSchema = z.object({
  steps:               intField(),
  distance_m:          floatField(),                 // walking+running metres (native HealthKit)
  water:               floatField(),                 // mL (numeric)
  sleep_minutes:       sleepMinutesField(),          // hours-vs-minutes safe, clamped
  // ── Sleep stage breakdown (native HealthKit SleepAnalysis) — all optional ──
  deep_min:            intField(),
  rem_min:             intField(),
  core_min:            intField(),
  awake_min:           intField(),
  bed_start:           isoField(),                   // actual bedtime (ISO)
  bed_end:             isoField(),                   // actual wake time (ISO)
  carbs:               floatField(),                 // numeric(8,2)
  protein:             floatField(),
  fats:                floatField(),
  calories:            intField(),                   // source-of-truth (MFP) — preferred over the macro estimate
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
  // ── Wearable recovery metrics ──
  hrv:                 floatField(),                 // heart-rate variability, SDNN ms
  exercise_minutes:    intField(),                   // Apple green-ring minutes
  stand_hours:         intField(),                   // Apple stand hours
  vo2max:              floatField(),                 // mL/kg/min (updates ~weekly)
  // ── Environmental & cardiac metrics ──
  wrist_temp:          floatField(),                 // night's AVERAGE wrist temp, °C (stored in wrist_temp_delta)
  time_in_daylight:    intField(),                   // total minutes of daylight exposure
  heart_rate_recovery: floatField(),                 // 1-min post-exercise HRR, bpm — float
  // ── Dietary micro-nutrients (Micros page) — fiber → nutrition_entries.fiber_g,
  //    the rest → nutrition_entries.micros jsonb. Keys match the micro-target keys.
  fiber:               floatField(),                 // g
  sugar:               floatField(),                 // g
  sodium:              floatField(),                 // mg
  potassium:           floatField(),                 // mg
  calcium:             floatField(),                 // mg
  iron:                floatField(),                 // mg
  magnesium:           floatField(),                 // mg
  vitaminC:            floatField(),                 // mg
  vitaminD:            floatField(),                 // IU (HealthKit reports mcg — 1 mcg = 40 IU; converted below)
  satFat:              floatField(),                 // g
  // Optional explicit date override (YYYY-MM-DD); defaults to the logical day
  date:                z.string().optional(),
}).strip()   // unknown keys are dropped, never a hard error

export type IngestPayload = z.infer<typeof IngestPayloadSchema>
