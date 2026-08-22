'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, RotateCcw } from 'lucide-react'
import { Surface } from '@/components/ui/Zone'
import { LEVERS, atwaterKcal, type LeverId } from '@/lib/nutrition/levers'
import { EMERALD, GOLD, MUTED, OXIDE } from '@/lib/theme/palette'

/**
 * Cut Levers — the one place in Settings with a Save button, and the reason it
 * has one.
 *
 * ── IT USED TO BE CALLED "EDIT PLAN" ─────────────────────────────────────────
 * Which is what the card does and not what it IS. "Plan" already means three
 * other things on this page — the training plan, the plan's phase, the plan's
 * per-phase macro overrides — so a card headed "Edit Plan" sitting above a
 * section headed "Plans" read as the editor for that section. It is not: it is
 * the rung of the cut, which is the one dial on this page that regrades a day.
 * The rungs are literally called levers everywhere else in the code.
 *
 * ── WHY THIS DOES NOT AUTO-SAVE ──────────────────────────────────────────────
 * Everything else on this page commits on blur, which is right for a toggle and
 * wrong for these five numbers: changing your calorie goal RETROACTIVELY
 * REGRADES today. Tab out of a half-typed "18" on the way to "1885" and the day
 * is briefly scored against an 18 kcal target, the widget reloads, and the score
 * you see at lunch is not the score the day ends with. A staged edit with an
 * explicit commit is the difference between "I am adjusting my plan" and "I
 * touched a field".
 *
 * ── LEVERS AND CUSTOM ARE THE SAME CONTROL ───────────────────────────────────
 * Picking a rung fills the fields; typing in a field selects Custom. There is no
 * hidden state where the pills say Lever 1 and the numbers say something else —
 * the selection always describes what is in the inputs.
 *
 * ── IT IS NOW THE ONLY TARGETS EDITOR (2026-08-22) ───────────────────────────
 * Settings used to carry three cards that overlapped: this one, "Nutrition
 * Goals" (the same four macros) and "Activity & Recovery Goals" (the same step
 * goal, plus sleep, active calories and water). The duplication was not merely
 * untidy — the two copies disagreed about how to WRITE.
 *
 * This card stages behind a Save button because these numbers regrade the day.
 * The other two committed on blur, and "Activity & Recovery" wrote `steps_goal`
 * into `user_goals` while touching neither `active_lever` nor
 * `plan_phase_goals` — so editing your step target there left this card showing
 * a rung whose step figure the row no longer held. One editor, one write path,
 * one answer.
 *
 * Sleep, active calories and water came across with it. They are NOT lever
 * fields — `LeverGoals` covers calories, the three macros and steps, and nothing
 * else — so picking a rung deliberately leaves them alone. They are staged and
 * saved alongside because they belong to the same decision, not because a rung
 * has an opinion about them.
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

export function EditPlanCard({
  current, recovery, activeLever, planLabel, phaseLabel, phaseBadge, saving, onSave,
}: {
  current: PlanNumbers
  recovery: RecoveryNumbers
  /** The derived-phase chip, rendered by the page that knows the phase rules. */
  phaseBadge?: React.ReactNode
  /**
   * The rung IN FORCE — the stored `user_goals.active_lever` when there is one,
   * else the one `LEVER_SCHEDULE` puts on today. The schedule fallback matters:
   * without it this card claims "Custom" on a database that never ran the
   * `active_lever` DDL while every ring in the app is grading against Lever 1.
   */
  activeLever: LeverId | null
  /** The plan + phase a save writes onto, named so the button is not a mystery. */
  planLabel?: string
  phaseLabel?: string
  saving: boolean
  onSave: (next: PlanNumbers, rec: RecoveryNumbers, lever: LeverId) => void | Promise<void>
}) {
  // The fields SHOW the rung in force, not whatever `user_goals` happens to
  // hold. A rung that arrived from the schedule has never been written to that
  // row, so seeding from the row alone would print 1,955 under a Lever 1 pill.
  const inForce = LEVERS.find((l) => l.id === activeLever)
  const seedNumbers: PlanNumbers = inForce
    ? {
      calorie_goal: inForce.calorieGoal,
      protein_goal_g: inForce.proteinGoalG,
      carbs_goal_g: inForce.carbsGoalG,
      fat_goal_g: inForce.fatGoalG,
      steps_goal: inForce.stepsGoal,
    }
    : current
  const [draft, setDraft] = useState<PlanNumbers>(seedNumbers)
  const [rec, setRec] = useState<RecoveryNumbers>(recovery)
  const [lever, setLever] = useState<LeverId>(activeLever ?? 'custom')

  // Re-seed when the row finally lands (or another device changes it) — but only
  // while the form is CLEAN, or a slow query would wipe an edit in progress.
  const currentKey = JSON.stringify(seedNumbers)
  const recKey = JSON.stringify(recovery)
  const dirty = useMemo(
    () => JSON.stringify(draft) !== currentKey
      || JSON.stringify(rec) !== recKey
      || lever !== (activeLever ?? 'custom'),
    [draft, currentKey, rec, recKey, lever, activeLever],
  )
  const dirtyRef = dirty
  useEffect(() => {
    if (dirtyRef) return
    setDraft(JSON.parse(currentKey) as PlanNumbers)
    setRec(JSON.parse(recKey) as RecoveryNumbers)
    setLever(activeLever ?? 'custom')
    // `dirtyRef` deliberately excluded: this must react to the ROW changing, not
    // to the form becoming dirty (which would re-seed away the user's typing).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey, recKey, activeLever])

  const pick = (id: LeverId) => {
    const rung = LEVERS.find((l) => l.id === id)
    setLever(id)
    if (!rung) return
    setDraft({
      calorie_goal: rung.calorieGoal,
      protein_goal_g: rung.proteinGoalG,
      carbs_goal_g: rung.carbsGoalG,
      fat_goal_g: rung.fatGoalG,
      steps_goal: rung.stepsGoal,
    })
  }

  const edit = (key: keyof PlanNumbers, value: number) => {
    setDraft((d) => ({ ...d, [key]: value }))
    // Typing is choosing Custom. The pills must never claim a rung the numbers
    // no longer match.
    setLever('custom')
  }

  // The macros' own energy, against the calorie figure typed beside them. Not a
  // validation — a mismatch is allowed and sometimes deliberate — but the gap is
  // shown, because "1950" was five kcal wrong for months and nothing said so.
  const derived = atwaterKcal(draft.protein_goal_g, draft.carbs_goal_g, draft.fat_goal_g)
  const gap = derived - draft.calorie_goal
  const gapColor = Math.abs(gap) <= 5 ? EMERALD : Math.abs(gap) <= 50 ? GOLD : OXIDE

  return (
    <Surface variant="band" measure="grid" pad="snug" className="space-y-3">
      <div>
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-text">Targets</h2>
          {phaseBadge}
        </div>
        <p className="text-xs text-muted mt-0.5">
          Every goal in one place — the rung of the cut, or your own numbers.
          Nothing here applies until you save: these targets regrade the day, and
          they save straight onto the active plan and phase.
        </p>
      </div>

      {/* ── The rungs ── */}
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {LEVERS.map((l) => {
          const on = lever === l.id
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => pick(l.id)}
              aria-pressed={on}
              className="rounded-xl px-2.5 py-2 text-left transition-colors min-h-[52px]"
              style={{
                background: on ? 'rgba(212,175,55,0.10)' : 'rgba(255,255,255,0.035)',
                border: `1px solid ${on ? `${GOLD}66` : 'rgba(255,255,255,0.07)'}`,
              }}
            >
              <span className="block text-[11px] font-semibold" style={{ color: on ? GOLD : undefined }}>
                {l.label}
              </span>
              <span className="block helix-num text-[10px] text-muted tabular-nums">
                {l.calorieGoal} kcal · {(l.stepsGoal / 1000)}k
              </span>
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => setLever('custom')}
          aria-pressed={lever === 'custom'}
          className="rounded-xl px-2.5 py-2 text-left transition-colors min-h-[52px]"
          style={{
            background: lever === 'custom' ? 'rgba(212,175,55,0.10)' : 'rgba(255,255,255,0.035)',
            border: `1px solid ${lever === 'custom' ? `${GOLD}66` : 'rgba(255,255,255,0.07)'}`,
          }}
        >
          <span className="block text-[11px] font-semibold" style={{ color: lever === 'custom' ? GOLD : undefined }}>
            Custom
          </span>
          <span className="block text-[10px] text-muted">Your own numbers</span>
        </button>
      </div>

      <p className="text-[11px] text-muted leading-snug">
        {LEVERS.find((l) => l.id === lever)?.summary ?? 'Set every target by hand.'}
      </p>

      {/* ── The numbers ── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Field label="Calories" unit="kcal" value={draft.calorie_goal} onChange={(v) => edit('calorie_goal', v)} />
        <Field label="Protein" unit="g" value={draft.protein_goal_g} onChange={(v) => edit('protein_goal_g', v)} />
        <Field label="Carbs" unit="g" value={draft.carbs_goal_g} onChange={(v) => edit('carbs_goal_g', v)} />
        <Field label="Fat" unit="g" value={draft.fat_goal_g} onChange={(v) => edit('fat_goal_g', v)} />
        <Field label="Steps" unit="/day" value={draft.steps_goal} step={500} onChange={(v) => edit('steps_goal', v)} />
      </div>

      <p className="helix-num text-[11px] tabular-nums" style={{ color: gapColor }}>
        Macros total {derived} kcal
        {gap === 0 ? ' — exact.' : ` — ${gap > 0 ? '+' : '−'}${Math.abs(gap)} against the calorie target.`}
      </p>

      {/* ── Recovery & hydration ──
          Under the same Save button, above the same hairline, but visibly a
          separate group: no rung moves these, and a reader who has just watched
          four numbers change by clicking "Lever 2" needs to see where the rung's
          reach stops. */}
      <div className="pt-3 border-t border-white/[0.06]">
        <span className="block text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: MUTED }}>
          Recovery &amp; hydration
        </span>
        <div className="grid grid-cols-3 gap-2">
          <Field
            label="Sleep" unit="h" value={rec.sleep_goal_hours} step={0.5}
            onChange={(v) => setRec((r) => ({ ...r, sleep_goal_hours: v }))}
          />
          <Field
            label="Active" unit="kcal" value={rec.active_cal_goal} step={50}
            onChange={(v) => setRec((r) => ({ ...r, active_cal_goal: v }))}
          />
          <Field
            label="Water" unit="ml" value={rec.water_goal_ml} step={100}
            onChange={(v) => setRec((r) => ({ ...r, water_goal_ml: v }))}
          />
        </div>
        <p className="text-[11px] text-muted mt-2 leading-snug">
          Not part of a rung — picking a lever leaves these where you set them.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={() => void onSave(draft, rec, lever)}
          className="btn-primary min-h-[44px] px-4 justify-center disabled:opacity-40"
        >
          <Check className="w-4 h-4" aria-hidden="true" />
          {saving ? 'Saving…' : 'Save to plan'}
        </button>
        {/* A save writes these numbers onto the ACTIVE plan and phase, not into
            a floating preference. Saying which one is the difference between a
            button you trust and one you press twice to check. */}
        {planLabel && phaseLabel && (
          <span className="text-[11px] shrink-0" style={{ color: MUTED }}>
            → {planLabel} · {phaseLabel}
          </span>
        )}
        {dirty && (
          <button
            type="button"
            onClick={() => {
              setDraft(JSON.parse(currentKey) as PlanNumbers)
              setRec(JSON.parse(recKey) as RecoveryNumbers)
              setLever(activeLever ?? 'custom')
            }}
            className="min-h-[44px] px-3 rounded-xl text-xs text-muted hover:text-text flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> Revert
          </button>
        )}
        {!dirty && (
          <span className="text-[11px]" style={{ color: MUTED }}>No unsaved changes</span>
        )}
      </div>
    </Surface>
  )
}

/**
 * One staged number. `field-compact` and not a text size utility: a 16px font is
 * what stops iOS zooming the page on focus, and Tailwind's utilities layer
 * outranks the base rule that would otherwise enforce it.
 */
function Field({ label, unit, value, step = 1, onChange }: {
  label: string
  unit: string
  value: number
  step?: number
  onChange: (v: number) => void
}) {
  const [text, setText] = useState<string | null>(null)
  return (
    <label className="min-w-0">
      <span className="block text-[9px] font-bold uppercase tracking-widest text-muted mb-1">{label}</span>
      <span className="flex items-center gap-1 rounded-xl border border-white/[0.08] bg-white/[0.04] px-2 min-h-[40px]">
        <input
          type="number"
          inputMode="numeric"
          step={step}
          min={0}
          value={text ?? String(value)}
          onChange={(e) => {
            setText(e.target.value)
            const n = Number(e.target.value)
            // A fractional STEP means fractional values are the point: rounding
            // here turned a 7.5 h sleep target into 8 h the moment it was typed.
            // Whole-number fields still round, so a stray "1885.4" cannot reach
            // the calorie column.
            if (Number.isFinite(n) && n >= 0) onChange(step < 1 ? n : Math.round(n))
          }}
          onBlur={() => setText(null)}
          className="helix-num w-full bg-transparent field-compact font-bold text-text tabular-nums outline-none min-w-0"
          aria-label={`${label} target in ${unit}`}
        />
        <span className="text-[10px] text-muted shrink-0">{unit}</span>
      </span>
    </label>
  )
}
