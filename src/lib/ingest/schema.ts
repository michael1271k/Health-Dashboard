import { z } from 'zod'

/**
 * Flat ingest payload — POSTed by the native iOS app (HealthKit bridge) or
 * third-party Health Auto Export integration).
 *
 * Push sources can be messy: on a day with no reading a value may be "", false, null,
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
 * Payload key aliases (normalized in the pre-pass below):
 *  - respitory_rate (the app's spelling) → respiratory_rate
 *  - heart_rate_variability / hrv_ms      → hrv
 *  - vo2_max                              → vo2max
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

const BaseSchema = z.object({
  steps:               intField(),
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
  wrist_temp:          floatField(),                 // night's AVERAGE wrist temp, °C (Shortcut-aggregated; stored in wrist_temp_delta)
  time_in_daylight:    intField(),                   // total minutes of daylight exposure
  heart_rate_recovery: floatField(),                 // 1-min post-exercise HRR, bpm — float (Shortcut sends aggregated averages)
  // Optional explicit date override (YYYY-MM-DD); defaults to the logical day
  date:                z.string().optional(),
}).strip()

/**
 * Pre-pass: normalize payload key aliases onto their canonical names (only
 * when the canonical key isn't already present) before validation.
 */
export const IngestPayloadSchema = z.preprocess((raw) => {
  if (!raw || typeof raw !== 'object') return raw
  const o = { ...(raw as Record<string, unknown>) }
  // The app spells it "respitory_rate" — accepted as-is, by design.
  if (o.respitory_rate !== undefined && o.respiratory_rate === undefined) {
    o.respiratory_rate = o.respitory_rate
  }
  if (o.hrv_ms !== undefined && o.hrv === undefined) o.hrv = o.hrv_ms
  if (o.heart_rate_variability !== undefined && o.hrv === undefined) o.hrv = o.heart_rate_variability
  if (o.vo2_max !== undefined && o.vo2max === undefined) o.vo2max = o.vo2_max
  if (o.wrist_temperature !== undefined && o.wrist_temp === undefined) o.wrist_temp = o.wrist_temperature
  if (o.daylight !== undefined && o.time_in_daylight === undefined) o.time_in_daylight = o.daylight
  if (o.hrr !== undefined && o.heart_rate_recovery === undefined) o.heart_rate_recovery = o.hrr
  return o
}, BaseSchema)

export type IngestPayload = z.infer<typeof IngestPayloadSchema>

// Back-compat aliases (previous name) — safe to remove in a later release.
export const ShortcutPayloadSchema = IngestPayloadSchema
export type ShortcutPayload = IngestPayload
