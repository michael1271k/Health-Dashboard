/**
 * The Widget/Watch snapshot — a small, read-only view of "right now".
 *
 * WHY A SEPARATE ENDPOINT INSTEAD OF SHARING THE APP'S DATA:
 * a Widget or Watch extension is a separate process in a separate container. The
 * normal way to hand it data is an App Group, but App Groups are a PAID Apple
 * Developer Program capability — on a free personal team Xcode refuses to add
 * one. So the extensions can't read the app's UserDefaults, files, or Keychain,
 * and they can't run Supabase auth either (nowhere to persist a rotating refresh
 * token). They fetch this endpoint themselves with a long-lived opaque token
 * baked into the build.
 *
 * A pleasant side effect: the Watch works standalone over Wi-Fi/LTE with the
 * phone out of range, which a WatchConnectivity mirror can't do.
 *
 * The shape is deliberately flat and tiny — extensions get a few hundred
 * milliseconds and a strict memory budget. Every field is nullable: a widget
 * showing "—" is correct, a widget showing a stale or invented number is not.
 */

export interface WidgetSnapshot {
  /** The user's logical date this snapshot describes. */
  date: string
  generatedAt: string

  /** Drain-only day battery, 0–100. */
  battery: number | null
  /** Composite daily score, 0–100. */
  score: number | null

  sleep: { minutes: number | null; deepMin: number | null; remMin: number | null }
  weight: { kg: number | null; deltaKg: number | null; measuredOn: string | null }

  macros: {
    kcal: number | null; kcalGoal: number | null
    proteinG: number | null; proteinGoalG: number | null
    carbsG: number | null; fatG: number | null
  }
  water: { ml: number | null; goalMl: number | null }
  steps: { count: number | null; goal: number | null; distanceM: number | null; activeKcal: number | null }

  /** Today's scheduled session, and whether it's already logged. */
  workout: { label: string; logged: boolean; isRestDay: boolean }

  /** Week-to-date training totals. */
  week: { sessions: number; volumeKg: number; prs: number; sets: number }
}

/** kcal left against the goal — the small widget's headline. Null if unknown. */
export function caloriesRemaining(s: WidgetSnapshot): number | null {
  const { kcal, kcalGoal } = s.macros
  if (kcal == null || kcalGoal == null) return null
  return Math.round(kcalGoal - kcal)
}
