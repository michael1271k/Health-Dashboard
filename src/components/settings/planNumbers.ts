/**
 * The three groups of numbers a settings page can write, and why they are three.
 *
 * Extracted from `EditPlanCard` when that 485-line drawer was split into pages.
 * They are shared types rather than a component's props now, which is what they
 * always were: `useSettingsGoals.savePlanNumbers` takes all three, and the card
 * was simply the only caller.
 */

export interface PlanNumbers {
  calorie_goal: number
  protein_goal_g: number
  carbs_goal_g: number
  fat_goal_g: number
  steps_goal: number
}

/**
 * The targets a rung does not govern.
 *
 * Separate from `PlanNumbers` on purpose: `applyLever` replaces exactly the five
 * fields above and returns everything else untouched. Folding these into the
 * same object would invite a future `pick()` to overwrite your sleep target
 * because Lever 2 was selected, which no rung has ever claimed to do.
 */
export interface RecoveryNumbers {
  sleep_goal_hours: number
  active_cal_goal: number
  water_goal_ml: number
}

/**
 * Where the phase is steering — the destination, not the daily dose.
 *
 * ── THESE HAD A SECOND EDITOR, AND IT WROTE DIFFERENTLY ──────────────────────
 * They lived in the plan-preview drawer as three of eight text inputs that
 * committed on blur into `plan_phase_goals`, ~90 lines above a read-only grid
 * restating the same numbers. Meanwhile the five macros beside them existed
 * HERE as well, staged behind a Save. One number, two editors, two write
 * semantics — which is the actual defect the Settings rebuild is fixing, not
 * the untidiness.
 *
 * Nullable throughout: a plan may legitimately have no body-fat or muscle-mass
 * target, and clearing a field must mean "no target", not zero.
 */
export interface BodyTargets {
  target_weight_kg: number | null
  target_body_fat_pct: number | null
  target_muscle_mass_kg: number | null
}
