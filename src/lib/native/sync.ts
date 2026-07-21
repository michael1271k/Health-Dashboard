'use client'

import { Capacitor } from '@capacitor/core'
import { syncRollingWindow, requestHealthAuthorization } from './healthkit'

const WATERMARK_KEY = 'helix_hk_last_sync'
const MIN_INTERVAL_MS = 5 * 60 * 1000 // aggressive foreground sync: re-pull HealthKit at most every 5 min on resume

/**
 * Native sync orchestrator. Foreground pulls run on app resume (throttled by a
 * watermark so rapid app-switching doesn't hammer HealthKit or the network).
 * Silent throttled background syncs are registered via HealthKit Background
 * Delivery / BGTaskScheduler in the iOS project (native config — see
 * docs/native-ios.md); this module is the JS entry point they call.
 *
 * Entirely inert on the web (guarded), so importing it never affects the
 * desktop build.
 */
function dueForSync(): boolean {
  try {
    const last = Number(localStorage.getItem(WATERMARK_KEY) ?? 0)
    return Date.now() - last >= MIN_INTERVAL_MS
  } catch { return true }
}

async function runSync(force = false): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  if (!force && !dueForSync()) return
  // Rolling today+yesterday window so yesterday's final total self-corrects the
  // morning after (steps that accrued after the previous day's last sync).
  const { today, yesterday } = await syncRollingWindow()
  if (today || yesterday) { try { localStorage.setItem(WATERMARK_KEY, String(Date.now())) } catch { /* ignore */ } }
}

/** Wire app-resume syncing. Returns a cleanup fn. No-op on web. */
export function initNativeSync(): () => void {
  if (!Capacitor.isNativePlatform()) return () => {}
  let removeListener: (() => void) | undefined
  let cancelled = false

  // Defer the first auth + sync until AFTER the launch frame paints. Firing the
  // HealthKit permission sheet + 16 parallel metric queries + the ingest POST
  // synchronously on mount is the launch-time storm we want off the critical
  // path. Each phase is isolated so a HealthKit/network failure can never brick
  // boot — a throw here used to be able to take the whole shell down.
  const kickoff = async () => {
    if (cancelled) return
    try { await requestHealthAuthorization() } catch { /* denied / plugin missing — continue */ }
    if (cancelled) return
    try { await runSync(true) } catch { /* first sync failed — resume listener retries */ }
    if (cancelled) return
    try {
      const { App } = await import('@capacitor/app')
      const handle = await App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) void runSync(false).catch(() => {})
      })
      removeListener = () => { void handle.remove() }
    } catch { /* @capacitor/app unavailable — no resume syncing */ }
  }

  // requestIdleCallback yields to first paint; setTimeout(0) is the fallback.
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback
  if (ric) ric(() => void kickoff(), { timeout: 3000 })
  else setTimeout(() => void kickoff(), 0)

  return () => { cancelled = true; removeListener?.() }
}

/** Entry point for a background task (registered natively). */
export async function backgroundSync(): Promise<void> {
  await runSync(true)
}

/** Force an immediate HealthKit pull (ignores the throttle) — pull-to-refresh. */
export async function forceHealthKitSync(): Promise<void> {
  await runSync(true)
}
