'use client'

import { Capacitor } from '@capacitor/core'
import { syncHealthKitToServer, syncYesterdayToServer, requestHealthAuthorization } from './healthkit'
import { authedFetch } from '@/lib/utils/authedFetch'
import { logicalTodayISO, hoursAwakeToday } from '@/lib/utils/day'

const WATERMARK_KEY = 'helix_hk_last_sync'
// Records the yesterday-date whose HealthKit catch-up already ran. Yesterday only
// needs syncing ONCE after the day rolls (to grab late-night activity logged
// after the last foreground) — re-pulling it on every foreground was pure waste.
const YESTERDAY_KEY = 'helix_yesterday_synced'
// Small re-entrancy guard only — NOT a throttle. iOS can fire appStateChange
// twice for a single foreground; this collapses those into one sync while still
// letting every genuine app-open run a full sync.
const REENTRANCY_MS = 10 * 1000

/** Yesterday's logical ISO date (device-local, midnight boundary). */
function yesterdayISO(): string {
  const d = new Date(`${logicalTodayISO()}T12:00:00`)
  d.setDate(d.getDate() - 1)
  return d.toLocaleDateString('en-CA')
}

function yesterdayAlreadySynced(): boolean {
  try { return localStorage.getItem(YESTERDAY_KEY) === yesterdayISO() } catch { return false }
}

/**
 * Native sync orchestrator. A FULL data sync runs on every app-open / foreground
 * (HealthKit pull → server score recompute → query revalidation). The only
 * throttle is a 10s re-entrancy guard against duplicate resume events.
 *
 * Entirely inert on the web (guarded), so importing it never affects the
 * desktop build.
 */
type OnSynced = () => void

/** Resolves once the document has finished loading (or immediately if it has). */
function documentReady(): Promise<void> {
  if (typeof document === 'undefined' || document.readyState === 'complete') return Promise.resolve()
  return new Promise((resolve) => {
    const done = () => { window.removeEventListener('load', done); resolve() }
    window.addEventListener('load', done, { once: true })
    // Safety net: never block the sync chain forever on a stalled load event.
    setTimeout(done, 4000)
  })
}

function withinReentrancyWindow(): boolean {
  try {
    const last = Number(localStorage.getItem(WATERMARK_KEY) ?? 0)
    return Date.now() - last < REENTRANCY_MS
  } catch { return false }
}

/**
 * One full sync pass, in TWO PHASES so the visible day lands FAST:
 *
 *   Phase 1 — TODAY: pull today's HealthKit → /api/ingest → recompute the score →
 *     revalidate the UI. This is everything the open dashboard shows, so the user
 *     sees fresh numbers as soon as today's pull finishes.
 *   Phase 2 — YESTERDAY: pull yesterday in the background to self-correct any
 *     late-recorded data, then revalidate again.
 *
 * The old flow pulled yesterday FIRST and both days BEFORE any revalidation, so
 * today's numbers didn't appear until ~2× the metric-fan-out had run — the
 * "sync takes 7–10 s" the user felt. Today-first roughly halves time-to-fresh.
 */
async function runSync(force: boolean, onSynced?: OnSynced): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  if (!force && withinReentrancyWindow()) return
  try { localStorage.setItem(WATERMARK_KEY, String(Date.now())) } catch { /* ignore */ }

  // ── Phase 1 — TODAY (the visible day) ──
  try { await syncHealthKitToServer() } catch { /* HK pull failed — resume retries */ }
  try {
    await authedFetch('/api/compute-score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: logicalTodayISO(), hoursAwake: hoursAwakeToday(), isToday: true, force: true }),
    })
  } catch { /* scoring failed — the next foreground retries */ }
  onSynced?.() // revalidate NOW — today's data + score are in

  // ── Phase 2 — YESTERDAY (one-time background catch-up) ──
  // Runs ONCE per rolled-over day: it exists only to grab activity recorded after
  // last night's final foreground. A forced sync (pull-to-refresh) always re-runs
  // it; a plain foreground skips it once done. Manual macro edits stay protected
  // regardless — the ingest path drops HealthKit macros when hk_uuid='manual'.
  if (force || !yesterdayAlreadySynced()) {
    try {
      const yesterday = await syncYesterdayToServer()
      if (yesterday) {
        try { localStorage.setItem(YESTERDAY_KEY, yesterdayISO()) } catch { /* ignore */ }
        onSynced?.()
      }
    } catch { /* yesterday's correction failed — next foreground retries */ }
  }
}

/**
 * Wire app-open + resume full-sync. `onSynced` revalidates React Query after each
 * pass (the caller passes an invalidator bound to its QueryClient). Returns a
 * cleanup fn. No-op on web.
 */
export function initNativeSync(onSynced?: OnSynced): () => void {
  if (!Capacitor.isNativePlatform()) return () => {}
  let removeListener: (() => void) | undefined
  let cancelled = false
  let granted = false

  // Defer the first auth + sync until AFTER the launch frame paints — firing the
  // permission sheet + parallel metric queries + ingest synchronously on mount is
  // the launch-time storm we keep off the critical path. Each phase is isolated
  // so a HealthKit/network failure can never brick boot.
  const kickoff = async () => {
    if (cancelled) return
    // The HealthKit permission sheet needs a presentable root view controller.
    // On a cold start the WKWebView isn't attached yet, so requesting here used
    // to silently no-op (which is why the popup only appeared on the SECOND
    // launch). Wait for the document to finish loading, then yield a frame.
    await documentReady()
    await new Promise((r) => setTimeout(r, 300))
    if (cancelled) return
    try { granted = await requestHealthAuthorization() } catch { /* denied / plugin missing — continue */ }
    if (cancelled) return
    // Let the auth sheet fully dismiss before hitting the store (a sync started
    // in the same tick as the grant is what surfaced the native crash).
    await new Promise((r) => setTimeout(r, 400))
    if (cancelled) return
    try { await runSync(true, onSynced) } catch { /* first sync failed — resume retries */ }
    if (cancelled) return
    try {
      const { App } = await import('@capacitor/app')
      const handle = await App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) return
        void (async () => {
          // If the sheet never got presented on a cold launch, retry it here —
          // by now there is definitely a view controller to present from.
          if (!granted) {
            try { granted = await requestHealthAuthorization() } catch { /* still denied */ }
          }
          // Every genuine foreground triggers a full sync (10s re-entrancy guard only).
          await runSync(false, onSynced).catch(() => {})
        })()
      })
      removeListener = () => { void handle.remove() }
    } catch { /* @capacitor/app unavailable — no resume syncing */ }
  }

  void kickoff()

  return () => { cancelled = true; removeListener?.() }
}

/** Entry point for a background task (registered natively). */
export async function backgroundSync(): Promise<void> {
  await runSync(true)
}

/** Force an immediate full sync (ignores the re-entrancy guard) — pull-to-refresh. */
export async function forceHealthKitSync(onSynced?: OnSynced): Promise<void> {
  await runSync(true, onSynced)
}
