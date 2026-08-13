/**
 * Daily nutrition phase, derived from the day's calories — current bands:
 *   CUT DAY      ≤ 2,050 kcal
 *   MAINTENANCE  2,051 – 2,449 kcal
 *   BULK         ≥ 2,450 kcal
 * (Re-derive bands manually after any bodyweight change > 2 kg.)
 * Computed at write time and stored on nutrition_entries.phase (the DB is the
 * source of truth), with this function as a client-side fallback for old rows.
 */
import { HELIX_CUT_START } from '@/lib/programs'
import { EMBER, STEEL, EMERALD } from '@/lib/theme/palette'
import { isExceptionDay } from '@/lib/nutrition/exceptionDay'

export type Phase = 'cut' | 'maintenance' | 'bulk'

export function derivePhase(calories: number | null | undefined): Phase | null {
  if (calories == null || !Number.isFinite(calories) || calories <= 0) return null
  if (calories <= 2050) return 'cut'
  if (calories < 2450) return 'maintenance'
  return 'bulk'
}

/** What a day needs to know about itself before it can name its phase. */
export interface DayPhaseInput {
  calories: number | null | undefined
  /** `daily_logs.nutrition_exception` — a reason string, or null for an ordinary day. */
  exception?: string | null
  /** `daily_logs.nutrition_estimated`. */
  estimated?: boolean | null
  /** The phase the Era is actually IN — `user_goals.goal_preset` / `activePhase()`. */
  activePhase?: Phase | null
  /**
   * The value already on `nutrition_entries.phase`, when there is one.
   *
   * Readers pass it; writers do not. It is a CACHE of this function's own answer
   * from write time, so it wins for an ordinary day (cheap, and it preserves any
   * historical banding) but never for a flagged one — rows written before this
   * rule existed carry exactly the misclassification being corrected.
   */
  stored?: Phase | null
}

/**
 * The day's phase, WITHOUT letting one meal rewrite the block you are in.
 *
 * `derivePhase` reads a phase off the calorie total alone, which is right for an
 * ordinary day and wrong for a declared one. 2026-08-11 was a date night: 2,150
 * kcal, flagged `Social` and `Estimated`, in week four of a strict cut. The
 * threshold saw 2,050 < 2,150 < 2,450 and stamped `maintenance`, so the history
 * page filed a cut day under a phase that had not started and will not start for
 * months. The phase is a property of the BLOCK, not of one evening's intake.
 *
 * So a flagged day — Exception or Estimated, either one — keeps the active
 * phase. Both flags qualify: an Exception says the deviation was allowed, an
 * Estimated says the number is a guess, and neither is evidence that the
 * programme changed. Reclassifying on a guess is the worse of the two.
 *
 * NOTHING NUMERIC CHANGES. This is a label, not a term in any score — an
 * exception day is still graded on protein alone, still counted whole in the
 * week's average intake, the TDEE deficit and the weight trend. See the rule in
 * `exceptionDay.ts`: forgive the grade, never the arithmetic. Phase was never
 * part of the arithmetic, which is exactly why it can be held steady here.
 *
 * Falls back to the derived value when the active phase is unknown, so a caller
 * that cannot resolve it is no worse off than before.
 */
export function resolveDayPhase(input: DayPhaseInput): Phase | null {
  const fallback = input.stored ?? derivePhase(input.calories)
  const flagged = isExceptionDay(input.exception) || input.estimated === true
  if (!flagged) return fallback
  return input.activePhase ?? fallback
}

// GLOBAL phase colours — standardized across dashboard, settings, day chips and
// analytics, independent of the active plan: Cut is always red/orange, Bulk always
// green, Maintenance steel. Import PHASE_COLORS anywhere a phase needs a colour.
export const PHASE_COLORS: Record<Phase, string> = {
  cut:         EMBER,   // deficit — the signature. Was a hand-typed #E0653C:
  maintenance: STEEL,   //   a fourth near-copy of ember, eleven units of green
  bulk:        EMERALD, //   off the real one, in a file nobody thought to check.
}

export const PHASE_META: Record<Phase, { label: string; color: string }> = {
  cut:         { label: 'Cut',   color: PHASE_COLORS.cut },
  maintenance: { label: 'Maint', color: PHASE_COLORS.maintenance },
  bulk:        { label: 'Bulk',  color: PHASE_COLORS.bulk },
}

/**
 * Era-aware phase tag: cut days on/after HELIX_CUT_START (2026-07-15) belong to
 * the Helix Cut block and are labeled accordingly; everything earlier keeps
 * the plain PHASE_META label. Use this wherever a per-day phase chip renders.
 */
export function phaseDisplay(phase: Phase, dateISO: string): { label: string; color: string } {
  const meta = PHASE_META[phase]
  if (phase === 'cut' && dateISO >= HELIX_CUT_START) return { ...meta, label: 'Cut' }
  return meta
}
