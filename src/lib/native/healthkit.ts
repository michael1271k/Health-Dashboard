'use client'

import { Capacitor, registerPlugin } from '@capacitor/core'
import { supabase } from '@/lib/supabase/client'

/**
 * Apple HealthKit bridge. Reads the device's local Health database and maps it
 * to the flat ingest payload → POST /api/ingest (the same channel the web uses).
 *
 * The native implementation is provided by a HealthKit Capacitor plugin added
 * during the iOS build (`npx cap add ios` + the CocoaPod); on the web this
 * `registerPlugin` proxy is inert and every entry point is guarded by
 * `Capacitor.isNativePlatform()`, so the web bundle ships no native code.
 */
export interface HealthSample { value: number; startDate: string; endDate: string }
type Reduce = 'sum' | 'latest' | 'avg'
interface HealthKitPlugin {
  requestAuthorization(opts: { read: string[] }): Promise<{ granted: boolean }>
  // Reduced Swift-side: HKStatisticsQuery deduplicates overlapping iPhone+Watch
  // sources, so the returned array is a single {value} (or empty). No manual JS sum.
  // `dayStart` (YYYY-MM-DD) + `isToday` let Swift build the window at LOCAL
  // midnight via Calendar.current (timezone-proof). startDate/endDate remain as
  // an ISO fallback for older binaries / arbitrary windows.
  queryQuantity(opts: { sampleType: string; dayStart?: string; isToday?: boolean; startDate: string; endDate: string; reduce: Reduce }): Promise<{ samples: { value: number }[] }>
  queryCategory(opts: { sampleType: string; startDate: string; endDate: string }): Promise<{ samples: HealthSample[] }>
}
const HealthKit = registerPlugin<HealthKitPlugin>('CapacitorHealthkit')

/**
 * HealthKit sample identifiers → our ingest payload keys + how to reduce them.
 * `scale` multiplies the reduced value before ingest — critical for
 * OxygenSaturation, which HealthKit reports as a 0–1 FRACTION (0.982), not a
 * percent. Without ×100 it stored 0.982 and rendered as "1%".
 */
const METRIC_MAP: Array<{ hk: string; key: string; reduce: Reduce; scale?: number }> = [
  { hk: 'HKQuantityTypeIdentifierStepCount', key: 'steps', reduce: 'sum' },
  { hk: 'HKQuantityTypeIdentifierActiveEnergyBurned', key: 'active_energy', reduce: 'sum' },
  { hk: 'HKQuantityTypeIdentifierAppleExerciseTime', key: 'training_minutes', reduce: 'sum' },
  // AppleStandTime is the QUANTITY type (minutes); AppleStandHour is a category
  // and can't be read via queryQuantity. dailyLog's standToHours() converts.
  { hk: 'HKQuantityTypeIdentifierAppleStandTime', key: 'standing_minutes', reduce: 'sum' },
  { hk: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN', key: 'hrv', reduce: 'avg' },
  { hk: 'HKQuantityTypeIdentifierRestingHeartRate', key: 'avg_rest_heart_rate', reduce: 'latest' },
  { hk: 'HKQuantityTypeIdentifierRespiratoryRate', key: 'respiratory_rate', reduce: 'avg' },
  // OxygenSaturation is a 0–1 fraction → ×100 to store an actual percent.
  { hk: 'HKQuantityTypeIdentifierOxygenSaturation', key: 'blood_oxygen', reduce: 'latest', scale: 100 },
  { hk: 'HKQuantityTypeIdentifierBodyMass', key: 'weight', reduce: 'latest' },
  // ── Advanced signals (Micros "Advanced" grid) — these were authorized but
  // never actually QUERIED, so they always read 0. Now pulled every sync. ──
  { hk: 'HKQuantityTypeIdentifierTimeInDaylight', key: 'time_in_daylight', reduce: 'sum' },
  { hk: 'HKQuantityTypeIdentifierAppleSleepingWristTemperature', key: 'wrist_temp', reduce: 'avg' },
  { hk: 'HKQuantityTypeIdentifierHeartRateRecoveryOneMinute', key: 'heart_rate_recovery', reduce: 'latest' },
  // Dietary — sum every logged food entry for the day so calories match MFP
  // exactly (fiber/rounding included), instead of deriving 4·C+4·P+9·F.
  { hk: 'HKQuantityTypeIdentifierDietaryEnergyConsumed', key: 'calories', reduce: 'sum' },
  { hk: 'HKQuantityTypeIdentifierDietaryProtein', key: 'protein', reduce: 'sum' },
  { hk: 'HKQuantityTypeIdentifierDietaryCarbohydrates', key: 'carbs', reduce: 'sum' },
  { hk: 'HKQuantityTypeIdentifierDietaryFatTotal', key: 'fats', reduce: 'sum' },
  { hk: 'HKQuantityTypeIdentifierDietaryWater', key: 'water', reduce: 'sum' },
  // ── Dietary micro-nutrients (Micros "Daily Targets" grid) — also authorized
  // but never queried. Keys match the micro-target keys so the payload maps
  // straight into the nutrition micros bundle. ──
  { hk: 'HKQuantityTypeIdentifierDietaryFiber', key: 'fiber', reduce: 'sum' },
  { hk: 'HKQuantityTypeIdentifierDietarySugar', key: 'sugar', reduce: 'sum' },
  { hk: 'HKQuantityTypeIdentifierDietarySodium', key: 'sodium', reduce: 'sum' },
  { hk: 'HKQuantityTypeIdentifierDietaryPotassium', key: 'potassium', reduce: 'sum' },
  { hk: 'HKQuantityTypeIdentifierDietaryCalcium', key: 'calcium', reduce: 'sum' },
  { hk: 'HKQuantityTypeIdentifierDietaryIron', key: 'iron', reduce: 'sum' },
  { hk: 'HKQuantityTypeIdentifierDietaryMagnesium', key: 'magnesium', reduce: 'sum' },
  { hk: 'HKQuantityTypeIdentifierDietaryVitaminC', key: 'vitaminC', reduce: 'sum' },
  { hk: 'HKQuantityTypeIdentifierDietaryVitaminD', key: 'vitaminD', reduce: 'sum' },
  { hk: 'HKQuantityTypeIdentifierDietaryFatSaturated', key: 'satFat', reduce: 'sum' },
]

const SLEEP_TYPE = 'HKCategoryTypeIdentifierSleepAnalysis'
// Full authorization set — every metric HELIX reads, so the app registers under
// Apple Health → Apps and can pull the whole picture (body comp + newer signals).
const EXTRA_READ_TYPES = [
  'HKCategoryTypeIdentifierSleepAnalysis',
  'HKQuantityTypeIdentifierBodyFatPercentage',
  'HKQuantityTypeIdentifierLeanBodyMass',
  'HKQuantityTypeIdentifierBodyMassIndex',
  'HKQuantityTypeIdentifierHeartRateRecoveryOneMinute',
  'HKQuantityTypeIdentifierAppleSleepingWristTemperature',
  'HKQuantityTypeIdentifierTimeInDaylight',
  'HKQuantityTypeIdentifierHeartRate',
  // ── Activity / body signals (Micros page + richer readiness) ──
  'HKQuantityTypeIdentifierFlightsClimbed',
  'HKQuantityTypeIdentifierBasalEnergyBurned',       // resting energy
  'HKQuantityTypeIdentifierAppleMoveTime',           // move minutes
  'HKQuantityTypeIdentifierWalkingHeartRateAverage',
  'HKQuantityTypeIdentifierHeight',
  'HKQuantityTypeIdentifierUVExposure',
  // ── Dietary micro-nutrients (the Nutrition & Micros surface) ──
  'HKQuantityTypeIdentifierDietaryCholesterol',
  'HKQuantityTypeIdentifierDietarySugar',
  'HKQuantityTypeIdentifierDietaryFiber',
  'HKQuantityTypeIdentifierDietaryFatMonounsaturated',
  'HKQuantityTypeIdentifierDietaryFatPolyunsaturated',
  'HKQuantityTypeIdentifierDietaryIodine',
  'HKQuantityTypeIdentifierDietaryIron',
  'HKQuantityTypeIdentifierDietaryPotassium',
  'HKQuantityTypeIdentifierDietaryCalcium',
  'HKQuantityTypeIdentifierDietaryMagnesium',
  'HKQuantityTypeIdentifierDietarySodium',
  'HKQuantityTypeIdentifierDietaryVitaminA',
  'HKQuantityTypeIdentifierDietaryVitaminB6',
  'HKQuantityTypeIdentifierDietaryVitaminB12',
  'HKQuantityTypeIdentifierDietaryVitaminC',
  'HKQuantityTypeIdentifierDietaryVitaminD',
  'HKQuantityTypeIdentifierDietaryVitaminE',
  'HKQuantityTypeIdentifierDietaryVitaminK',
  'HKQuantityTypeIdentifierDietaryZinc',
  'HKQuantityTypeIdentifierDietaryBiotin',
]
const READ_TYPES = [...new Set(METRIC_MAP.map((m) => m.hk).concat(EXTRA_READ_TYPES))]

/** The plugin already reduced the metric Swift-side; scale (unit-fix) then round. */
function roundReduced(samples: { value: number }[], how: Reduce, scale = 1): number | undefined {
  const raw = samples[0]?.value
  if (raw === undefined) return undefined
  const v = raw * scale
  if (how === 'sum') return Math.round(v)
  if (how === 'avg') return Math.round(v * 100) / 100
  return Math.round(v * 100) / 100 // latest — 2dp (weight, RHR, VO₂max, blood O₂…)
}

/** Request Health read permission once (native only). */
export async function requestHealthAuthorization(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const { granted } = await HealthKit.requestAuthorization({ read: READ_TYPES })
    return granted
  } catch (err) {
    // Loud on device (Safari Web Inspector) so a missing native registration can
    // never be a silent no-op again — this is exactly how the bridge broke.
    console.error('[HELIX] HealthKit requestAuthorization failed — is the CapacitorHealthkit plugin registered?', err)
    return false
  }
}

/** True when the native HealthKit plugin is actually attached to the bridge. */
export function isHealthKitAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('CapacitorHealthkit')
}

/**
 * Run an async mapper over items in batches. Firing all ~28 metric queries at
 * once the instant authorization resolves hammered the HealthKit store during
 * app launch; batching keeps the native bridge responsive and the launch calm.
 */
async function inBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))))
  }
  return out
}

/** Device-local calendar day (YYYY-MM-DD) for a given instant. */
function localDayISO(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Total minutes covered by a set of [startMs, endMs] intervals, counting any
 * overlap ONCE. HealthKit returns sleep samples from every source (iPhone +
 * Watch), which overlap; naive summation inflated the night. Apple's Health app
 * dedupes the same way.
 */
export function mergedMinutes(intervals: Array<[number, number]>): number {
  if (!intervals.length) return 0
  const sorted = [...intervals].sort((a, b) => a[0] - b[0])
  let total = 0
  let [curStart, curEnd] = sorted[0]
  for (let i = 1; i < sorted.length; i++) {
    const [s, e] = sorted[i]
    if (s <= curEnd) curEnd = Math.max(curEnd, e)   // overlapping/adjacent → extend
    else { total += curEnd - curStart; curStart = s; curEnd = e }
  }
  total += curEnd - curStart
  return total / 60000
}

export interface SleepStages {
  sleep_minutes: number
  deep_min: number
  rem_min: number
  core_min: number
  awake_min: number
  bed_start?: string
  bed_end?: string
}

/**
 * Aggregate the night's sleep for the morning of `dateISO` from HealthKit's
 * SleepAnalysis category samples. Window: previous 18:00 → this 12:00 (local),
 * so late-night and early-morning sleep both land on the right day.
 * Category values: 0 inBed · 1 asleepUnspecified · 2 awake · 3 asleepCore ·
 * 4 asleepDeep · 5 asleepREM.
 */
async function fetchSleep(dateISO: string): Promise<SleepStages | null> {
  if (!Capacitor.isNativePlatform()) return null
  const start = new Date(`${dateISO}T00:00:00`); start.setHours(start.getHours() - 6) // prev 18:00 local
  const end = new Date(`${dateISO}T12:00:00`)
  let samples: HealthSample[]
  try {
    const res = await HealthKit.queryCategory({ sampleType: SLEEP_TYPE, startDate: start.toISOString(), endDate: end.toISOString() })
    samples = res.samples
  } catch { return null }
  if (!samples?.length) return null

  // Bucket each stage's raw intervals, then UNION them. iPhone and Watch both
  // write sleep, so overlapping samples double-counted minutes — that's why the
  // app read 9h11m where Apple (which dedupes by source priority) showed 9h15m.
  const stages: Record<'deep' | 'rem' | 'core' | 'awake', Array<[number, number]>> =
    { deep: [], rem: [], core: [], awake: [] }
  let bedStart: string | undefined, bedEnd: string | undefined
  for (const s of samples) {
    const from = new Date(s.startDate).getTime()
    const to = new Date(s.endDate).getTime()
    if (!(to > from)) continue
    if (!bedStart || s.startDate < bedStart) bedStart = s.startDate
    if (!bedEnd || s.endDate > bedEnd) bedEnd = s.endDate
    switch (s.value) {
      case 4: stages.deep.push([from, to]); break
      case 5: stages.rem.push([from, to]); break
      case 1: case 3: stages.core.push([from, to]); break  // asleepUnspecified + asleepCore
      case 2: stages.awake.push([from, to]); break
      default: break                                        // 0 inBed → bed window only
    }
  }
  const deep = mergedMinutes(stages.deep)
  const rem = mergedMinutes(stages.rem)
  const core = mergedMinutes(stages.core)
  const awake = mergedMinutes(stages.awake)
  const sleep_minutes = Math.round(deep + rem + core)
  if (sleep_minutes <= 0) return null
  return {
    sleep_minutes,
    deep_min: Math.round(deep),
    rem_min: Math.round(rem),
    core_min: Math.round(core),
    awake_min: Math.round(awake),
    bed_start: bedStart,
    bed_end: bedEnd,
  }
}

/**
 * Pull one local day's HealthKit metrics and POST to /api/ingest with an
 * explicit `date` so the server writes to that exact day (it upserts
 * last-write-wins on user_id+date). `isToday` caps the query window at "now"
 * (a live running total); past days query the full midnight-to-midnight window.
 * Returns the payload sent, or null when not native / no session / nothing new.
 */
async function syncDay(dateISO: string, isToday: boolean): Promise<Record<string, number | string> | null> {
  if (!Capacitor.isNativePlatform()) return null
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return null

  const start = new Date(`${dateISO}T00:00:00`)
  const end = isToday ? new Date() : new Date(`${dateISO}T23:59:59.999`)
  const payload: Record<string, number | string> = {}

  // Quantity metrics run in BATCHES (not one big parallel burst) alongside the
  // sleep category query — see inBatches().
  const [metricResults, sleep] = await Promise.all([
    inBatches(METRIC_MAP, 6, async (m) => {
      try {
        const { samples } = await HealthKit.queryQuantity({ sampleType: m.hk, dayStart: dateISO, isToday, startDate: start.toISOString(), endDate: end.toISOString(), reduce: m.reduce })
        return { key: m.key, value: roundReduced(samples, m.reduce, m.scale) }
      } catch { return { key: m.key, value: undefined } } // metric not available on this device
    }),
    fetchSleep(dateISO),
  ])
  for (const r of metricResults) if (r.value !== undefined) payload[r.key] = r.value
  // Sleep is a category type with its own night window — merge its stage minutes
  // + bed times into the same payload.
  if (sleep) for (const [k, v] of Object.entries(sleep)) if (v !== undefined) payload[k] = v as number | string

  if (Object.keys(payload).length === 0) return null

  await fetch('/api/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ ...payload, date: dateISO }),
  })
  return payload
}

/** Pull today only (the live running total). Battery-safe: callers throttle. */
export async function syncHealthKitToServer(): Promise<Record<string, number | string> | null> {
  return syncDay(localDayISO(new Date()), true)
}

/**
 * Rolling window — re-pull TODAY and YESTERDAY on every sync. Today captures the
 * live running total; yesterday self-corrects any steps/energy/etc. that Apple
 * recorded after the previous day's last sync (e.g. walking around before sleep
 * post a 21:00 sync). Each day writes to its own date and upserts
 * last-write-wins, so overlapping re-syncs never duplicate or drain the battery
 * beyond the caller's throttle.
 */
export async function syncRollingWindow(): Promise<{ today: Record<string, number | string> | null; yesterday: Record<string, number | string> | null }> {
  if (!Capacitor.isNativePlatform()) return { today: null, yesterday: null }
  const now = new Date()
  const yst = new Date(now); yst.setDate(yst.getDate() - 1)
  // Both days in parallel — each writes to its own date and upserts last-write-
  // wins, so there's no ordering dependency between them.
  const [today, yesterday] = await Promise.all([
    syncDay(localDayISO(now), true),
    syncDay(localDayISO(yst), false),
  ])
  return { today, yesterday }
}
