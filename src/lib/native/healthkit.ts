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

/**
 * Pull today's HealthKit metrics, shape the flat payload, and POST to
 * /api/ingest with the user's JWT. Returns the payload it sent (or null when
 * not native / no session / nothing new). Battery-safe: callers throttle.
 */
export async function syncHealthKitToServer(): Promise<Record<string, number> | null> {
  if (!Capacitor.isNativePlatform()) return null
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return null

  const now = new Date()
  const start = new Date(now); start.setHours(0, 0, 0, 0)
  const payload: Record<string, number> = {}
  for (const m of METRIC_MAP) {
    try {
      const { samples } = await HealthKit.queryQuantity({ sampleType: m.hk, startDate: start.toISOString(), endDate: now.toISOString() })
      const v = reduceSamples(samples, m.reduce)
      if (v !== undefined) payload[m.key] = v
    } catch { /* skip a metric that isn't available */ }
  }
  if (Object.keys(payload).length === 0) return null

  await fetch('/api/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(payload),
  })
  return payload
}
