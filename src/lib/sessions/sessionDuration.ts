/**
 * How long the workout actually took — the ONE rule, for both clients.
 *
 * ── WHY THIS EXISTS: THE 385-MINUTE SESSION ─────────────────────────────────
 * 2026-09-06's Upper A is stored as `duration_min = 385` for about an hour of
 * work. Nobody typed that. It is what happens when a wall-clock span is used as
 * a duration:
 *
 *   · `buildCommitPayload` derives `endedAt` as `startedAt + duration + PAUSE`,
 *     and it is right to — `ended_at` answers "when did you walk out", and the
 *     pause belongs in it.
 *   · `save.ts` then derives `duration_min` as `endedAt − startedAt` whenever
 *     the finish sheet did not supply one. That is the same wall clock, pause
 *     included, so the pause is added and then counted.
 *   · The finish sheet supplies nothing once the deck has been open longer than
 *     `MAX_SESSION_SEC` (6 h), because `sessionElapsedSec` correctly refuses to
 *     answer for a span that long. So the exact case the fallback exists for is
 *     the case where the fallback is most wrong.
 *
 * A deck opened at 10:46, worked for an hour, and committed at 17:12 therefore
 * recorded 385 minutes: 60 minutes of default plus 325 minutes of pause, read
 * back off the clock as though it had all been training. Load, ACWR, monotony
 * and strain all read `duration_min`, so one number like this moves the battery
 * for the next 48 days (`ReadinessHistoryBuilder`).
 *
 * ── THE RULE ────────────────────────────────────────────────────────────────
 * `ended − started − paused`, and then the LONG-IDLE guard: if the last set was
 * logged more than {@link LONG_IDLE_MIN} minutes before the finish, the tail is
 * not training and is not counted. What is counted instead is the work plus one
 * rest — the honest reading of "you finished, then did something else, then
 * remembered to press the button".
 *
 * Pure: no clock, no I/O. Vector `session-duration.json`.
 */

/** A gap this long between the last set and the finish is not training. */
export const LONG_IDLE_MIN = 20

/** The rest credited after the last set when the guard fires. `ProgramExercise
 *  .restSec` is per movement and the caller passes it when it has one; this is
 *  the fallback for a session whose last exercise prescribes none. */
export const DEFAULT_REST_TARGET_SEC = 180

export interface DurationInput {
  /** ISO instant the session began. */
  startedAt: string
  /** ISO instant it was finished — wall clock, pause included. */
  endedAt: string
  /** Total milliseconds the session spent paused. */
  pausedMs?: number
  /**
   * Of that pause, how much had already CLOSED when the last set was logged.
   *
   * ── WHY THE TOTAL IS NOT ENOUGH ────────────────────────────────────────────
   * The long-idle guard throws the tail away, and a pause tapped inside that
   * tail is part of what it throws away. Subtracting the TOTAL from the work
   * that came before it takes those minutes twice — once by discarding the tail
   * they are in, and again off the hour that was actually trained. A session
   * that lifted 10:00–11:00, was paused 12:00–12:30 and was finished at 13:00
   * recorded 30 minutes for a real hour: the 385-minute bug's mirror image,
   * shrinking instead of inflating.
   *
   * Zero is the right default. The guard exists for the case where the session
   * sat idle AFTER the work, so an unattributed pause belongs to the tail —
   * and the one caller that has a `lastSetAt` (`AppDatabase.closeSession`) has
   * the event log and passes the real split.
   */
  pausedBeforeLastSetMs?: number
  /** ISO instant of the last completed set, when one is known. */
  lastSetAt?: string | null
  /** The rest the last movement prescribes, in seconds. */
  restTargetSec?: number | null
}

export interface SessionDurationResult {
  /** Whole minutes, for `workout_sessions.duration_min`. Null when the span is
   *  not a real answer — an unparseable instant, or a finish before the start. */
  minutes: number | null
  /** Whole minutes spent paused. */
  pausedMin: number
  /** Dead minutes between the last set and the finish, when the guard fired. */
  idleMin: number | null
  /** True when the long-idle guard shortened the answer. */
  capped: boolean
}

const MIN = 60_000

export function sessionDuration(input: DurationInput): SessionDurationResult {
  const started = Date.parse(input.startedAt)
  const ended = Date.parse(input.endedAt)
  const pausedMs = Number.isFinite(input.pausedMs) ? Math.max(0, input.pausedMs as number) : 0
  const pausedMin = Math.round(pausedMs / MIN)

  if (!Number.isFinite(started) || !Number.isFinite(ended) || ended < started) {
    return { minutes: null, pausedMin, idleMin: null, capped: false }
  }

  // The clock, less the pause. Never negative: a clock that stepped backwards
  // mid-pause must not produce a session of minus twenty minutes.
  const active = Math.max(0, (ended - started - pausedMs) / MIN)

  const lastSet = input.lastSetAt ? Date.parse(input.lastSetAt) : Number.NaN
  if (!Number.isFinite(lastSet) || lastSet < started || lastSet > ended) {
    return { minutes: Math.round(active), pausedMin, idleMin: null, capped: false }
  }

  const idle = (ended - lastSet) / MIN
  if (idle <= LONG_IDLE_MIN) {
    return { minutes: Math.round(active), pausedMin, idleMin: null, capped: false }
  }

  // The work, plus one rest. Only the pause that had CLOSED by the last set is
  // a gap in the work; anything after it is inside the tail being discarded,
  // and taking it off here as well would remove the same minutes twice.
  const restMin = Math.max(0, (input.restTargetSec ?? DEFAULT_REST_TARGET_SEC)) / 60
  const before = Number.isFinite(input.pausedBeforeLastSetMs)
    ? Math.max(0, Math.min(input.pausedBeforeLastSetMs as number, pausedMs))
    : 0
  const worked = Math.max(0, (lastSet - started) / MIN - Math.round(before / MIN))
  return {
    // Never longer than the uncapped answer: the guard may only shorten.
    minutes: Math.round(Math.min(active, worked + restMin)),
    pausedMin,
    idleMin: Math.round(idle),
    capped: true,
  }
}
