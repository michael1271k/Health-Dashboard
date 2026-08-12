/**
 * One watermark for "today's score was just recomputed".
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * Two entirely separate code paths POST `/api/compute-score` on every native
 * foreground, and each had its OWN throttle, so neither could see the other:
 *
 *   · `useEnsureTodayScore` (useDashboard.ts) — a 30s in-memory `useRef`, reset
 *     on every remount, invisible outside the hook.
 *   · `runSync` (native/sync.ts) — a 10s localStorage re-entrancy guard whose
 *     own comment insists it is "NOT a throttle".
 *
 * Bring the app to the foreground and both fired: a full HealthKit pull plus a
 * forced recompute from the native path, and a second independent recompute
 * from the dashboard, racing it. Scoring a day is not cheap and it is not
 * idempotent in cost — the loser of that race is pure waste, and it lands
 * during the exact frames the user is looking at a resuming app.
 *
 * localStorage rather than a module-level variable, because the two callers
 * genuinely do not share a lifetime: `useEnsureTodayScore` unmounts with the
 * route, while `initNativeSync` lives as long as the process.
 *
 * ── WHAT THIS IS NOT ─────────────────────────────────────────────────────────
 * Not a lock, and not a correctness mechanism. A recompute that slips through
 * is harmless — the route is idempotent for a given day. This only stops the
 * common case of doing the same work twice within a second or two of itself.
 * Anything that MUST recompute (the once-per-session week backfill, an explicit
 * pull-to-refresh, a nutrition-flag write) deliberately does not consult it.
 */

const KEY = 'helix_score_computed_at'

/** Record that a compute-score POST was just issued. */
export function markScoreComputed(): void {
  try { localStorage.setItem(KEY, String(Date.now())) } catch { /* private mode */ }
}

/**
 * Did any path recompute today's score within `ms`?
 *
 * Fails OPEN — an unreadable or malformed watermark returns false, so the
 * caller does its work. Skipping a recompute because storage threw would be a
 * worse outcome than the duplicate this exists to prevent.
 */
export function scoreComputedWithin(ms: number): boolean {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return false
    const at = Number(raw)
    if (!Number.isFinite(at)) return false
    return Date.now() - at < ms
  } catch {
    return false
  }
}
