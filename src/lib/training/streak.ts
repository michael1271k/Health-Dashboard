import { HELIX_CUT_START } from '@/lib/programs'

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
 * The streak was the one kept: it is the number that can be broken, so it was
 * the only one of the two that described behaviour rather than the passage of
 * time.
 *
 * ── AND IT HAS NOW BEEN REDEFINED (2026-08-19) ───────────────────────────────
 * The consecutive-scheduled-days walk survives below as `streakFrom` — it is
 * still the honest answer to "how many training days in a row" and the calendar
 * window it needs is still built for the widget. But the number the app SHOWS
 * under the flame is the program day again, by explicit decision: how far into
 * the cut you are, counted from `HELIX_CUT_START`.
 *
 * The old objection to that counter was never the arithmetic — it was that two
 * different numbers wore one glyph on one screen. That is what is fixed here:
 * there is one derivation (`programDayCount`), the app and the widget payload
 * both read it, and `streakFrom` is no longer rendered anywhere. A counter that
 * cannot go down is the correct shape for the thing being measured, because a
 * cut does not restart when you miss a Tuesday — it is thirty-six days long
 * whatever happened inside it.
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

/**
 * PROGRAM DAY — how deep into the cut you are, inclusive of both ends.
 *
 * 2026-07-15 is day 1 (`HELIX_CUT_START`, the day the Helix Cut block opened),
 * so 2026-08-18 is day 35 and each following date is one more. It never falls,
 * because elapsed time does not fall; a missed session costs the day's score,
 * not the block's length.
 *
 * Returns 0 for any date before the block opened rather than a negative number:
 * "you are minus four days into the cut" is not a fact anything should render.
 *
 * Pure and server-safe. Both ends are dates, not instants, so this is plain
 * calendar arithmetic in UTC — no timezone can make 15 Jul → 18 Aug anything
 * other than 35 days.
 */
export function programDayCount(todayISO: string, startISO: string = HELIX_CUT_START): number {
  const start = Date.parse(`${startISO}T00:00:00Z`)
  const today = Date.parse(`${todayISO}T00:00:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(today) || today < start) return 0
  return Math.round((today - start) / 86_400_000) + 1
}
