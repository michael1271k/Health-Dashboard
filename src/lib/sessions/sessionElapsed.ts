/**
 * How long the workout has been running — PURE. No clock of its own.
 *
 * ── WHY THIS IS DERIVED AND NOT A SECOND STORED TIMER ────────────────────────
 * `sessionClock` already exists and is deliberately not this: it is the REST
 * clock, it is reset between sets, and its whole contract is that it measures
 * one gap. Total session time is a different quantity that happens to be
 * measured in the same unit, and giving it its own persisted stopwatch would
 * mean a second thing to start, a second thing to forget to start, and a second
 * thing to disagree with the truth.
 *
 * The draft already records `startedAt` — the session's own beginning, written
 * once when the deck opens and persisted with the draft. Total elapsed is
 * therefore `now − startedAt`, which needs no state, cannot be forgotten, and is
 * automatically correct across the jetsam-and-reload that iOS performs on a
 * backgrounded WKWebView (see `black-screen-and-reloads`). It is the same
 * argument `sessionClock` makes for persisting a timestamp rather than an
 * elapsed count, applied one level up.
 *
 * ── WHY IT CAN REFUSE TO ANSWER ──────────────────────────────────────────────
 * `startedAt` is NOT always a live wall-clock reading. Logging a session for a
 * past date rewrites its date and keeps the time of day (`useSessionDraft`'s
 * `setDate`), and opening a committed session to edit it seeds `startedAt` from
 * the stored row. In both cases `now − startedAt` is days, and a header offering
 * to fill Duration with `4,317 min` is worse than a header offering nothing.
 *
 * So this returns null outside a plausible range, and every caller renders
 * nothing rather than a number it would have to apologise for. The bound is
 * generous — six hours — because the failure it is guarding against is measured
 * in days, not in a long session.
 */

/** Longer than any real workout, and far shorter than a mis-dated draft. */
export const MAX_SESSION_SEC = 6 * 60 * 60

/**
 * Seconds since the session began, or null when that is not a real answer.
 *
 * Null for: an unparseable timestamp, a session that has not started yet (a
 * clock skew, or a draft dated later today), and anything past the bound.
 */
export function sessionElapsedSec(startedAt: string | null | undefined, now: number): number | null {
  if (!startedAt) return null
  const began = Date.parse(startedAt)
  if (!Number.isFinite(began)) return null
  const sec = Math.floor((now - began) / 1000)
  if (sec < 0 || sec > MAX_SESSION_SEC) return null
  return sec
}

/**
 * The elapsed reading as the whole minutes `duration_min` stores.
 *
 * Rounded, not floored: a 61-minute-40-second session is a 62-minute session,
 * and flooring would systematically under-report every workout by up to a
 * minute for no reason anyone could name.
 *
 * A session under 30 seconds returns null rather than 0. Zero is a real value in
 * that column — it would be stored, and it would then be averaged into the
 * routine's own duration seed — so a deck that was opened and finished
 * immediately must decline to answer rather than assert that the workout took
 * no time.
 */
export function elapsedDurationMin(sec: number | null): number | null {
  if (sec == null) return null
  const min = Math.round(sec / 60)
  return min > 0 ? min : null
}

/**
 * ── THE WORKOUT CAN BE PAUSED, AND THE PAUSE IS TWO NUMBERS ──────────────────
 * A stopwatch that can stop needs to know how long it has been stopped FOR, and
 * whether it is stopped right now. Both are stored on the draft — the same
 * argument `startedAt` makes: a timestamp survives the jetsam-and-reload that
 * iOS performs on a backgrounded WKWebView, an in-memory counter does not.
 *
 *   · `pausedMs` — total time already spent paused, closed pauses only.
 *   · `pausedAt` — when the CURRENT pause began, or null when running.
 *
 * Pausing therefore never touches `startedAt`. The session still began when it
 * began; what changes is how much of the wall clock since then counts. Rewriting
 * `startedAt` on resume would have been the shorter patch and it would have lied
 * to `save.ts`, `eraForDate` and the re-entry PR gate, all of which read that
 * field as the moment the workout started.
 */
export interface SessionPause {
  /** Milliseconds already banked from completed pauses. */
  pausedMs?: number
  /** ISO timestamp of the pause in progress, or null/undefined when running. */
  pausedAt?: string | null
}

/**
 * Milliseconds of `now` that must NOT be counted — banked pauses plus the one
 * currently open. Never negative, and never more than the session itself (a
 * clock change mid-pause must not produce a negative duration).
 */
export function pausedMsAt(pause: SessionPause | null | undefined, now: number): number {
  if (!pause) return 0
  const banked = Number.isFinite(pause.pausedMs) ? Math.max(0, pause.pausedMs as number) : 0
  if (!pause.pausedAt) return banked
  const since = Date.parse(pause.pausedAt)
  if (!Number.isFinite(since)) return banked
  return banked + Math.max(0, now - since)
}

/**
 * Seconds since the session began, MINUS any time it was paused.
 *
 * Same refusals as `sessionElapsedSec` — it is that function with the pause
 * subtracted before the bound is applied, so a six-hour deck that was paused for
 * five of them still answers.
 */
export function sessionActiveSec(
  startedAt: string | null | undefined,
  now: number,
  pause?: SessionPause | null,
): number | null {
  if (!startedAt) return null
  const began = Date.parse(startedAt)
  if (!Number.isFinite(began)) return null
  const raw = now - began
  // The mis-dated-draft guard applies to the WALL clock, before the pause is
  // taken off: a deck opened three days ago is not rescued by having been
  // "paused" for most of it.
  if (raw < 0 || raw / 1000 > MAX_SESSION_SEC) return null
  return Math.max(0, Math.floor((raw - pausedMsAt(pause, now)) / 1000))
}
