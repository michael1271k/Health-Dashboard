import { NextResponse } from 'next/server'
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { BATTERY } from '@/lib/scoring/battery'
import { computeForDate, type ComputedScoreRow } from '@/lib/scoring/computeForDate'
import { serverScheduleContext } from '@/lib/schedule/serverContext'
import { isTrainingDayIn } from '@/lib/programs'
import { denyIfUnauthorized } from '@/lib/auth/guard'
import { resolveCallerUserId } from '@/lib/auth/identity'
import { logicalTodayISO, hoursAwakeToday } from '@/lib/utils/day'

function todayISO(): string {
  return logicalTodayISO() // device-local calendar day, midnight boundary
}

export async function POST(req: Request) {
  const denied = denyIfUnauthorized(req)
  if (denied) return denied

  const supabase = getServerSupabaseClient()

  // Multi-tenant: a JWT caller gets THEIR scores computed; headless/cron calls
  // (no JWT) sweep the whole household so every member's day stays scored.
  const caller = await resolveCallerUserId(req, supabase)
  let userIds: string[]
  if (caller) {
    userIds = [caller]
  } else {
    const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers()
    if (usersError || !users.length) return NextResponse.json({ error: 'No user' }, { status: 401 })
    userIds = users.map((u) => u.id)
  }

  // The CLIENT knows the user's real timezone (device-local logical day + hours
  // awake) — the server cannot. Trust client-provided values when present and
  // fall back to the server clock only for cron/headless calls.
  const body = await req.json().catch(() => ({})) as { backfillDays?: number; date?: string; hoursAwake?: number; force?: boolean; isToday?: boolean }
  const backfillDays = Math.max(0, Math.min(31, Number(body?.backfillDays) || 0))
  const today = body?.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : todayISO()
  const awake = Number.isFinite(body?.hoursAwake) ? Math.max(0, Math.min(18, Number(body?.hoursAwake))) : hoursAwakeToday()
  // Edit/delete recompute: `force` bypasses the finalized freeze; the client
  // says whether the target date is its logical today (live) or a past day.
  const force = !!body?.force
  const targetIsToday = typeof body?.isToday === 'boolean' ? body.isToday : (today === todayISO())

  // Past-day ISO strings to backfill (1..backfillDays ago).
  const backfillDates = Array.from({ length: backfillDays }, (_, i) => {
    const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - (i + 1))
    return d.toISOString().slice(0, 10)
  })

  let computed: ComputedScoreRow | null = null
  for (const userId of userIds) {
    // Rest-day resolution used to happen INSIDE computeForDate, through the
    // localStorage-backed `isRestDayFor` — which on a server always answered
    // against the default plan with no swaps applied. Every score this route has
    // written graded rest days against a week the athlete may not have been
    // training. One read per user, reused across the whole backfill range.
    const schedule = await serverScheduleContext(supabase, userId)
    // Today first (fast — it's the visible day), then fan the backfill range out
    // in PARALLEL. The old sequential loop ran up to 8 day-computations back to
    // back on the first session of the day, which was a big chunk of the felt
    // sync latency. `force` propagates so an explicit recompute (e.g. after a
    // manual data correction) rewrites even FINALIZED past days.
    // A FINISHED DAY IS SCORED AS A FINISHED DAY. `awake` describes how far
    // through the day the CALLER is, which is only meaningful for today. A past
    // date used to inherit it — so `recompute-scores.mjs`, which posts a date
    // and no hoursAwake, scored every historical day as though it were whatever
    // o'clock the script happened to run at. Re-running it in the evening gave
    // different numbers from the morning, for days that ended weeks ago.
    //
    // Pinning completed days to a full waking day makes a recompute idempotent
    // with respect to the wall clock, which is the only way its output can be
    // compared across runs.
    const row = await computeForDate(
      supabase, userId, today, targetIsToday ? awake : BATTERY.maxAwake,
      { isRestDay: !isTrainingDayIn(schedule, today), todayISO: todayISO(), isToday: targetIsToday, force },
    )
    // The JWT path resolves to exactly one caller, so this is unambiguously the
    // requesting user's row. The headless sweep has no client waiting on it.
    if (caller && userId === caller) computed = row
    await Promise.all(
      backfillDates.map((d) => computeForDate(
        supabase, userId, d, BATTERY.maxAwake,
        { isRestDay: !isTrainingDayIn(schedule, d), todayISO: todayISO(), isToday: false, force },
      )),
    )
  }

  // `score` lets the client paint the new numbers without a round trip. Null
  // when nothing was written (frozen past day, or a day with no data at all) —
  // the client then simply falls back to invalidating.
  return NextResponse.json({ ok: true, today, backfilled: backfillDays, users: userIds.length, score: computed })
}
