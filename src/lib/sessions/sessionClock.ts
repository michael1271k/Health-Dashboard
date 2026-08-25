/**
 * The session clock — one running timer for the whole app, in two modes.
 *
 * ── WHY A MODULE STORE AND NOT COMPONENT STATE ───────────────────────────────
 * Rest happens between sets, which is exactly when you are most likely to leave
 * the deck: the pill exists because people go and look at last week's numbers
 * mid-workout. A timer held in `SessionDeck` would be discarded by that
 * navigation and would restart at zero when you came back, which is the one
 * thing a rest timer may never do. This is read through `useSyncExternalStore`,
 * like the draft itself, so any surface can show it and none of them own it.
 *
 * ── AND WHY THE START TIME IS PERSISTED, NOT THE ELAPSED ─────────────────────
 * iOS jetsams a backgrounded WKWebView's content process without warning and
 * Capacitor reloads the page (see `black-screen-and-reloads`). A stored
 * *elapsed* count would freeze at whatever it read the instant before the kill
 * and resume from there, silently under-reporting the rest by however long the
 * app was gone. A stored *timestamp* cannot: elapsed is always derived from the
 * wall clock, so a timer that survived a reload is still correct, and one that
 * ran while the screen was off is correct too.
 *
 * ── TWO MODES, ONE CLOCK ─────────────────────────────────────────────────────
 * This was a count-UP rest clock with a target, and its own header argued
 * against ever counting down: a countdown that hits zero has to decide what to
 * do next, and every answer is wrong when the thing being measured is REST,
 * which is a measurement rather than a deadline.
 *
 * That argument is still right, and it is an argument about rest, not about
 * clocks. So the count-up became the STOPWATCH — same semantics, no target to
 * lie about — and the countdown became a TIMER you set deliberately, where zero
 * means the thing you asked for has happened and the display saying `Done` is
 * the correct answer rather than a lie. Rest as a prescription lives where it
 * always did: `ProgramExercise.restSec`, edited on the exercise card.
 *
 * Only one runs at a time, because there is one of you and one workout. The
 * mode is part of the persisted state so the sheet reopens on the tab you left
 * it on — and so the header button knows which number it is showing.
 *
 * ── PAUSE IS ACCUMULATED, NOT RE-BASED ───────────────────────────────────────
 * Apple's Stopwatch resumes rather than restarts, which means a run is a SUM of
 * segments. `elapsedMs` is therefore `accumulatedMs` plus the segment currently
 * open, and pausing folds the open segment into the accumulator and clears
 * `startedAt`. That keeps the wall-clock guarantee above intact for each
 * segment, which a single re-based start timestamp could not: re-basing loses
 * the paused portion the first time the webview is killed mid-pause.
 *
 * A clock older than `STALE_AFTER_MS` is discarded on read rather than restored
 * — coming back to the app tomorrow should not present a nine-hour rest.
 */

export type ClockMode = 'timer' | 'stopwatch'

export interface SessionClock {
  /** Which tab the sheet opens on, and which reading the header button shows. */
  mode: ClockMode
  /** Epoch ms the OPEN segment began, or null when idle or paused. */
  startedAt: number | null
  /** Milliseconds banked by segments that have already been paused. */
  accumulatedMs: number
  /** How long the countdown runs for, in seconds. Survives a reset. */
  durationSec: number
}

export const CLOCK_KEY = 'helix_session_clock'
export const CLOCK_EVENT = 'helix-session-clock-change'

/** The timer's default, and the step its two buttons move it by. */
export const DEFAULT_DURATION_SEC = 60
export const DURATION_STEP_SEC = 15
/** A countdown shorter than one step cannot be stepped down; an hour is plenty. */
export const MIN_DURATION_SEC = 15
export const MAX_DURATION_SEC = 60 * 60

/** Longer than any real rest. A clock this old was left running by accident. */
const STALE_AFTER_MS = 60 * 60 * 1000

const IDLE: SessionClock = {
  mode: 'timer', startedAt: null, accumulatedMs: 0, durationSec: DEFAULT_DURATION_SEC,
}

/**
 * Referentially stable snapshot.
 *
 * `useSyncExternalStore` compares by identity, so parsing JSON on every call
 * would report a change on every render and re-render forever — the same hang
 * `draftStore` documents. The parsed value is cached and only replaced when the
 * serialised form actually differs.
 */
let cachedRaw: string | null = null
let cached: SessionClock = IDLE

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

function parse(raw: string | null): SessionClock {
  if (!raw) return IDLE
  try {
    const v = JSON.parse(raw) as Partial<SessionClock> & { targetSec?: number }
    return {
      mode: v.mode === 'stopwatch' ? 'stopwatch' : 'timer',
      startedAt: typeof v.startedAt === 'number' && Number.isFinite(v.startedAt) ? v.startedAt : null,
      accumulatedMs: Math.max(0, num(v.accumulatedMs, 0)),
      // `targetSec` is the v1 field name — a phone mid-cut has one of these in
      // localStorage right now, and its rest target is the closest thing it has
      // to a chosen duration. Read it once rather than resetting the user to 60.
      durationSec: clampDuration(num(v.durationSec, num(v.targetSec, DEFAULT_DURATION_SEC))),
    }
  } catch {
    return IDLE
  }
}

export function clampDuration(sec: number): number {
  return Math.min(MAX_DURATION_SEC, Math.max(MIN_DURATION_SEC, Math.round(sec)))
}

const isStale = (c: SessionClock, now: number): boolean =>
  c.startedAt != null && now - c.startedAt > STALE_AFTER_MS

export function getSessionClock(): SessionClock {
  if (typeof window === 'undefined') return IDLE
  const raw = window.localStorage.getItem(CLOCK_KEY)
  if (raw !== cachedRaw) {
    cachedRaw = raw
    cached = parse(raw)
  }
  /**
   * Staleness is decided HERE, not in `parse`. Deciding it at parse time meant
   * it was decided once, when the row was first read — so a clock started
   * before you put the phone down went on reporting itself as running for as
   * long as the tab stayed alive, however many hours later you came back. The
   * stored row has not changed, so the cache is right to keep it; what changed
   * is the wall clock, and that has to be re-read every call.
   *
   * The stopped value is cached in place, so identity stays stable for
   * `useSyncExternalStore` once the transition has happened.
   */
  if (isStale(cached, Date.now())) cached = { ...cached, startedAt: null, accumulatedMs: 0 }
  return cached
}

/** Never running on the server, so the first client render matches the markup. */
export function getSessionClockServerSnapshot(): SessionClock {
  return IDLE
}

export function subscribeSessionClock(onChange: () => void): () => void {
  window.addEventListener(CLOCK_EVENT, onChange)
  // `storage` fires only in OTHER tabs — the case the custom event cannot cover.
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(CLOCK_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

function write(next: SessionClock): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(CLOCK_KEY, JSON.stringify(next))
  window.dispatchEvent(new Event(CLOCK_EVENT))
}

/**
 * Switch tabs.
 *
 * The running clock is STOPPED by a mode change rather than carried across.
 * Carrying it would mean a countdown you started becoming a stopwatch reading
 * mid-flight, which is not a thing a clock is allowed to do; and leaving both
 * running would put two numbers behind one header button.
 */
export function setClockMode(mode: ClockMode): void {
  const c = getSessionClock()
  if (c.mode === mode) return
  write({ ...c, mode, startedAt: null, accumulatedMs: 0 })
}

/** Begin, or resume after a pause. Idempotent while already running. */
export function startClock(mode?: ClockMode): void {
  const c = getSessionClock()
  const next = mode ?? c.mode
  if (next !== c.mode) { write({ ...c, mode: next, startedAt: Date.now(), accumulatedMs: 0 }); return }
  if (c.startedAt != null) return
  write({ ...c, startedAt: Date.now() })
}

/** Fold the open segment into the accumulator and hold. The reading survives. */
export function pauseClock(now = Date.now()): void {
  const c = getSessionClock()
  if (c.startedAt == null) return
  write({ ...c, startedAt: null, accumulatedMs: c.accumulatedMs + Math.max(0, now - c.startedAt) })
}

/** Back to zero, keeping the mode and the chosen duration. */
export function resetClock(): void {
  write({ ...getSessionClock(), startedAt: null, accumulatedMs: 0 })
}

/** Restart from zero and run. What the next set means: you do not stop a rest. */
export function restartClock(): void {
  write({ ...getSessionClock(), startedAt: Date.now(), accumulatedMs: 0 })
}

/** Change the countdown's length. Resets a countdown that is mid-flight. */
export function setDurationSec(sec: number): void {
  const c = getSessionClock()
  write({ ...c, durationSec: clampDuration(sec), startedAt: null, accumulatedMs: 0 })
}

/** Milliseconds run so far — banked segments plus the one currently open. */
export function elapsedMs(clock: SessionClock, now: number): number {
  const open = clock.startedAt == null ? 0 : Math.max(0, now - clock.startedAt)
  return clock.accumulatedMs + open
}

/** Whole seconds run so far. */
export function elapsedSec(clock: SessionClock, now: number): number {
  return Math.floor(elapsedMs(clock, now) / 1000)
}

/**
 * Seconds left on the countdown, floored at zero.
 *
 * Rounded UP, so a timer set to 1:00 reads `1:00` for the whole of its first
 * second rather than dropping to `0:59` the instant you start it — the way
 * every countdown anyone has ever used behaves, and the difference between a
 * control that feels responsive and one that feels like it lost a second.
 */
export function remainingSec(clock: SessionClock, now: number): number {
  return Math.max(0, clock.durationSec - Math.floor(elapsedMs(clock, now) / 1000))
}

/** The countdown has run out. Never true for a stopwatch. */
export function isTimerDone(clock: SessionClock, now: number): boolean {
  return clock.mode === 'timer' && elapsedMs(clock, now) >= clock.durationSec * 1000
}

/**
 * What the header button shows: the countdown's remainder, or the stopwatch's
 * elapsed. One function so the button and the sheet can never disagree.
 */
export function clockReadingSec(clock: SessionClock, now: number): number {
  return clock.mode === 'timer' ? remainingSec(clock, now) : elapsedSec(clock, now)
}

/** Is there anything on the clock — running, or paused with a reading? */
export function clockIsLive(clock: SessionClock): boolean {
  return clock.startedAt != null || clock.accumulatedMs > 0
}

/**
 * "1:30", "0:45", "12:04", "1:02:03". Always at least m:ss — a fixed shape is
 * what stops the header re-flowing every ten seconds — and hours only when
 * there are hours, which on a stopwatch left running there can be.
 */
export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
    : `${m}:${String(r).padStart(2, '0')}`
}
