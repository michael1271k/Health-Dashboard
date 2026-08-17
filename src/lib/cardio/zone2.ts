/**
 * What Zone 2 means in this app. One definition, no framework.
 *
 * ── WHY THESE MOVED OUT OF `useCardio.ts` ────────────────────────────────────
 * They lived in a `'use client'` hook, so a server route could not read them —
 * and `/api/widget/snapshot` needs them, because the Cardio widget face has to
 * count Zone-2 sessions exactly the way the CardioLogger's pips do. Importing a
 * client module into a route handler is not merely untidy: it hands the route a
 * client-reference proxy that throws on call, which is how that endpoint once
 * returned 500 on every request it ever served (`route-client-boundary.test.ts`
 * exists because of it, and `utils/measure.ts` was split out of `utils/units.ts`
 * for the same reason).
 *
 * ── AND WHY IT IS A COUNT, NOT A DURATION ────────────────────────────────────
 * Zone 2 here is a count of SESSIONS at or over the minimum — two a week, on
 * the plan's rest days. It is not a minute total. Anything rendering minutes
 * under the words "Zone 2" is describing a different quantity than the app is,
 * which is exactly the class of disagreement that made the widget and the
 * dashboard report different streaks.
 */

/** Zone-2 target: 2 steady cardio sessions per week (the plan's rest-day work). */
export const ZONE2_WEEKLY_TARGET = 2

/**
 * A session counts as Zone 2 at 20 minutes or more — a steady block, which
 * deliberately excludes the 5-minute treadmill warm-up before a lifting session.
 */
export const ZONE2_MIN_MINUTES = 20

/** Whether one logged session counts toward the weekly Zone-2 target. */
export function isZone2(durationMin: number | null | undefined): boolean {
  return typeof durationMin === 'number' && durationMin >= ZONE2_MIN_MINUTES
}
