import { NextResponse } from 'next/server'
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { nightWindow, nightOf } from '@/lib/sleep/nightWindow'
import { weekStartOf, isoAddDays, weekStartDayFromEndDay } from '@/lib/utils/week'
import { logicalTodayInTZ } from '@/lib/utils/day'
import { scheduleDayIn, isTrainingDayIn, sessionTargetIn } from '@/lib/programs'
import { serverScheduleContext } from '@/lib/schedule/serverContext'
import { computeForDate } from '@/lib/scoring/computeForDate'
import { BATTERY } from '@/lib/scoring/battery'
// `utils/units` is a `'use client'` module — importing validWeight from THERE
// hands a route handler a client-reference proxy that throws on call. See
// `utils/measure.ts` for why the pure rules were split out.
import { validWeight } from '@/lib/utils/measure'
import {
  parseScope, type WidgetScope, type WidgetSnapshot, type WidgetWeekTotals,
} from '@/lib/widget/snapshot'
import {
  trendPoints, meanBetween, topRecords, e1rmTrends, volumeByFamily, shiftISO,
  calendarDays, weeklyVolume, dailySeries, latestDelta,
  type SetRow,
} from '@/lib/widget/derive'
import { streakFrom, STREAK_WINDOW_DAYS } from '@/lib/training/streak'
import { computeReadiness } from '@/lib/scoring/readiness'

/**
 * GET /api/widget/snapshot — the iOS Widget + Watch data source.
 *
 * Auth is a single opaque bearer token looked up in `widget_tokens`, NOT a JWT:
 * a widget extension has nowhere to persist a rotating Supabase refresh token,
 * and on a free Apple team it can't share the app's Keychain either (App Groups
 * are a paid capability). The token is baked into the locally-signed build.
 *
 * Deliberately constrained so that token is low-value if it ever leaks:
 *   · GET only — no writes, no auth surface, no way to enumerate other users.
 *   · Scoped to exactly one user_id, resolved server-side from the token.
 *   · Revocable by deleting the row; rotate by inserting a new one.
 *
 * Timezone comes from the caller (`?tz=Europe/London`) with the stored
 * user_goals.timezone as the fallback — the server clock is UTC and would put
 * the widget a day out for part of every day.
 *
 * `?scope=lifestyle|performance|full` trims the expensive extras. See
 * `WidgetScope`: the base contract ships in every scope, so the Swift decoder
 * never has to reason about which fields a query parameter happened to include.
 */
export const dynamic = 'force-dynamic'

const HOME_TZ = 'Asia/Jerusalem'

/** How old today's score row may be before the widget recomputes it. */
const SCORE_STALE_MINUTES = 20

function bearer(req: Request): string | null {
  const h = req.headers.get('authorization') ?? ''
  const m = /^Bearer\s+(.+)$/i.exec(h.trim())
  return m ? m[1].trim() : null
}

/**
 * Run a sub-query so a transport failure degrades ONE field instead of the page.
 *
 * The reads below used to sit in a bare `Promise.all`. Supabase resolves query
 * errors into `{ error }` rather than rejecting, so that held for ordinary
 * failures — but a DNS blip, an aborted socket, or an unmigrated table reached
 * through a throwing client rejects for real, and `Promise.all` turns one
 * rejection into a 500. A widget extension gets a few hundred milliseconds and
 * one shot; handing it nothing because the sleep table hiccuped is the worst
 * possible trade, and `snapshot.ts` is explicit that every field is nullable
 * precisely so a partial answer is a valid one.
 */
async function soft<T>(p: PromiseLike<{ data: T | null }>): Promise<T | null> {
  try {
    const { data } = await p
    return data ?? null
  } catch {
    return null
  }
}

/**
 * Roughly how far through the waking day the user is, in their own timezone.
 *
 * The battery drains against this, so it is the reason a widget can go stale
 * without any new data arriving at all. `hoursAwakeToday` reads the SERVER
 * clock, which is UTC — for a Jerusalem morning that is a three-hour error in
 * the one input that changes every hour.
 */
function hoursAwakeInTZ(tz: string, wakeHour = 7): number {
  try {
    const hh = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false })
      .format(new Date())
    return Math.max(0, Math.min(BATTERY.maxAwake, Number(hh) - wakeHour))
  } catch {
    return Math.max(0, Math.min(BATTERY.maxAwake, new Date().getUTCHours() - wakeHour))
  }
}

/** Sum a week's session rows into the shape both `week` and `weekPrev` use. */
function totalsOf(rows: ReadonlyArray<{
  total_volume_kg: number | null; set_count: number | null; pr_count: number | null
}>): WidgetWeekTotals {
  return {
    sessions: rows.length,
    volumeKg: Math.round(rows.reduce((s, r) => s + (r.total_volume_kg ?? 0), 0)),
    prs: rows.reduce((s, r) => s + (r.pr_count ?? 0), 0),
    sets: rows.reduce((s, r) => s + (r.set_count ?? 0), 0),
  }
}

export async function GET(req: Request) {
  const token = bearer(req)
  if (!token) {
    return NextResponse.json({ error: 'Missing bearer token' }, { status: 401 })
  }

  const supabase = getServerSupabaseClient()

  const { data: tokenRow, error: tokenErr } = await supabase
    .from('widget_tokens').select('user_id').eq('token', token).maybeSingle()
  if (tokenErr) {
    // Table not migrated yet — say so plainly rather than reading as a bad token.
    return NextResponse.json(
      { error: 'widget_tokens is not migrated yet — run the Phase 2 SQL.' },
      { status: 503 },
    )
  }
  const userId = (tokenRow as { user_id?: string } | null)?.user_id
  if (!userId) return NextResponse.json({ error: 'Unknown token' }, { status: 401 })

  const { data: goalsRow } = await supabase
    .from('user_goals').select('*').eq('user_id', userId).maybeSingle()
  const goals = (goalsRow ?? {}) as Record<string, number | string | null>

  const url = new URL(req.url)
  const scope: WidgetScope = parseScope(url.searchParams.get('scope'))
  // One flag per FAMILY. `full` wants everything; every other scope wants its
  // own quarter and nothing else, because an extension is measured in hundreds
  // of milliseconds and a hard memory cap.
  const wantsLifestyle = scope === 'lifestyle' || scope === 'full'
  const wantsPerformance = scope === 'performance' || scope === 'full'
  const wantsTraining = scope === 'training' || scope === 'full'
  const wantsBody = scope === 'body' || scope === 'full'

  const tz = url.searchParams.get('tz') || (goals.timezone as string | null) || HOME_TZ
  const date = logicalTodayInTZ(tz)
  const night = nightWindow(date)
  // The user's week, not the server's. `weekStartOf` defaults to
  // `deviceWeekStartDay()`, which has no localStorage here and therefore always
  // answered Sunday — so a Monday-start preference made the widget's "this week"
  // disagree with the same figure inside the app, by up to a whole session.
  const weekStartDay = weekStartDayFromEndDay(goals.week_end_day as number | null)
  const weekStart = weekStartOf(date, weekStartDay)
  const prevWeekStart = isoAddDays(weekStart, -7)
  const weekEndExclusive = `${isoAddDays(weekStart, 7)}T00:00:00Z`
  // ── ONE session read, not four ─────────────────────────────────────────────
  // The calendar wants six weeks, the volume sparkline wants eight, the totals
  // want two and "today" wants one — all from `workout_sessions`, all nested
  // inside the widest. Eight weeks of this athlete's sessions is ~40 rows, so
  // the wide read is cheaper than the extra round trips, and every derived
  // figure is then guaranteed to agree with the others.
  const VOLUME_WEEKS = 8
  // Shared with the app's own streak hook, so the widget and the dashboard can
  // never count the same streak over different amounts of history.
  const CALENDAR_DAYS = STREAK_WINDOW_DAYS
  // ── One week of the daily logs, not one day ────────────────────────────────
  // Water, calories and sleep were each read for TODAY alone, which is why the
  // Fuel and Sleep Large faces had nothing to put in a third register and filled
  // with air instead. Seven days of three small tables is a handful of rows and
  // no extra round trips — the queries already existed, they were just narrow.
  const TREND_DAYS = 7
  const trendFrom = isoAddDays(date, -(TREND_DAYS - 1))
  const historyStart = isoAddDays(weekStartOf(date, weekStartDay), -7 * (VOLUME_WEEKS - 1))
  const sessionsFrom = historyStart < isoAddDays(date, -(CALENDAR_DAYS - 1))
    ? historyStart : isoAddDays(date, -(CALENDAR_DAYS - 1))

  // ── The plan the user is ACTUALLY running ──────────────────────────────────
  // This used to be `scheduleDayFor(date)` / `isRestDayFor(date)` /
  // `activeProgram().days.length`, all of which resolve through localStorage and
  // therefore answered with the DEFAULT plan, the bulk phase and an empty
  // override map on a server. The widget announced the wrong session for any
  // other plan and ignored every swap in `schedule_overrides`.
  const schedule = await serverScheduleContext(supabase, userId, goals)

  // ── Keep the score honest before answering ─────────────────────────────────
  // `battery_pct` decays with hours awake, so the stored row is wrong within an
  // hour of being written even when no new data has arrived — which is exactly
  // why the widget looked frozen until the app was opened. Recomputing here
  // makes a widget refresh a *data* refresh. Bounded deliberately: today only,
  // never a finalized past day, and skipped entirely when the row is fresh.
  await refreshTodayScore(supabase, userId, date, tz, !isTrainingDayIn(schedule, date))

  const [score, log, metrics, sleepRows, nutriRows, waterRows, weightRows, weekRows] = await Promise.all([
    soft(supabase.from('daily_scores')
      .select('score, battery_pct, sleep_score, nutrition_score, activity_score, workout_score, recovery_score')
      .eq('user_id', userId).eq('date', date).maybeSingle()),
    soft(supabase.from('daily_logs').select('steps, distance_m, active_energy, water_ml, sleep_minutes')
      .eq('user_id', userId).eq('date', date).maybeSingle()),
    soft(supabase.from('daily_metrics').select('steps, active_cal').eq('user_id', userId).eq('date', date).maybeSingle()),
    // Seven nights, not one. Tonight's row is picked out of these below, so the
    // detail face and the trend cannot disagree about what last night was.
    soft(supabase.from('sleep_sessions')
      .select('duration_min, deep_min, rem_min, core_min, awake_min, sleep_score, start_time, end_time')
      .eq('user_id', userId)
      .gte('start_time', nightWindow(trendFrom).from).lt('start_time', night.to)
      .order('duration_min', { ascending: false })),
    soft(supabase.from('nutrition_entries').select('date, calories, protein_g, carbs_g, fat_g')
      .eq('user_id', userId).gte('date', trendFrom).lte('date', date).eq('meal_type', 'daily')),
    soft(supabase.from('water_intake').select('date, amount_ml')
      .eq('user_id', userId).gte('date', trendFrom).lte('date', date)),
    // Enough weigh-ins for a fortnight trace AND last week's mean baseline —
    // the route already fetched eight and threw six of them away.
    soft(supabase.from('body_composition')
      .select('date, weight_kg, body_fat_pct, muscle_mass_kg, skeletal_muscle_mass_kg, fat_free_mass_kg')
      .eq('user_id', userId)
      .order('date', { ascending: false }).limit(30)),
    // The one session read — see `sessionsFrom`. Totals, deltas, the calendar,
    // the volume sparkline and today's row all come out of this.
    soft(supabase.from('workout_sessions')
      .select('started_at, total_volume_kg, set_count, pr_count, day_key, duration_min, session_rpe')
      .eq('user_id', userId)
      .gte('started_at', `${sessionsFrom}T00:00:00Z`).lt('started_at', weekEndExclusive)),
  ]) as [
    {
      score: number | null; battery_pct: number | null
      sleep_score: number | null; nutrition_score: number | null; activity_score: number | null
      workout_score: number | null; recovery_score: number | null
    } | null,
    Record<string, number | null> | null,
    { steps: number | null; active_cal: number | null } | null,
    Array<{
      duration_min: number | null; deep_min: number | null; rem_min: number | null
      core_min: number | null; awake_min: number | null; sleep_score: number | null
      start_time: string | null; end_time: string | null
    }> | null,
    Array<{
      date: string; calories: number | null
      protein_g: number | null; carbs_g: number | null; fat_g: number | null
    }> | null,
    Array<{ date: string; amount_ml: number }> | null,
    Array<{
      date: string; weight_kg: number | null; body_fat_pct: number | null
      muscle_mass_kg: number | null; skeletal_muscle_mass_kg: number | null
      fat_free_mass_kg: number | null
    }> | null,
    Array<{
      started_at: string; total_volume_kg: number | null; set_count: number | null
      pr_count: number | null; day_key: string | null
      duration_min: number | null; session_rpe: number | null
    }> | null,
  ]

  // ── Today, picked out of the week ──────────────────────────────────────────
  // These three reads are now seven days wide, so "today" has to be selected
  // rather than assumed. Selecting it from the SAME rows the trend is built from
  // is the point: a detail face and its own sparkline cannot disagree about what
  // last night was if they came out of one query.
  const water = (waterRows ?? []).filter((r) => r.date === date)
  const nutri = (nutriRows ?? []).find((r) => r.date === date) ?? null
  // The query is ordered by duration descending, so the first row inside
  // tonight's window is the longest — which is the one the detail face wants.
  const sleep = (sleepRows ?? []).find(
    (r) => r.start_time != null && nightOf(r.start_time) === date) ?? null

  const allSessions = weekRows ?? []
  const dayOf = (s: { started_at: string }) => s.started_at.slice(0, 10)
  const weekSessions = allSessions.filter((s) => dayOf(s) >= weekStart)
  const prevSessions = allSessions.filter((s) => dayOf(s) >= prevWeekStart && dayOf(s) < weekStart)
  const todaySessions = allSessions.filter((s) => dayOf(s) === date)

  // Weigh-ins, de-duplicated by VALUE so a re-synced identical reading doesn't
  // read as a fresh weigh-in (same rule as the dashboard's Body card).
  const weighIns = (weightRows ?? [])
    .map((r) => ({ date: r.date, kg: validWeight(r.weight_kg) }))
    .filter((r): r is { date: string; kg: number } => r.kg != null)
  const latest = weighIns[0] ?? null
  const previous = weighIns.find((r) => latest && Math.abs(r.kg - latest.kg) >= 0.05) ?? null

  const weightSeries = trendPoints(weighIns.map((r) => ({ date: r.date, value: r.kg })), 14)

  const day = scheduleDayIn(schedule, date)
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

  // ── The calendar, and the streak that falls out of it ──────────────────────
  // Built for every scope because `streak` is cheap once the days exist, and
  // `calendar` is the only expensive half (42 entries) — that one is trimmed.
  const calendarWindow = Array.from({ length: CALENDAR_DAYS }, (_, i) =>
    isoAddDays(date, -(CALENDAR_DAYS - 1 - i)))
  const calendar = calendarDays(
    calendarWindow,
    allSessions.map((s) => ({ date: dayOf(s), volumeKg: s.total_volume_kg })),
    // The PLAN's answer for that date, swaps and layout included — never a
    // weekday guess, which a swap breaks.
    (d) => {
      const sd = scheduleDayIn(schedule, d)
      return {
        dayKey: sd === 'rest' ? null : (sd.dayKey ?? null),
        // The plan's own words. Already resolved here and previously discarded,
        // so any face that lists days as ROWS had a colour and no name for them.
        label: sd === 'rest' ? null : sd.label,
        scheduled: isTrainingDayIn(schedule, d),
      }
    },
  )

  // Today's session, if one has landed. Two sessions in a day are summed for
  // the tonnage and counts; RPE and duration take the longer one, because
  // averaging two efforts describes neither.
  const longest = todaySessions.reduce<typeof todaySessions[number] | null>(
    (best, s) => (best == null || (s.duration_min ?? 0) > (best.duration_min ?? 0) ? s : best), null)
  const sum = (pick: (s: typeof todaySessions[number]) => number | null): number | null => {
    const vals = todaySessions.map(pick).filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null
  }

  const snapshot: WidgetSnapshot = {
    date,
    generatedAt: new Date().toISOString(),
    scope,
    battery: score?.battery_pct ?? null,
    score: score?.score ?? null,
    sleep: {
      minutes: sleep?.duration_min ?? log?.sleep_minutes ?? null,
      deepMin: sleep?.deep_min ?? null,
      remMin: sleep?.rem_min ?? null,
      coreMin: sleep?.core_min ?? null,
      awakeMin: sleep?.awake_min ?? null,
      score: sleep?.sleep_score ?? null,
      startTime: sleep?.start_time ?? null,
      endTime: sleep?.end_time ?? null,
      // The user's own target. The Small sleep face read a hardcoded 480, so it
      // graded every night against 8 hours regardless of what Settings said.
      goalMin: (() => {
        const h = num(goals.sleep_goal_hours)
        return h == null ? null : Math.round(h * 60)
      })(),
    },
    weight: {
      kg: latest?.kg ?? null,
      deltaKg: latest && previous ? Math.round((latest.kg - previous.kg) * 100) / 100 : null,
      measuredOn: latest?.date ?? null,
      targetKg: num(goals.target_weight_kg),
      // The baseline the fortnight is read against. Null — never zero — when
      // last week holds no weigh-in at all.
      prevWeekMeanKg: meanBetween(weightSeries, prevWeekStart, weekStart),
      // Body is where the weight face lives now; lifestyle keeps it because the
      // Lifestyle composite still ships with a weight focus until the Swift
      // families land, and a widget already on a home screen must not go blank
      // between the deploy and the app update.
      ...(wantsLifestyle || wantsBody ? { trend: weightSeries } : {}),
    },
    macros: {
      kcal: nutri?.calories ?? null,
      kcalGoal: num(goals.calorie_goal),
      proteinG: nutri?.protein_g ?? null,
      proteinGoalG: num(goals.protein_goal_g),
      carbsG: nutri?.carbs_g ?? null,
      carbsGoalG: num(goals.carbs_goal_g),
      fatG: nutri?.fat_g ?? null,
      fatGoalG: num(goals.fat_goal_g),
    },
    water: {
      ml: water.length ? water.reduce((s, r) => s + r.amount_ml, 0) : log?.water_ml ?? null,
      goalMl: num(goals.water_goal_ml),
    },
    steps: {
      count: metrics?.steps ?? log?.steps ?? null,
      goal: num(goals.steps_goal),
      distanceM: log?.distance_m ?? null,
      activeKcal: metrics?.active_cal ?? log?.active_energy ?? null,
    },
    workout: {
      label: day === 'rest' ? 'Rest' : day.label,
      // The program key, so a widget can tint itself with the day's own colour
      // instead of inferring one from the label string.
      dayKey: day === 'rest' ? null : (day.dayKey ?? null),
      logged: weekSessions.some((s) => s.started_at.slice(0, 10) === date),
      isRestDay: !isTrainingDayIn(schedule, date),
    },
    week: {
      ...totalsOf(weekSessions),
      // How many training days the active plan schedules — without it, "3
      // sessions" is a number with nothing to be measured against, which is the
      // one thing a glanceable surface cannot afford.
      sessionTarget: sessionTargetIn(schedule),
    },
    weekPrev: totalsOf(prevSessions),
    // Null until something has been logged. `workout` above says what the PLAN
    // asks for; this says what happened, and the two are different questions.
    today: todaySessions.length ? {
      durationMin: longest?.duration_min ?? null,
      sessionRpe: longest?.session_rpe ?? null,
      volumeKg: sum((s) => s.total_volume_kg),
      setCount: sum((s) => s.set_count),
      prCount: sum((s) => s.pr_count),
    } : null,
    streak: streakFrom(calendar, date),
  }

  if (wantsLifestyle) {
    snapshot.steps.trend = await stepsTrend(supabase, userId, date)
    // Both off rows already fetched — the queries went from one day wide to
    // seven, not from one query to three.
    snapshot.water.trend = dailySeries(
      (waterRows ?? []).map((r) => ({ date: r.date, value: r.amount_ml })),
      { limit: TREND_DAYS })
    snapshot.macros.kcalTrend = dailySeries(
      (nutriRows ?? []).map((r) => ({ date: r.date, value: r.calories })),
      { limit: TREND_DAYS })
  }
  if (wantsPerformance) {
    Object.assign(snapshot, await performanceSlice(supabase, userId, date, weekStart, weekEndExclusive))
  }
  // ── volumeTrend belongs to BOTH training and performance ───────────────────
  // The Volume faces need the per-family split for their third register, and
  // that lives in the performance slice — so `TrainingFocus.volume` fetches the
  // performance scope. It still needs the eight-week trend, which is derived
  // from `allSessions` and therefore free in every scope; withholding it would
  // have cost a `workout_sets` read to avoid nothing.
  if (wantsTraining || wantsPerformance) {
    snapshot.volumeTrend = weeklyVolume(
      allSessions.map((s) => ({ date: dayOf(s), volumeKg: s.total_volume_kg })),
      (d) => weekStartOf(d, weekStartDay),
      VOLUME_WEEKS,
    )
  }
  if (wantsTraining) {
    snapshot.calendar = calendar
  }
  if (wantsBody) {
    // Read FIELD BY FIELD, not row by row: a day can carry a weight and a body
    // fat but no muscle mass, so the newest muscle figure often lives on an
    // older row than the newest weight (the same rule `CARRY_FIELDS` follows).
    // `latestDelta` then skips back to the previous DIFFERING reading, because
    // this table carries values forward and row-to-row would report 0.0 on every
    // day between weigh-ins and call it "held steady".
    const field = <K extends keyof NonNullable<typeof weightRows>[number]>(key: K) =>
      latestDelta(trendPoints((weightRows ?? []).map((r) => ({ date: r.date, value: num(r[key]) })), 30))

    // Three DIFFERENT measurements, never interchangeable: skeletal muscle
    // (~27 kg, entered by hand), lean soft tissue (~50 kg, and it must be
    // LABELLED as such), fat-free mass (~53 kg, derived).
    const fat = field('body_fat_pct')
    const lean = field('muscle_mass_kg')
    const skeletal = field('skeletal_muscle_mass_kg')
    const ffm = field('fat_free_mass_kg')

    snapshot.body = {
      fatPct: fat.value, fatPctDelta: fat.delta,
      muscleKg: lean.value, muscleKgDelta: lean.delta,
      smmKg: skeletal.value, smmKgDelta: skeletal.delta,
      ffmKg: ffm.value, ffmKgDelta: ffm.delta,
      fatTrend: trendPoints(
        (weightRows ?? []).map((r) => ({ date: r.date, value: r.body_fat_pct })), 14),
    }
    // Seven nights, bucketed by `nightOf` — never by `start_time.slice(0, 10)`,
    // which files a pre-midnight bedtime under the evening it began instead of
    // the morning it ended.
    snapshot.sleep.trend = dailySeries(
      (sleepRows ?? [])
        .filter((r) => r.start_time != null)
        .map((r) => ({ date: nightOf(r.start_time as string), value: r.duration_min })),
      { limit: TREND_DAYS, combine: 'max' })
    snapshot.scores = {
      sleep: num(score?.sleep_score), nutrition: num(score?.nutrition_score),
      activity: num(score?.activity_score), workout: num(score?.workout_score),
      recovery: num(score?.recovery_score),
    }
    // `computeReadiness` needs a battery to weigh against; with no score row at
    // all there is nothing to grade, and a verdict invented from a default would
    // be exactly the confident wrong answer the payload contract forbids.
    if (snapshot.battery != null) {
      const { level, label, color, reason } = computeReadiness(
        { sleepScore: snapshot.scores.sleep, recoveryScore: snapshot.scores.recovery },
        snapshot.battery,
      )
      snapshot.readiness = { level, label, color, reason }
    }
  }

  // Best-effort usage stamp — never let it fail the request.
  void supabase.from('widget_tokens')
    .update({ last_used_at: new Date().toISOString() } as never)
    .eq('token', token)
    .then(undefined, () => {})

  return NextResponse.json(snapshot, {
    headers: {
      // Widgets refresh on their own timeline; a short edge cache keeps repeated
      // small/medium/Watch fetches from hitting the DB three times over. Keyed
      // per scope by Vary so a Lifestyle response is never served to a
      // Performance widget.
      'Cache-Control': 'private, max-age=60',
      'Vary': 'Authorization',
    },
  })
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = ReturnType<typeof getServerSupabaseClient>

/**
 * Recompute today's score when the stored one has gone stale.
 *
 * Yes, this is a write on a GET. It is deliberate and bounded: idempotent,
 * scoped to the one user the token resolves to, restricted to their logical
 * TODAY (a finalized past day is never touched), and skipped entirely when the
 * row was written within `SCORE_STALE_MINUTES`. The alternative is the state
 * this replaces — a home-screen battery that is only ever as fresh as the last
 * time the app happened to be opened.
 *
 * Failure is silent by design. A widget with a slightly old battery is a far
 * better outcome than a widget with no battery, so nothing here may reject.
 */
async function refreshTodayScore(
  supabase: Db, userId: string, date: string, tz: string, isRestDay: boolean,
): Promise<void> {
  try {
    const { data } = await (supabase as any)
      .from('daily_scores').select('computed_at')
      .eq('user_id', userId).eq('date', date).maybeSingle()
    const writtenAt = (data as { computed_at?: string | null } | null)?.computed_at ?? null
    if (writtenAt) {
      const ageMin = (Date.now() - new Date(writtenAt).getTime()) / 60000
      if (Number.isFinite(ageMin) && ageMin < SCORE_STALE_MINUTES) return
    }
    await computeForDate(supabase as any, userId, date, hoursAwakeInTZ(tz), {
      isRestDay, todayISO: date, isToday: true,
    })
  } catch {
    /* a stale battery beats no battery */
  }
}

/** Seven days of step counts, preferring the HealthKit mirror over the log. */
async function stepsTrend(supabase: Db, userId: string, date: string) {
  const from = shiftISO(date, -6)
  const [metrics, logs] = await Promise.all([
    soft((supabase as any).from('daily_metrics').select('date, steps')
      .eq('user_id', userId).gte('date', from).lte('date', date)),
    soft((supabase as any).from('daily_logs').select('date, steps')
      .eq('user_id', userId).gte('date', from).lte('date', date)),
  ]) as [Array<{ date: string; steps: number | null }> | null, Array<{ date: string; steps: number | null }> | null]

  const byDate = new Map<string, number | null>()
  for (const r of logs ?? []) byDate.set(r.date, r.steps)
  // daily_metrics is the deduplicated HealthKit read (iPhone + Watch resolved by
  // HKStatisticsQuery); daily_logs is the older mirror. Metrics wins where both
  // exist — that is the number the Health app itself shows.
  for (const r of metrics ?? []) if (r.steps != null) byDate.set(r.date, r.steps)

  return trendPoints([...byDate].map(([d, v]) => ({ date: d, value: v })), 7)
}

/**
 * Records, 1RM movement and the week's muscle-family split.
 *
 * Three reads, all small: 421 sets and 66 ledger rows exist in total, and the
 * exercise catalogue is 59 names. The name join is done here rather than as a
 * PostgREST embed because `workout_sets` carries only `exercise_id` and the
 * record ledger carries only a display NAME — the two have to be reconciled in
 * one place regardless.
 */
async function performanceSlice(
  supabase: Db, userId: string, date: string, weekStart: string, weekEndExclusive: string,
) {
  const since = shiftISO(date, -35)   // enough history for a 28-day 1RM delta
  const [ledger, catalog, sessions] = await Promise.all([
    soft((supabase as any).from('personal_records')
      .select('exercise_key, axis, value, reps, achieved_on').eq('user_id', userId)
      .order('achieved_on', { ascending: false }).limit(40)),
    soft((supabase as any).from('exercises').select('id, name')),
    soft((supabase as any).from('workout_sessions').select('id, started_at')
      .eq('user_id', userId).gte('started_at', `${since}T00:00:00Z`)),
  ]) as [
    Array<{ exercise_key: string; axis: string; value: number | null; reps: number | null; achieved_on: string | null }> | null,
    Array<{ id: string; name: string }> | null,
    Array<{ id: string; started_at: string }> | null,
  ]

  const sessionDay = new Map((sessions ?? []).map((s) => [s.id, s.started_at.slice(0, 10)]))
  const names = new Map((catalog ?? []).map((e) => [e.id, e.name]))

  const setRows = sessionDay.size
    ? (await soft((supabase as any).from('workout_sets')
      .select('session_id, exercise_id, weight_kg, reps, est_1rm_kg, set_type')
      .eq('user_id', userId).in('session_id', [...sessionDay.keys()])) as Array<{
        session_id: string; exercise_id: string; weight_kg: number | null
        reps: number | null; est_1rm_kg: number | null; set_type: string | null
      }> | null) ?? []
    : []

  const sets: SetRow[] = setRows
    .map((r) => ({
      exercise: names.get(r.exercise_id) ?? '',
      day: sessionDay.get(r.session_id) ?? '',
      weightKg: r.weight_kg,
      reps: r.reps,
      est1rmKg: r.est_1rm_kg,
      setType: r.set_type,
    }))
    // A set whose exercise or session cannot be named is a set nothing can say
    // anything true about — drop it rather than attribute it to "".
    .filter((s) => s.exercise !== '' && s.day !== '')

  const weekSets = sets.filter((s) => s.day >= weekStart && `${s.day}T00:00:00Z` < weekEndExclusive)

  return {
    // Six and five, up from three each. The Large faces list them as rows and
    // three rows over a Large's height was the "dead space at the bottom" — the
    // ledger already fetches forty, so the extra entries cost nothing but bytes.
    records: topRecords(ledger ?? [], 6),
    e1rm: e1rmTrends(sets, { asOf: date, limit: 5 }),
    volumeByFamily: volumeByFamily(weekSets),
  }
}
