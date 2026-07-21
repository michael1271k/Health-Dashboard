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

/** HealthKit sample identifiers → our ingest payload keys + how to reduce them. */
const METRIC_MAP: Array<{ hk: string; key: string; reduce: Reduce }> = [
  { hk: 'HKQuantityTypeIdentifierStepCount', key: 'steps', reduce: 'sum' },
  { hk: 'HKQuantityTypeIdentifierActiveEnergyBurned', key: 'active_energy', reduce: 'sum' },
  { hk: 'HKQuantityTypeIdentifierAppleExerciseTime', key: 'training_minutes', reduce: 'sum' },
  // AppleStandTime is the QUANTITY type (minutes); AppleStandHour is a category
  // and can't be read via queryQuantity. dailyLog's standToHours() converts.
  { hk: 'HKQuantityTypeIdentifierAppleStandTime', key: 'standing_minutes', reduce: 'sum' },
  { hk: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN', key: 'hrv', reduce: 'avg' },
  { hk: 'HKQuantityTypeIdentifierRestingHeartRate', key: 'avg_rest_heart_rate', reduce: 'latest' },
  { hk: 'HKQuantityTypeIdentifierRespiratoryRate', key: 'respiratory_rate', reduce: 'avg' },
  { hk: 'HKQuantityTypeIdentifierOxygenSaturation', key: 'blood_oxygen', reduce: 'latest' },
  { hk: 'HKQuantityTypeIdentifierVO2Max', key: 'vo2max', reduce: 'latest' },
  { hk: 'HKQuantityTypeIdentifierBodyMass', key: 'weight', reduce: 'latest' },
  // Dietary — sum every logged food entry for the day so calories match MFP
  // exactly (fiber/rounding included), instead of deriving 4·C+4·P+9·F.
  { hk: 'HKQuantityTypeIdentifierDietaryEnergyConsumed', key: 'calories', reduce: 'sum' },
  { hk: 'HKQuantityTypeIdentifierDietaryProtein', key: 'protein', reduce: 'sum' },
  { hk: 'HKQuantityTypeIdentifierDietaryCarbohydrates', key: 'carbs', reduce: 'sum' },
  { hk: 'HKQuantityTypeIdentifierDietaryFatTotal', key: 'fats', reduce: 'sum' },
  { hk: 'HKQuantityTypeIdentifierDietaryWater', key: 'water', reduce: 'sum' },
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
]
const READ_TYPES = [...new Set(METRIC_MAP.map((m) => m.hk).concat(EXTRA_READ_TYPES))]

/** The plugin already reduced the metric Swift-side; just round to our precision. */
function roundReduced(samples: { value: number }[], how: Reduce): number | undefined {
  const v = samples[0]?.value
  if (v === undefined) return undefined
  if (how === 'sum') return Math.round(v)
  if (how === 'avg') return Math.round(v * 100) / 100
  return v // latest — keep full precision (weight, RHR, VO₂max…)
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

/** Device-local calendar day (YYYY-MM-DD) for a given instant. */
function localDayISO(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
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

  let deep = 0, rem = 0, core = 0, awake = 0
  let bedStart: string | undefined, bedEnd: string | undefined
  for (const s of samples) {
    const mins = (new Date(s.endDate).getTime() - new Date(s.startDate).getTime()) / 60000
    if (mins <= 0) continue
    if (!bedStart || s.startDate < bedStart) bedStart = s.startDate
    if (!bedEnd || s.endDate > bedEnd) bedEnd = s.endDate
    switch (s.value) {
      case 4: deep += mins; break
      case 5: rem += mins; break
      case 1: case 3: core += mins; break   // asleepUnspecified + asleepCore → core
      case 2: awake += mins; break
      default: break                          // 0 inBed → informs the bed window only
    }
  }
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

  // All 15 quantity metrics + the sleep category query fire in parallel — one
  // batch of concurrent native round-trips instead of ~16 sequential awaits.
  const [metricResults, sleep] = await Promise.all([
    Promise.all(METRIC_MAP.map(async (m) => {
      try {
        const { samples } = await HealthKit.queryQuantity({ sampleType: m.hk, dayStart: dateISO, isToday, startDate: start.toISOString(), endDate: end.toISOString(), reduce: m.reduce })
        return { key: m.key, value: roundReduced(samples, m.reduce) }
      } catch { return { key: m.key, value: undefined } } // metric not available on this device
    })),
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
