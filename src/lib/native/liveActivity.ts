'use client'

import { Capacitor, registerPlugin } from '@capacitor/core'

/**
 * The running session on the lock screen and in the Dynamic Island.
 *
 * ── EVERY CALL IS A NO-OP UNLESS IT CAN WORK ─────────────────────────────────
 * Web, Android, iOS < 16.1, and iOS with Live Activities switched off in
 * Settings all take the same path: resolve, do nothing, never throw. A workout
 * must never fail to log because a decoration could not be drawn, so nothing
 * here is on the critical path and nothing here is awaited by a writer.
 *
 * ── THE UPDATE BUDGET IS THE DESIGN CONSTRAINT ───────────────────────────────
 * ActivityKit throttles updates hard. A per-second push to animate a countdown
 * is throttled within moments and the timer visibly freezes, so the countdown
 * is NOT pushed: `restEndsAt` is an absolute epoch-ms instant and the widget
 * renders it with SwiftUI's `Text(timerInterval:)`, which the system animates
 * on its own. One update per rest period buys a timer that ticks for the whole
 * period. Everything in `SessionActivityState` therefore changes at set
 * granularity — roughly two dozen updates across a session — never faster.
 */

export interface SessionActivityState {
  /** The lift you are on. */
  exercise: string
  setsDone: number
  setsPlanned: number
  /** "80kg × 8" — what you just logged, or null before the first set. */
  lastSet?: string | null
  /** Records claimed so far this session, for the gold chip. */
  prCount: number
  /**
   * When the current rest ends, as epoch MILLISECONDS — not a duration.
   *
   * A duration would carry the gap between when JS computed it and when Swift
   * received it straight into the countdown. An instant cannot drift.
   */
  restEndsAt?: number | null
}

interface HelixLiveActivityPlugin {
  isSupported(): Promise<{ supported: boolean }>
  start(options: SessionActivityState & { dayLabel: string }): Promise<{ started: boolean; id?: string; reason?: string }>
  update(options: SessionActivityState): Promise<{ updated: boolean }>
  end(options: SessionActivityState): Promise<{ ended: boolean }>
}

const plugin = registerPlugin<HelixLiveActivityPlugin>('HelixLiveActivity')

/** iOS only, 16.1+, and only while the user leaves Live Activities enabled. */
export async function liveActivitySupported(): Promise<boolean> {
  if (Capacitor.getPlatform() !== 'ios') return false
  try {
    const { supported } = await plugin.isSupported()
    return supported
  } catch { return false }
}

export async function startSessionActivity(dayLabel: string, state: SessionActivityState): Promise<void> {
  if (Capacitor.getPlatform() !== 'ios') return
  try { await plugin.start({ ...state, dayLabel }) } catch { /* non-fatal */ }
}

export async function updateSessionActivity(state: SessionActivityState): Promise<void> {
  if (Capacitor.getPlatform() !== 'ios') return
  try { await plugin.update(state) } catch { /* non-fatal */ }
}

export async function endSessionActivity(state: SessionActivityState): Promise<void> {
  if (Capacitor.getPlatform() !== 'ios') return
  try { await plugin.end(state) } catch { /* non-fatal */ }
}

/**
 * `restEndsAt` for a rest period starting now, or null for "not resting".
 *
 * Kept here rather than at the call site so there is exactly one place that
 * decides the instant, and it is the same one the tests exercise.
 */
export function restEndsAt(seconds: number | null | undefined, now = Date.now()): number | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return null
  return now + seconds * 1000
}

/**
 * The state to publish after a set is ticked.
 *
 * Pure, so the wiring can be tested without a device: everything that decides
 * what appears on the Island is decided here.
 */
export function sessionActivityState(input: {
  exercise: string
  setsDone: number
  setsPlanned: number
  lastSet?: string | null
  prCount: number
  restSeconds?: number | null
  now?: number
}): SessionActivityState {
  return {
    exercise: input.exercise,
    setsDone: input.setsDone,
    setsPlanned: input.setsPlanned,
    lastSet: input.lastSet ?? null,
    prCount: input.prCount,
    restEndsAt: restEndsAt(input.restSeconds, input.now),
  }
}

/** "80kg × 8", or "8 reps" for an unloaded movement. Never "0kg × 8". */
export function formatLastSet(weightKg: number, reps: number, timed = false): string {
  if (timed) return `${reps}s`
  if (!weightKg) return `${reps} reps`
  const w = weightKg % 1 === 0 ? String(weightKg) : weightKg.toFixed(2).replace(/0$/, '')
  return `${w}kg × ${reps}`
}
