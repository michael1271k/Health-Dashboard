/**
 * Phase levers — the rungs of the cut, in code, with one selection in the DB.
 *
 * ── WHAT A LEVER IS ──────────────────────────────────────────────────────────
 * A deficit has two dials: eat less, or move more. A lever is one named
 * combination of both, so "tighten it a notch" is a single decision with a
 * single name rather than four numbers retyped in Settings and then half
 * remembered a week later. The rungs are ordered: each is a strictly harder
 * week than the one above it.
 *
 * ── EVERY MACRO TRIPLE IS ATWATER-EXACT ──────────────────────────────────────
 * 4 kcal/g protein, 4 kcal/g carbohydrate, 9 kcal/g fat. The baseline is
 * 170·4 + 195·4 + 55·9 = 1955, which is where the app's old `1950` literal came
 * from and what it was five kcal wrong about. `levers.test.ts` asserts the sum
 * for every rung, so a hand-edited macro here cannot drift from its own calorie
 * figure the way that literal did.
 *
 * ── PRECEDENCE, AND WHY IT IS NOT WHAT THE PLAN SAID ─────────────────────────
 * The plan put the lever BELOW a `plan_phase_goals` override. That ordering
 * cannot be honoured identically on both sides: the client knows which fields
 * you typed by hand for this (plan, phase); the server scorer reads the
 * `user_goals` row and has no such knowledge, so it would grade against the
 * lever on days the client displayed the override. A goal shown and a goal
 * graded that differ is the exact bug class `serverScheduleContext` exists to
 * prevent.
 *
 * So a lever is the TOP layer on both sides, and typing your own numbers selects
 * the `custom` rung — which is a real selection, not an absence. One rule, one
 * answer, whichever side asks.
 */

// `dailyTargets` imports `LeverGoals` from here, but TYPE-only — that side is
// erased at build, so this is a one-way runtime edge and not a cycle.
import { applyDailyTarget, type DailyTarget } from './dailyTargets'

export type LeverId = 'baseline' | 'lever-1' | 'lever-2' | 'maintenance-week' | 'custom'

export interface NutritionLever {
  id: LeverId
  label: string
  /**
   * ── A RUNG IS NOT ALWAYS A TIGHTENING ──────────────────────────────────────
   * `deficit` rungs are the ladder this file opens by describing: ordered,
   * each strictly harder than the one above it, protein flat throughout.
   *
   * `release` is the other direction — a planned, bounded week at or near
   * maintenance, taken ON PURPOSE inside a cut. It is a rung by every mechanic
   * that matters (one named set of targets, in force from a date, resolved
   * identically by the client and the server scorer, recorded in
   * `LEVER_SCHEDULE` when it is pulled), and it is emphatically not a step on
   * the ladder — so the ordering invariant applies to `deficit` only, and the
   * UI paints a release in a different colour from the deficit rungs.
   */
  kind: 'deficit' | 'release'
  /** One line, written for the moment of choosing — not a description of a diet. */
  summary: string
  calorieGoal: number
  proteinGoalG: number
  carbsGoalG: number
  fatGoalG: number
  stepsGoal: number
}

/**
 * The rungs, easiest first. `custom` is deliberately NOT here: it names the
 * absence of a rung and carries no numbers of its own.
 */
export const LEVERS: NutritionLever[] = [
  {
    id: 'baseline',
    kind: 'deficit',
    label: 'Baseline',
    // ── 10k, NOT 8k (corrected 2026-08-22) ──
    // The rung said 8,000 while `NUTRITION_PRESETS.cut` said 10,000 and the
    // live `user_goals` row said 10,000. Two of the three agreed and the rung
    // was the odd one out, so the baseline was grading step adherence against a
    // target the athlete had never been set — and because `baseline` governs
    // the WHOLE cut from 2026-07-15, every day of it was graded that way.
    summary: 'The plan as written — full carbs, 10k steps.',
    calorieGoal: 1955, proteinGoalG: 170, carbsGoalG: 195, fatGoalG: 55,
    stepsGoal: 10000,
  },
  {
    id: 'lever-1',
    kind: 'deficit',
    label: 'Lever 1',
    summary: '−70 kcal off carbs and fat, steps to 10k.',
    calorieGoal: 1885, proteinGoalG: 170, carbsGoalG: 182, fatGoalG: 53,
    stepsGoal: 10000,
  },
  {
    // From here the FOOD stops moving. Protein is already at the floor a cut can
    // hold and cutting carbs further costs training quality, so this rung
    // deepens the deficit with movement instead — which is also the half you
    // can abandon on a bad week without eating into recovery.
    //
    // ── THE LAST RUNG, AND IT IS A BAND (merged 2026-08-22) ──
    // This was two rungs: Lever 2 at 12k steps and Lever 3 at 15k, identical in
    // every other field. They were never two decisions — the food is the same,
    // the deficit is the same shape, and the only thing that moved was how far
    // you walked on a given day, which is not something a rung should have to
    // be swapped to express. Lever 3 is deleted and its ceiling becomes the top
    // of this one's band.
    //
    // `stepsGoal` STAYS 12000 and no second field was added: it is the number
    // every grader, the scorer, the widget and the export compare against, and
    // a band that graded at its ceiling would mark a 13k day as a miss. 12k is
    // the floor that counts; 15k is where the band runs out.
    id: 'lever-2',
    kind: 'deficit',
    label: 'Lever 2',
    summary: 'Same food as Lever 1, steps 12k–15k. The last rung.',
    calorieGoal: 1885, proteinGoalG: 170, carbsGoalG: 182, fatGoalG: 53,
    stepsGoal: 12000,
  },
  {
    /**
     * ── THE MAINTENANCE WEEK ──────────────────────────────────────────────────
     * A planned week at maintenance, inside the cut, without leaving the cut.
     *
     * ── WHY IT IS A LEVER AND NOT A PHASE ─────────────────────────────────────
     * The obvious move is to flip `user_goals.goal_preset` to `maintenance` for
     * a week. It is the wrong one, three times over:
     *
     *   · `maintenance` is a real phase with its own body targets (64 kg, 13.5%
     *     body fat, 9k steps) and its own reason for existing. A week off the
     *     deficit is not a decision to stop cutting, and it must not silently
     *     restate the goal weight.
     *   · `activeProgram(plan, phase)` resolves the TRAINING day list by phase.
     *     Changing the phase to run a diet week would change which exercises
     *     the deck seeds. The nutrition and the programme would move together
     *     when only one of them was asked to.
     *   · A phase has no end date. It would have to be remembered and flipped
     *     back by hand, and forgetting is the default outcome.
     *
     * A lever has none of those problems and one property none of the
     * alternatives have: `leverForDate` gives it a date axis for free. Selecting
     * it applies from TODAY forward and can never re-mark a finished day, which
     * is exactly what "activate it on the first day of the week" means. When it
     * comes off, that is a `LEVER_SCHEDULE` row too — see the symmetry rule
     * above; a rung being RELEASED is an event, and this one is guaranteed to
     * be released.
     *
     * ── 2,151 AND NOT 2,150, AND NOT THE OLD 2,445 ────────────────────────────
     * This rung was first written as "2450 kcal (170P / 295C / 65F)", which is
     * Atwater-exactly 2,445 — the round number in the plan against macros that
     * summed to something else, the same trap as `1950` vs `1955` in the header.
     *
     * It was re-specified on 2026-08-30, the first day it ever came into force,
     * as 2150 kcal (170P / 55F / 244C). Those macros are Atwater-exactly
     * 170·4 + 244·4 + 55·9 = 2,151, so 2,151 is what is written here. The rule
     * has not changed and is the reason both numbers moved: THE MACROS ARE THE
     * INSTRUCTION AND THE CALORIE FIGURE IS THEIR SUM. `levers.test.ts` asserts
     * it for every rung, so this cannot drift again.
     *
     * The new triple is the `plan_phase_goals` cut row exactly (2151 / 170 /
     * 244 / 55). That is not a coincidence to be tidied away — it says the
     * release lands on the phase's own untightened numbers rather than on a
     * separate figure that would then need its own maintenance.
     *
     * ── AND STEPS DO COME DOWN ────────────────────────────────────────────────
     * The first version of this comment said "steps stay at the cut's 10k floor.
     * This week releases the FOOD; nothing about it says walk less." That was
     * wrong in practice: the week's whole purpose is shedding accumulated
     * fatigue, a 10k floor on a rest-focused week is graded as a miss on most of
     * its days, and a target you are expected to fail is not a target. 7,500 —
     * the middle of the 7–8k the week was actually planned around.
     */
    id: 'maintenance-week',
    kind: 'release',
    label: 'Maintenance Week',
    summary: 'A planned week at maintenance — full food, lighter steps. Still cutting.',
    calorieGoal: 2151, proteinGoalG: 170, carbsGoalG: 244, fatGoalG: 55,
    stepsGoal: 7500,
  },
]

/** The ordered ladder — the rungs the "each is harder than the last" rule governs. */
export const DEFICIT_LEVERS: NutritionLever[] = LEVERS.filter((l) => l.kind === 'deficit')

export const DEFAULT_LEVER: LeverId = 'baseline'

/**
 * WHEN each rung came into force.
 *
 * ── WHY A DATE AXIS EXISTS AT ALL ────────────────────────────────────────────
 * `user_goals.active_lever` holds ONE value: the rung you are on now. Every
 * grade in the app read that value, including grades of days that finished
 * weeks ago — so pulling Lever 1 on 16 Aug did not tighten the cut going
 * forward, it silently re-marked the whole of it. Thirty-one days eaten at
 * 1,955 kcal, every one of them planned and hit, were suddenly 70 kcal over a
 * target that did not exist when they were eaten. Adherence is a claim about
 * what you were asked for at the time; a single mutable field cannot make it.
 *
 * So the rungs get the one thing they were missing — a start date — and the
 * schedule below is the record of when each was pulled:
 *
 *   · 2026-07-15 (HELIX_CUT_START) … 2026-08-15   baseline, 1,955 kcal
 *   · 2026-08-16 … 2026-08-19                     Lever 1,  1,885 kcal
 *   · 2026-08-20 onward                           custom,   1,955 kcal
 *
 * ── A RUNG COMING OFF IS ALSO AN EVENT ───────────────────────────────────────
 * The 2026-08-20 row was missing for a day, and its absence is instructive. The
 * schedule recorded Lever 1 being PULLED and nothing about it being RELEASED, so
 * `leverForDate` kept answering "Lever 1" for every past date from 16 Aug
 * onward — including Thursday 20 Aug, which `user_goals.updated_at` timestamps
 * at 08:47 that morning as the moment the rung came off and the food went back
 * to 1,955. One day of the cut was graded 70 kcal over a target that had already
 * been abandoned, and the weekly export printed a single figure for a week that
 * had two.
 *
 * So the rule is symmetric: a row goes in whenever the rung CHANGES, and going
 * back to your own numbers is a change. `custom` is a real selection — it means
 * "these are my figures, leave them alone" — and `applyLever` correctly declines
 * to overwrite the goals when it sees one.
 *
 * It is CODE, not a table, for the same reason the rungs themselves are: this
 * is the block's own history, it is three lines long, and a schema for it would
 * be a migration plus a fetch plus a cache in front of a fact that changes
 * about once a month. It is also the only shape the server scorer and the
 * client can both resolve without a round trip.
 *
 * Dates are inclusive lower bounds, newest LAST.
 */
export interface LeverPeriod {
  /** First date this rung applies to, inclusive (YYYY-MM-DD). */
  from: string
  leverId: LeverId
  /**
   * ── WHAT `custom` MEANT, ON THE DAYS IT MEANT IT ───────────────────────────
   * A rung carries its own numbers; `custom` carries none, so `applyLever`
   * hands back whatever it was given — and every caller gives it the CURRENT
   * `user_goals` row. That is right for today and a lie about any finished day,
   * because the row is one mutable record of five numbers with no date axis.
   *
   * It printed one: the Week 6 export (23–29 Aug) said `Custom — 1955 kcal`
   * for seven days that were eaten at 1,999, because the carbohydrate figure
   * had been retyped from 206 to 195 on 30 Aug and the export read it back as
   * though it had always said so. The rung id was date-resolved; the numbers
   * beside it were not.
   *
   * So a `custom` row may pin the numbers that were in force from `from` until
   * the next row. Present ⇒ that stretch is history and answers with these.
   * Absent ⇒ the stretch is still open and answers with the live row, which is
   * what `custom` means while you are living in it.
   *
   * Only ever set on a `custom` row: every other rung already has its figures
   * in `LEVERS`, and a second copy here is a second thing to drift.
   */
  goals?: LeverGoals
}

export const LEVER_SCHEDULE: readonly LeverPeriod[] = [
  { from: '2026-07-15', leverId: 'baseline' },
  { from: '2026-08-16', leverId: 'lever-1' },
  // Released — back to hand-set numbers while keeping Lever 1's 10k step floor.
  // Timestamped by `user_goals.updated_at`.
  //
  // The stretch is CLOSED (the maintenance week opens on 30 Aug), so it pins
  // what it meant: 170·4 + 206·4 + 55·9 = 1,999, Atwater-exact like every rung.
  // `levers.test.ts` asserts that sum here too.
  {
    from: '2026-08-20',
    leverId: 'custom',
    goals: { calorie: 1999, protein: 170, carbs: 206, fat: 55, steps: 10000 },
  },
  // ── THE SCHEDULED MAINTENANCE WEEK, AND ITS END ──────────────────────────
  // `PHASES` in phases.ts opens this week on the same date; this row is what
  // makes the two agree. Without it the timeline showed a maintenance week
  // while the goals, the score and the export all still ran the cut's numbers.
  //
  // The SECOND row is not optional. `scheduledLeverOn` returns the last rung on
  // or before a date, so a release with no successor is not a week — it is a
  // permanent 2,445 kcal, and the cut that resumes on 6 Sep (PHASES, Cut W7–12)
  // would be graded against maintenance targets for the rest of the block.
  // A release must always be followed by the rung that resumes.
  { from: '2026-08-30', leverId: 'maintenance-week' },
  // Open stretch — no `goals`, so it answers with the live `user_goals` row.
  { from: '2026-09-06', leverId: 'custom' },
]

/** The schedule row covering a date, or null before the cut opened. */
export function scheduledPeriodOn(dateISO: string): LeverPeriod | null {
  let found: LeverPeriod | null = null
  for (const p of LEVER_SCHEDULE) {
    if (dateISO >= p.from) found = p
    else break
  }
  return found
}

/** The rung the SCHEDULE puts on a date, or null before the cut opened. */
export function scheduledLeverOn(dateISO: string): LeverId | null {
  return scheduledPeriodOn(dateISO)?.leverId ?? null
}

/**
 * The rung in force on a date — the one thing every grader should ask.
 *
 * ── HOW THE SCHEDULE AND YOUR SELECTION SHARE THE JOB ────────────────────────
 * The past belongs to the schedule: a finished day was eaten against the rung
 * that was in force, and nothing you pick today may re-mark it. Today and
 * anything after it belong to your SELECTION, because that is the decision you
 * are currently holding — pulling Lever 2 must take effect immediately without
 * waiting for a code change, and it must not reach backwards.
 *
 * `custom` is a real selection (your own numbers) and wins today the same way a
 * rung does; `applyLever` then leaves the goals untouched, which is what custom
 * means. An absent selection — no column, nothing chosen — falls through to the
 * schedule on every date, which is why a database that has never seen the
 * `active_lever` DDL still grades 16 Aug onward at 1,885.
 *
 * Pure and server-safe. `todayISO` is passed in rather than read from a clock so
 * the scorer, the export and the tests all agree about where "today" is.
 *
 * ── WHY A RELEASE CARRIES AN END DATE ────────────────────────────────────────
 * `LEVER_SCHEDULE` closes a release with a second row, and the comment on that
 * array is blunt about what happens when someone forgets to write it: a release
 * with no successor is not a week, it is a permanent 2,151 kcal. That works when
 * the week was planned far enough ahead to be committed to source. It does not
 * work when the week is pulled from the Settings toggle, which writes
 * `user_goals.active_lever` and cannot add a row to a compiled constant.
 *
 * `releaseEndsOn` (`user_goals.maintenance_until`) is that missing row, as data.
 * Past it, the SELECTION stops being honoured and the date falls back to the
 * schedule — so a release closes itself whether or not anyone remembered to.
 * Absent, nothing changes and the old behaviour stands exactly as it was.
 */
export function leverForDate(
  dateISO: string,
  storedLeverId: string | null | undefined,
  todayISO: string,
  releaseEndsOn?: string | null,
): LeverId | null {
  if (dateISO >= todayISO && isLeverId(storedLeverId)) {
    const expired = releaseEndsOn != null && releaseEndsOn !== ''
      && leverById(storedLeverId)?.kind === 'release'
      && dateISO > releaseEndsOn
    if (!expired) return storedLeverId
  }
  return scheduledLeverOn(dateISO)
}

/** The rung a stored value names, or null for `custom`/unknown/absent. */
export function leverById(id: string | null | undefined): NutritionLever | null {
  if (!id) return null
  return LEVERS.find((l) => l.id === id) ?? null
}

/** Is this a value the lever column may hold at all? */
export function isLeverId(id: string | null | undefined): id is LeverId {
  return id === 'custom' || LEVERS.some((l) => l.id === id)
}

/** Atwater energy of a macro triple, for the invariant every rung must satisfy. */
export function atwaterKcal(proteinG: number, carbsG: number, fatG: number): number {
  return proteinG * 4 + carbsG * 4 + fatG * 9
}

/** The goal fields a lever replaces. Everything else it leaves alone. */
export interface LeverGoals {
  calorie: number
  protein: number | null
  carbs: number | null
  fat: number | null
  steps: number | null
}

/**
 * Apply a lever over resolved goals.
 *
 * Returns the input untouched for `custom`, for an unknown id, and for no
 * selection at all — the three cases where the user has not asked for a rung.
 */
export function applyLever(goals: LeverGoals, leverId: string | null | undefined): LeverGoals {
  const lever = leverById(leverId)
  if (!lever) return goals
  return {
    calorie: lever.calorieGoal,
    protein: lever.proteinGoalG,
    carbs: lever.carbsGoalG,
    fat: lever.fatGoalG,
    steps: lever.stepsGoal,
  }
}

/**
 * The targets that were in force on a date — rung, pinned history, or your row.
 *
 * `applyLever` answers "what does THIS rung ask for", which is all a caller
 * needs when it already knows the rung. This answers the question a REPORT asks
 * — "what was asked for on that Tuesday" — and it is the only entry point that
 * can honour a closed `custom` stretch, because it is the only one that has the
 * date and can therefore find the schedule row.
 *
 * Order: a real rung wins (its figures live in `LEVERS`); otherwise a `custom`
 * row's pinned `goals` win (that stretch is finished and said what it meant);
 * otherwise the fallback, which is the live `user_goals` row and correct only
 * for the stretch you are currently inside.
 */
export function goalsForDate(
  dateISO: string,
  storedLeverId: string | null | undefined,
  todayISO: string,
  fallback: LeverGoals,
  releaseEndsOn?: string | null,
): LeverGoals {
  const id = leverForDate(dateISO, storedLeverId, todayISO, releaseEndsOn) ?? DEFAULT_LEVER
  const rung = leverById(id)
  if (rung) return applyLever(fallback, id)
  // `custom` — the schedule's own record of what your numbers WERE across that
  // stretch, when it has one. A pin is only ever written on a CLOSED stretch
  // (a later row follows it), so it cannot shadow the numbers you are living
  // in: the open stretch carries no `goals` and falls through to the live row.
  return scheduledPeriodOn(dateISO)?.goals ?? fallback
}

/**
 * Which KIND of week a date belongs to.
 *
 * The deck's "Previous" column asks this: a normal week must not seed itself
 * from a maintenance week's lighter loads, and a maintenance week must not be
 * measured against full-effort ones. Nothing on `workout_sessions` records it —
 * see `useExerciseSetHistory` — so it is derived from the session's own date,
 * by the same function every grader already uses.
 *
 * `custom` and any date before the cut opened are `deficit`: they are full
 * -effort weeks, and only a `release` rung is the other thing.
 */
export function leverKindOn(
  dateISO: string,
  storedLeverId: string | null | undefined,
  todayISO: string,
  releaseEndsOn?: string | null,
): NutritionLever['kind'] {
  const id = leverForDate(dateISO, storedLeverId, todayISO, releaseEndsOn)
  return leverById(id)?.kind ?? 'deficit'
}

/**
 * The lever a `user_goals` row names, tolerant of the column not existing yet.
 *
 * `select('*')` omits an absent column rather than failing, so this reads null
 * on a database without the migration and everything behaves as it did before
 * levers existed. Lives HERE, in a module with no `'use client'` directive,
 * because the server scorer calls it — importing it from the hooks module made
 * it a client reference on the server, which is a proxy, not a function.
 */
export function activeLeverOf(row: unknown): string | null {
  if (!row || typeof row !== 'object') return null
  const v = (row as { active_lever?: unknown }).active_lever
  return typeof v === 'string' && v ? v : null
}

/**
 * One contiguous stretch of days that shared a single set of targets.
 *
 * Distinct from `LeverPeriod` above, which is a row in the SCHEDULE — "this rung
 * came into force on this date". This is the RESOLVED answer for a specific
 * range of days, which is what a report needs to print.
 */
export interface TargetPeriod {
  /** The rung's id, or `'custom'` when the user's own numbers were in force. */
  leverId: LeverId
  /** "Lever 1" / "Baseline" / "Custom". */
  label: string
  goals: LeverGoals
  /** ISO dates, in order. Contiguous by construction. */
  dates: string[]
}

/**
 * Which targets were in force on each day of a range, collapsed into runs.
 *
 * ── WHY A REPORT CANNOT JUST PRINT `user_goals` ──────────────────────────────
 * A week is not necessarily one target. Pull a lever on Wednesday and the week
 * has two, and the export's old `**Targets:** 1955 kcal · …` line — read
 * straight off the CURRENT `user_goals` row with no lever applied — printed one
 * figure for the whole seven days, silently attributing today's numbers to
 * Sunday. Adherence is a claim about what you were asked for AT THE TIME, and a
 * single mutable row cannot make it.
 *
 * `leverForDate` already knows the answer per day: the past belongs to
 * `LEVER_SCHEDULE`, today and after belong to your current selection. All this
 * does is ask it for every day and glue equal neighbours together, so the report
 * can say "Lever 1 on Sun–Wed, your own numbers from Thu" instead of one number
 * that was true for part of the week.
 *
 * Runs are compared on the RESOLVED GOALS, not on the rung's name: Lever 1 and
 * Lever 2 differ only in step target, and two rungs that ask for exactly the
 * same food and the same steps are the same instruction however they are
 * labelled. Splitting on the label alone would print two identical blocks.
 *
 * Pure, and `todayISO` is a parameter — the export, the scorer and the tests
 * have to agree about where "today" is, and a clock read inside here would make
 * the same week render differently tomorrow.
 */
export function leverPeriods(
  dates: readonly string[],
  storedLeverId: string | null | undefined,
  todayISO: string,
  /** The user's own numbers — what an OPEN `custom` stretch resolves to. */
  fallback: LeverGoals,
  opts?: {
    /**
     * `user_goals.maintenance_until`. Every other `leverForDate` caller passes
     * it and this one did not, so an export covering today never saw the
     * release expire and printed maintenance targets past the week's own end.
     */
    releaseEndsOn?: string | null
    /**
     * The week's `daily_targets` rows. The layer ABOVE the rung, and the export
     * was the one resolver that skipped it — so a per-day target set on the Day
     * screen was graded by the scorer, shown by the app, and then contradicted
     * by the report on the same numbers.
     */
    dailyTargets?: readonly DailyTarget[]
  },
): TargetPeriod[] {
  const out: TargetPeriod[] = []
  const same = (a: LeverGoals, b: LeverGoals) =>
    a.calorie === b.calorie && a.protein === b.protein
    && a.carbs === b.carbs && a.fat === b.fat && a.steps === b.steps
  const overrides = new Map((opts?.dailyTargets ?? []).map((t) => [t.date, t]))

  for (const date of dates) {
    const id = leverForDate(date, storedLeverId, todayISO, opts?.releaseEndsOn) ?? DEFAULT_LEVER
    const goals = applyDailyTarget(
      goalsForDate(date, storedLeverId, todayISO, fallback, opts?.releaseEndsOn),
      overrides.get(date),
    )
    const last = out[out.length - 1]
    if (last && same(last.goals, goals)) { last.dates.push(date); continue }
    out.push({
      leverId: id,
      // `leverById` returns null for `custom`, which is the point — it names the
      // ABSENCE of a rung, and the numbers beside it are the user's own.
      label: leverById(id)?.label ?? 'Custom',
      goals,
      dates: [date],
    })
  }
  return out
}
