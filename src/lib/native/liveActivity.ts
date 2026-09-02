'use client'

import { Capacitor, registerPlugin } from '@capacitor/core'

/**
 * The running workout on the Lock Screen and in the Dynamic Island.
 *
 * ── WHY THIS ONE IS PUSHED AND THE HOME-SCREEN WIDGETS ARE NOT ───────────────
 * `widgets.ts` can do exactly two things: make the server's answer fresher and
 * ask WidgetKit to re-fetch it. It cannot hand the extension data, because App
 * Groups are a paid Apple Developer Program capability and this is a free
 * personal team — the constraint is written out in `ios/App/Shared/HelixSnapshot.swift`.
 *
 * A Live Activity is exempt. Its content travels through ActivityKit's own IPC
 * from `Activity.update` in the app to the extension's view body, with no shared
 * container on the path. So the one thing in this app that changes by the second
 * is the one thing that can be pushed directly.
 *
 * On the web this `registerPlugin` proxy is inert and every entry point is
 * guarded by `Capacitor.isNativePlatform()`, so the web bundle ships no native
 * code and a browser session starts nothing.
 */
export interface WorkoutActivityState {
  /** The movement you are walking towards. */
  exercise: string
  /** Already composed: "Set 3 of 4". */
  setLabel: string
  /**
   * What you did on THIS set number last time, formatted WITH its unit —
   * "3.75 kg × 16". Empty when the movement is new or last time had fewer sets.
   *
   * Formatted here rather than in Swift on purpose: `3.75` must not render as
   * `3.8` (quarter-step plates are real loads), and that rule already exists
   * once, in `SetEditorRow`. A second implementation in Swift is a second thing
   * that can disagree with it.
   */
  lastTime: string
  /** Last time's effort on that set: "RPE 10". Empty when it was never rated. */
  lastRpe: string
  /**
   * THIS set's load — "32.5 kg × 10". The Lock Screen leads with it.
   *
   * `lastTime` used to be the largest thing on the card while the set you were
   * standing in front of went unnamed. History is context for a decision, not
   * the decision.
   */
  load: string
  /** THIS set's effort: "RPE 8". Empty until it is rated. */
  rpe: string
  volume: string
  sets: string
  records: number
  /**
   * Cumulative session tonnage after each completed set, oldest first — the
   * mini graph on the Lock Screen and the expanded Island.
   *
   * Capped at 12 points by the producer. ActivityKit budgets updates by payload
   * as well as by frequency, and a chart that grows without bound would spend
   * more of that budget the longer the session ran, which is exactly backwards.
   * Twelve is enough to show a shape; the number beside it is the real value.
   */
  spark: number[]
  /** `dayColor()` as an integer — `0xRRGGBB`. */
  accent: number
}

interface StartOptions extends WorkoutActivityState {
  title: string
  /** `Date.now()` — milliseconds. The Island counts the duration from it. */
  startedAt: number
}

interface LiveActivityPlugin {
  isSupported(): Promise<{ supported: boolean }>
  start(opts: StartOptions): Promise<{ started: boolean; id?: string; reason?: string }>
  update(opts: WorkoutActivityState): Promise<{ updated: boolean }>
  end(): Promise<{ ended: boolean }>
}

const Native = registerPlugin<LiveActivityPlugin>('HelixLiveActivity')

/** `#E0703C` → `0xE0703C`. Falls back to EMBER on anything unparseable. */
export function hexToInt(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  return m ? parseInt(m[1], 16) : 0xe0703c
}

/**
 * Whether it is worth calling anything else here.
 *
 * Three separate reasons this is false — the OS predates ActivityKit, the device
 * has no Lock Screen surface for it, or the user switched Live Activities off
 * for Helix in Settings — and the caller needs none of them. All three mean the
 * same thing: do not try, and do not treat not trying as a failure.
 */
export async function liveActivitySupported(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  try {
    return (await Native.isSupported()).supported
  } catch {
    return false
  }
}

/**
 * The last thing `start` was told, in words.
 *
 * ── WHY A BREADCRUMB EXISTS FOR A FEATURE THAT SWALLOWS ITS ERRORS ───────────
 * Every entry point here is deliberately silent: a rejected promise mid-workout
 * that surfaced as a console error — or worse, an error boundary — would cost
 * more than a Lock Screen card is worth. The cost of that decision is that a
 * card which never appears is indistinguishable, from the outside, from a card
 * that was never asked for.
 *
 * There are five real reasons `start` resolves without a card, and they need
 * completely different fixes: the build on the phone predates the plugin, the OS
 * is below 18 (the `ActivityConfiguration` is gated — see `HelixWidgets.swift`),
 * Live Activities are switched off for Helix in Settings, ActivityKit refused
 * the request, or the web layer never called at all. This writes which, exactly
 * where `helix_last_crash` already lives, so the question is answerable from the
 * device without a cable.
 */
const DIAGNOSTIC_KEY = 'helix_live_activity'

function note(reason: string): void {
  try {
    localStorage.setItem(DIAGNOSTIC_KEY, JSON.stringify({ reason, at: new Date().toISOString() }))
  } catch { /* storage full or unavailable — the card matters more than the note */ }
}

/**
 * Begin (or restart) the activity for a session.
 *
 * Starting while one is already running is a RESTART on the Swift side, not a
 * second card, because this is called on deck mount and mount happens again
 * after every jetsam-and-reload — see `black-screen-and-reloads`.
 *
 * Every function here swallows its own errors. A Lock Screen card is a courtesy;
 * a rejected promise mid-workout that surfaced as a console error, or worse an
 * error boundary, would cost more than the card is worth. What it does NOT
 * swallow any more is the REASON — see `note`.
 */
export async function startWorkoutActivity(opts: StartOptions): Promise<void> {
  if (!Capacitor.isNativePlatform()) { note('web'); return }
  try {
    const r = await Native.start(opts)
    note(r?.started ? 'started' : `refused: ${r?.reason ?? 'unknown'}`)
  } catch (e) {
    // The plugin is not on the bridge at all — an install that predates
    // `HelixLiveActivityPlugin`, which no amount of web deploying can fix.
    note(`unavailable: ${e instanceof Error ? e.message : String(e)}`)
  }
}

export async function updateWorkoutActivity(state: WorkoutActivityState): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try { await Native.update(state) } catch { /* a card is a courtesy */ }
}

/**
 * Take it down.
 *
 * Called on commit AND on discard, and dismissed immediately rather than under
 * the default policy — which lingers for up to four hours and would leave a card
 * offering the "next set" of a session that no longer exists.
 */
export async function endWorkoutActivity(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try { await Native.end() } catch { /* a card is a courtesy */ }
}
