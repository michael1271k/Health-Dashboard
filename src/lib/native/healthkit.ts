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
interface HealthKitPlugin {
  requestAuthorization(opts: { read: string[] }): Promise<{ granted: boolean }>
  queryQuantity(opts: { sampleType: string; startDate: string; endDate: string }): Promise<{ samples: HealthSample[] }>
}
const HealthKit = registerPlugin<HealthKitPlugin>('CapacitorHealthkit')

/** HealthKit sample identifiers → our ingest payload keys + how to reduce them. */
const METRIC_MAP: Array<{ hk: string; key: string; reduce: 'sum' | 'latest' | 'avg' }> = [
  { hk: 'HKQuantityTypeIdentifierStepCount', key: 'steps', reduce: 'sum' },
  { hk: 'HKQuantityTypeIdentifierActiveEnergyBurned', key: 'active_energy', reduce: 'sum' },
  { hk: 'HKQuantityTypeIdentifierAppleExerciseTime', key: 'training_minutes', reduce: 'sum' },
  { hk: 'HKQuantityTypeIdentifierAppleStandHour', key: 'standing_minutes', reduce: 'sum' },
  { hk: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN', key: 'hrv', reduce: 'avg' },
  { hk: 'HKQuantityTypeIdentifierRestingHeartRate', key: 'avg_rest_heart_rate', reduce: 'latest' },
  { hk: 'HKQuantityTypeIdentifierRespiratoryRate', key: 'respiratory_rate', reduce: 'avg' },
  { hk: 'HKQuantityTypeIdentifierOxygenSaturation', key: 'blood_oxygen', reduce: 'latest' },
  { hk: 'HKQuantityTypeIdentifierVO2Max', key: 'vo2max', reduce: 'latest' },
  { hk: 'HKQuantityTypeIdentifierBodyMass', key: 'weight', reduce: 'latest' },
]
const READ_TYPES = METRIC_MAP.map((m) => m.hk).concat('HKCategoryTypeIdentifierSleepAnalysis')

function reduceSamples(samples: HealthSample[], how: 'sum' | 'latest' | 'avg'): number | undefined {
  if (!samples.length) return undefined
  if (how === 'sum') return Math.round(samples.reduce((s, x) => s + x.value, 0))
  if (how === 'avg') return Math.round((samples.reduce((s, x) => s + x.value, 0) / samples.length) * 100) / 100
  return samples[samples.length - 1].value // latest
}

/** Request Health read permission once (native only). */
export async function requestHealthAuthorization(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const { granted } = await HealthKit.requestAuthorization({ read: READ_TYPES })
    return granted
  } catch { return false }
}

/** Device-local calendar day (YYYY-MM-DD) for a given instant. */
function localDayISO(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Pull one local day's HealthKit metrics and POST to /api/ingest with an
 * explicit `date` so the server writes to that exact day (it upserts
 * last-write-wins on user_id+date). `isToday` caps the query window at "now"
 * (a live running total); past days query the full midnight-to-midnight window.
 * Returns the payload sent, or null when not native / no session / nothing new.
 */
async function syncDay(dateISO: string, isToday: boolean): Promise<Record<string, number> | null> {
  if (!Capacitor.isNativePlatform()) return null
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return null

  const start = new Date(`${dateISO}T00:00:00`)
  const end = isToday ? new Date() : new Date(`${dateISO}T23:59:59.999`)
  const payload: Record<string, number> = {}
  for (const m of METRIC_MAP) {
    try {
      const { samples } = await HealthKit.queryQuantity({ sampleType: m.hk, startDate: start.toISOString(), endDate: end.toISOString() })
      const v = reduceSamples(samples, m.reduce)
      if (v !== undefined) payload[m.key] = v
    } catch { /* skip a metric that isn't available */ }
  }
  if (Object.keys(payload).length === 0) return null

  await fetch('/api/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ ...payload, date: dateISO }),
  })
  return payload
}

/** Pull today only (the live running total). Battery-safe: callers throttle. */
export async function syncHealthKitToServer(): Promise<Record<string, number> | null> {
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
export async function syncRollingWindow(): Promise<{ today: Record<string, number> | null; yesterday: Record<string, number> | null }> {
  if (!Capacitor.isNativePlatform()) return { today: null, yesterday: null }
  const now = new Date()
  const yst = new Date(now); yst.setDate(yst.getDate() - 1)
  const today = await syncDay(localDayISO(now), true)
  const yesterday = await syncDay(localDayISO(yst), false)
  return { today, yesterday }
}
