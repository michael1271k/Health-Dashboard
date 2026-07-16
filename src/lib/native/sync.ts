'use client'

import { Capacitor } from '@capacitor/core'
import { syncRollingWindow, requestHealthAuthorization } from './healthkit'

const WATERMARK_KEY = 'helix_hk_last_sync'
const MIN_INTERVAL_MS = 30 * 60 * 1000 // don't re-pull HealthKit more than every 30 min on resume

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

  void (async () => {
    await requestHealthAuthorization()
    await runSync(true) // first foreground: sync immediately
    const { App } = await import('@capacitor/app')
    const handle = await App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void runSync(false)
    })
    removeListener = () => { void handle.remove() }
  })()

  return () => { removeListener?.() }
}

/** Entry point for a background task (registered natively). */
export async function backgroundSync(): Promise<void> {
  await runSync(true)
}
