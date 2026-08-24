/**
 * The rest clock — one running timer for the whole app.
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
 * A clock older than `STALE_AFTER_MS` is discarded on read rather than restored
 * — coming back to the app tomorrow should not present a nine-hour rest.
 */

export interface RestClock {
  /** Epoch ms the rest started, or null when the clock is not running. */
  startedAt: number | null
  /** What this rest is aiming at, in seconds. The countdown counts to this. */
  targetSec: number
}

export const REST_CLOCK_KEY = 'helix_rest_clock'
export const REST_CLOCK_EVENT = 'helix-rest-clock-change'

/** Longer than any real rest. A clock this old was left running by accident. */
const STALE_AFTER_MS = 60 * 60 * 1000

const IDLE: RestClock = { startedAt: null, targetSec: 90 }

/**
 * Referentially stable snapshot.
 *
 * `useSyncExternalStore` compares by identity, so parsing JSON on every call
 * would report a change on every render and re-render forever — the same hang
 * `draftStore` documents. The parsed value is cached and only replaced when the
 * serialised form actually differs.
 */
let cachedRaw: string | null = null
let cached: RestClock = IDLE

function parse(raw: string | null): RestClock {
  if (!raw) return IDLE
  try {
    const v = JSON.parse(raw) as Partial<RestClock>
    const startedAt = typeof v.startedAt === 'number' && Number.isFinite(v.startedAt) ? v.startedAt : null
    const targetSec = typeof v.targetSec === 'number' && Number.isFinite(v.targetSec) ? v.targetSec : IDLE.targetSec
    return { startedAt, targetSec }
  } catch {
    return IDLE
  }
}

const isStale = (c: RestClock, now: number): boolean =>
  c.startedAt != null && now - c.startedAt > STALE_AFTER_MS

export function getRestClock(): RestClock {
  if (typeof window === 'undefined') return IDLE
  const raw = window.localStorage.getItem(REST_CLOCK_KEY)
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
  if (isStale(cached, Date.now())) cached = { startedAt: null, targetSec: cached.targetSec }
  return cached
}

/** Never running on the server, so the first client render matches the markup. */
export function getRestClockServerSnapshot(): RestClock {
  return IDLE
}

export function subscribeRestClock(onChange: () => void): () => void {
  window.addEventListener(REST_CLOCK_EVENT, onChange)
  // `storage` fires only in OTHER tabs — the case the custom event cannot cover.
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(REST_CLOCK_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

function write(next: RestClock): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(REST_CLOCK_KEY, JSON.stringify(next))
  window.dispatchEvent(new Event(REST_CLOCK_EVENT))
}

/** Start (or restart) the clock. Restarting is the common case: set, rest, set. */
export function startRest(targetSec?: number): void {
  write({ startedAt: Date.now(), targetSec: targetSec ?? getRestClock().targetSec })
}

/** Stop it, keeping the target for the next rest. */
export function stopRest(): void {
  write({ startedAt: null, targetSec: getRestClock().targetSec })
}

/** Change what the rest is aiming at, running or not. */
export function setRestTargetSec(targetSec: number): void {
  write({ ...getRestClock(), targetSec })
}

/** Whole seconds since the clock started; 0 when it is not running. */
export function restElapsedSec(clock: RestClock, now: number): number {
  if (clock.startedAt == null) return 0
  return Math.max(0, Math.floor((now - clock.startedAt) / 1000))
}

/**
 * "1:30", "0:45", "12:04". Always m:ss — a rest is never expressed in hours, and
 * a fixed shape is what stops the header re-flowing every ten seconds.
 */
export function formatClock(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
