'use client'

import { useRouter } from 'next/navigation'
import { Target } from 'lucide-react'
import { BackLink } from '@/components/nav/NavChevron'
import { Zone } from '@/components/ui/Zone'
import { NumberRow } from '@/components/settings/NumberRow'
import { EMBER, STEEL } from '@/lib/theme/palette'
import { useSettingsGoals } from '@/lib/hooks/useSettingsGoals'
import { atwaterKcal } from '@/lib/nutrition/levers'

/**
 * Daily targets — the numbers every ring in the app is drawn against.
 *
 * ── WHY THIS IS A PAGE AND NOT A SHEET ───────────────────────────────────────
 * It used to be `EditPlanCard`: 485 lines behind one drawer, carrying five
 * macros, the deficit rungs, the release, three recovery figures and three body
 * targets at once, with a Save button at the bottom. Two rows on the Settings
 * page ("Daily targets" and "Deficit lever") opened the same drawer, which is
 * the tell — they were two names for one undifferentiated pile.
 *
 * They are separate concerns and they are separate pages now: a rung REPLACES
 * these five numbers wholesale, so choosing one and typing one are different
 * acts and putting them side by side made every edit look like it might be
 * either.
 *
 * ── AND IT SAVES AS YOU GO ───────────────────────────────────────────────────
 * The old Save button existed because these numbers are what today is GRADED
 * against, so committing one re-scores the day. That is an argument against
 * writing on every keystroke, not against writing at all — see `NumberRow`,
 * which commits on blur behind a 600 ms debounce.
 */
export default function TargetsPage() {
  const router = useRouter()
  const { goals, loading, saving, status, save, savePlanNumbers, activeLever, leverInForce } = useSettingsGoals()

  if (loading) return <p className="text-muted text-sm">Loading…</p>

  /** Write the five lever-governed numbers, and select `custom` by doing so. */
  const commitPlan = (patch: Partial<typeof goals>) => {
    const next = { ...goals, ...patch }
    void savePlanNumbers(
      {
        calorie_goal: next.calorie_goal,
        protein_goal_g: next.protein_goal_g,
        carbs_goal_g: next.carbs_goal_g,
        fat_goal_g: next.fat_goal_g,
        steps_goal: next.steps_goal,
      },
      {
        sleep_goal_hours: next.sleep_goal_hours,
        active_cal_goal: next.active_cal_goal,
        water_goal_ml: next.water_goal_ml,
      },
      // Typing your own numbers IS a selection — `custom` names it. Leaving the
      // rung selected while the figures no longer match it would make the app
      // claim a target it is not grading against.
      'custom',
      // No fourth argument: this page has no opinion about where the phase is
      // steering, and passing nulls to say so would CLEAR the body targets.
    )
  }

  const atwater = atwaterKcal(goals.protein_goal_g, goals.carbs_goal_g, goals.fat_goal_g)
  const gap = goals.calorie_goal - atwater

  return (
    <div data-boxed className="space-y-4">
      <header className="flex items-center gap-3">
        <BackLink onClick={() => router.back()} />
        <div className="min-w-0">
          <h1 className="font-heading text-fluid-lg font-bold text-text flex items-center gap-2">
            <Target className="w-4 h-4" style={{ color: EMBER }} aria-hidden="true" /> Daily targets
          </h1>
          <p className="text-fluid-xs text-muted">What every ring in the app is drawn against</p>
        </div>
      </header>

      <Zone label="Food" accent={EMBER}>
        <NumberRow label="Calories" unit="kcal" step={5} value={goals.calorie_goal}
          onCommit={(v) => v != null && commitPlan({ calorie_goal: v })} />
        <NumberRow label="Protein" unit="g" value={goals.protein_goal_g}
          onCommit={(v) => v != null && commitPlan({ protein_goal_g: v })} />
        <NumberRow label="Carbohydrate" unit="g" value={goals.carbs_goal_g}
          onCommit={(v) => v != null && commitPlan({ carbs_goal_g: v })} />
        <NumberRow label="Fat" unit="g" value={goals.fat_goal_g}
          onCommit={(v) => v != null && commitPlan({ fat_goal_g: v })} />
      </Zone>

      {/* The one piece of arithmetic worth stating out loud. `levers.ts` has been
          burned twice by a calorie literal sitting beside macros that summed to
          something else — 1950 vs 1955, and 2450 vs 2445 — so a target that
          disagrees with itself says so here rather than in a code comment. */}
      {Math.abs(gap) >= 5 && (
        <p className="px-1 text-[11px] text-muted leading-snug">
          Those macros are{' '}
          <span className="helix-num text-text">{atwater.toLocaleString()} kcal</span>{' '}
          by Atwater (4/4/9) — {gap > 0 ? `${gap} more` : `${Math.abs(gap)} fewer`} than the
          calorie figure above.
        </p>
      )}

      <Zone label="Movement" accent={EMBER}>
        <NumberRow label="Steps" unit="steps" step={500} value={goals.steps_goal}
          onCommit={(v) => v != null && commitPlan({ steps_goal: v })} />
        <NumberRow label="Active energy" unit="kcal" step={50} value={goals.active_cal_goal}
          onCommit={(v) => v != null && commitPlan({ active_cal_goal: v })} />
      </Zone>

      <Zone label="Recovery" accent={STEEL}>
        <NumberRow label="Sleep" unit="h" step={0.25} value={goals.sleep_goal_hours}
          onCommit={(v) => v != null && save({ sleep_goal_hours: v })} />
        <NumberRow label="Water" unit="ml" step={100} value={goals.water_goal_ml}
          onCommit={(v) => v != null && save({ water_goal_ml: v })} />
      </Zone>

      {/* The rung is elsewhere, and this says where — a number that was replaced
          by a lever needs to name the lever, or editing it here reads as broken. */}
      {leverInForce && leverInForce !== 'custom' && activeLever !== 'custom' && (
        <p className="px-1 text-[11px] text-muted leading-snug">
          A rung is in force today, so these figures are being overridden. Changing
          one here switches you back to your own numbers.
        </p>
      )}

      {status && (
        <p className={`text-sm px-1 ${status.type === 'success' ? 'text-success' : 'text-danger'}`}>{status.msg}</p>
      )}
      {saving && <p className="text-xs text-muted px-1">Saving…</p>}
    </div>
  )
}
