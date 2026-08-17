/**
 * THE STREAK. One derivation, one number, everywhere.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 * There were two counters wearing similar words and disagreeing by ten. The
 * widget rendered `streakFrom` — consecutive scheduled training days actually
 * trained — under the caption "scheduled days". The dashboard rendered
 * `programDay()` — calendar days elapsed since the cut began, a number that can
 * never go down — under the label "Program Day". Same glance, same phone, two
 * different answers to what reads as the same question.
 *
 * The streak is the one worth keeping: it is the number that can be broken, so
 * it is the only one of the two that describes behaviour rather than the passage
 * of time. `programDay` is gone.
 *
 * The derivation lived in `lib/widget/derive.ts`, which is the widget payload's
 * private workshop — importing it into the app would have made every dashboard
 * render depend on the widget's serialisation module. It is training domain, so
 * it lives in the training domain, and both the payload route and the app read
 * it from here.
 *
 * Pure and server-safe: no React, no `window`, no Supabase. The caller supplies
 * the days.
 */

/**
 * How far back the walk looks, in days.
 *
 * The widget payload's calendar window is built from this same constant, so the
 * app and the widget are never counting over different amounts of history —
 * which is the failure this whole file exists to end. Six weeks is long enough
 * that `best` is a real record and short enough to stay one cheap query.
 */
export const STREAK_WINDOW_DAYS = 42

/** One day as the streak sees it. Whether it was a rest day, and whether it was trained. */
export interface StreakDay {
  d: string
  scheduled: boolean
  logged: boolean
}

/**
 * The streak, counted over SCHEDULED days only.
 *
 * ── WHY REST DAYS CANNOT BREAK IT ────────────────────────────────────────────
 * Helix-5 rests Wednesday and Saturday. A streak that counted raw consecutive
 * calendar days would reset twice a week by design, which is a counter measuring
 * the plan rather than the athlete — it could never exceed 3.
 *
 * So the walk skips unscheduled days entirely and breaks only on a scheduled day
 * with no session. Today is a special case: a training day that has not been
 * done YET is not a miss, it is a day still in progress, so the walk starts at
 * the most recent scheduled day that is either logged or in the past.
 *
 * `best` is the longest such run anywhere in the window, which is why it can
 * exceed `current` and why both are worth having — though only `current` is
 * shown now that the progress bar comparing them is gone.
 */
export function streakFrom(
  days: ReadonlyArray<StreakDay>,
  todayISO: string,
): { current: number; best: number } {
  const scheduled = days.filter((x) => x.scheduled).sort((a, b) => (a.d < b.d ? -1 : 1))

  let best = 0, run = 0
  for (const x of scheduled) {
    run = x.logged ? run + 1 : 0
    if (run > best) best = run
  }

  // Walk backwards. Today is skipped when it is scheduled but not yet logged —
  // an unfinished day is not a broken one.
  let current = 0
  for (let i = scheduled.length - 1; i >= 0; i--) {
    const x = scheduled[i]
    if (x.d === todayISO && !x.logged) continue
    if (x.d > todayISO) continue          // a scheduled future day owes nothing
    if (!x.logged) break
    current++
  }
  return { current, best }
}
